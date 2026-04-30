import { randomUUID } from 'node:crypto'

import {
  decryptGarminSecret,
  encryptGarminTokenBundle,
  readGarminTokenKeyRingFromEnv,
  type GarminTokenKeyRing,
} from './crypto.js'
import {
  buildGarminPkceChallenge,
  createGarminProviderAdapter,
  GarminProviderError,
  isGarminProviderConfigured,
} from './provider.js'
import {
  applyGarminSyncFailure,
  applyGarminSyncSuccess,
  claimGarminSyncLease,
  consumeGarminAuthSession,
  createGarminStateStore,
  getGarminAuthSession,
  getGarminConnectionRecord,
  isGarminPersistentStateStore,
  listGarminConnectionRecords,
  listGarminWellnessEntries,
  removeGarminAuthSessionsForUser,
  saveGarminAuthSession,
  saveGarminConnectionRecord,
  type GarminStateStore,
} from './store.js'
import type {
  GarminAuthSession,
  GarminAutomationMode,
  GarminBackgroundSyncResponse,
  GarminConnectionRecord,
  GarminProviderAdapter,
  GarminProviderSyncResponse,
  GarminStatusResponse,
  GarminSyncActor,
  GarminSyncResult,
  GarminTokenBundle,
  GarminWellnessEntry,
} from './types.js'

const INITIAL_BACKFILL_DAYS = 30
const INCREMENTAL_OVERLAP_DAYS = 3
const STALE_THRESHOLD_MS = 72 * 60 * 60 * 1000
const BACKGROUND_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000
const SESSION_TTL_MS = 15 * 60 * 1000
const REFRESH_WINDOW_MS = 10 * 60 * 1000
const LEASE_DURATION_MS = 10 * 60 * 1000
const TRANSIENT_BACKOFF_MS = [30 * 60 * 1000, 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000]

export class GarminServiceError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status = 502) {
    super(message)
    this.name = 'GarminServiceError'
    this.code = code
    this.status = status
  }
}

export interface GarminConnectSessionResult {
  authorizationUrl: string
  state: string
  expiresAt: string
  connection: GarminConnectionRecord
}

export interface GarminServiceOptions {
  store?: GarminStateStore
  provider?: GarminProviderAdapter
  tokenKeyRing?: GarminTokenKeyRing | null
  now?: () => Date
  redirectUri?: string
  scope?: string
  backgroundSyncEnabled?: boolean
  backgroundSyncSecret?: string | null
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDate(dateOnly: string, deltaDays: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return toDateOnly(date)
}

function isStale(lastSuccessfulSyncAt: string | undefined, now: Date): boolean {
  if (!lastSuccessfulSyncAt) {
    return false
  }

  return now.getTime() - new Date(lastSuccessfulSyncAt).getTime() >= STALE_THRESHOLD_MS
}

function createStateToken(): string {
  return randomUUID()
}

function parseTokenExpiry(expiresAt?: string): number {
  if (!expiresAt) {
    return 0
  }

  const timestamp = new Date(expiresAt).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function shouldRefreshToken(connection: GarminConnectionRecord, now: Date): boolean {
  if (!connection.tokenExpiresAt) {
    return false
  }

  return parseTokenExpiry(connection.tokenExpiresAt) - now.getTime() <= REFRESH_WINDOW_MS
}

function getBackoffDelay(failureCount: number): number {
  const index = Math.min(Math.max(failureCount - 1, 0), TRANSIENT_BACKOFF_MS.length - 1)
  return TRANSIENT_BACKOFF_MS[index] ?? TRANSIENT_BACKOFF_MS[TRANSIENT_BACKOFF_MS.length - 1]
}

function cloneWellnessResponse(response: GarminProviderSyncResponse): GarminProviderSyncResponse {
  return {
    wellnessEntries: response.wellnessEntries.map((entry) => ({ ...entry })),
    nextHealthCursor: response.nextHealthCursor,
    nextActivityCursor: response.nextActivityCursor,
    rateLimitedUntil: response.rateLimitedUntil,
  }
}

function ensureTokenKeyRing(tokenKeyRing: GarminTokenKeyRing | null): GarminTokenKeyRing {
  if (!tokenKeyRing) {
    throw new GarminServiceError(
      'garminTokenKeysUnavailable',
      'Garmin token encryption keys are not configured for this environment.',
      503,
    )
  }

  return tokenKeyRing
}

function ensureProviderReady(provider: GarminProviderAdapter | null): GarminProviderAdapter {
  if (!provider) {
    throw new GarminServiceError(
      'garminProviderUnavailable',
      'Garmin Connect credentials are not configured for this environment.',
      503,
    )
  }

  return provider
}

function normalizeConnectionForResponse(
  connection: GarminConnectionRecord,
  now: Date,
): GarminConnectionRecord {
  return {
    ...connection,
    staleData: isStale(connection.lastSuccessfulSyncAt, now),
  }
}

function readBooleanEnv(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'on'
}

function isGarminBackgroundSyncDue(connection: GarminConnectionRecord, now: Date): boolean {
  const retryAfterAt = connection.retryAfterAt ? new Date(connection.retryAfterAt).getTime() : 0
  const leaseExpiresAt = connection.syncLeaseExpiresAt
    ? new Date(connection.syncLeaseExpiresAt).getTime()
    : 0
  const lastSuccessfulSyncAt = connection.lastSuccessfulSyncAt
    ? new Date(connection.lastSuccessfulSyncAt).getTime()
    : 0

  if (!connection.accessToken || !connection.refreshToken) {
    return false
  }

  if (
    connection.status !== 'connected' &&
    connection.status !== 'error' &&
    connection.status !== 'rate_limited'
  ) {
    return false
  }

  if (retryAfterAt > now.getTime()) {
    return false
  }

  if (connection.syncLeaseId && leaseExpiresAt > now.getTime()) {
    return false
  }

  if (!connection.lastSuccessfulSyncAt) {
    return true
  }

  return now.getTime() - lastSuccessfulSyncAt >= BACKGROUND_SYNC_INTERVAL_MS
}

export function createGarminService(options: GarminServiceOptions = {}) {
  const store = options.store ?? createGarminStateStore()
  const provider = options.provider ?? (isGarminProviderConfigured() ? createGarminProviderAdapter() : null)
  const tokenKeyRing = options.tokenKeyRing ?? readGarminTokenKeyRingFromEnv()
  const now = options.now ?? (() => new Date())
  const redirectUriFromOptions = options.redirectUri?.trim() || undefined
  const scope = options.scope?.trim() || process.env.GARMIN_OAUTH_SCOPE?.trim() || 'read'
  const providerConfigured = Boolean((options.provider ?? provider) && tokenKeyRing)
  const persistentStoreConfigured = isGarminPersistentStateStore(store)
  const backgroundAutomationEnabled = Boolean(
    readBooleanEnv(
      options.backgroundSyncEnabled ?? process.env.GARMIN_BACKGROUND_SYNC_ENABLED,
    ) &&
      (options.backgroundSyncSecret?.trim() || process.env.GARMIN_BACKGROUND_SYNC_SECRET?.trim()),
  )
  const automationMode: GarminAutomationMode | undefined = backgroundAutomationEnabled
    ? 'server_background'
    : undefined

  function resolveRedirectUri(explicitRedirectUri?: string): string {
    const redirectUri =
      explicitRedirectUri?.trim() ||
      redirectUriFromOptions ||
      process.env.GARMIN_REDIRECT_URI?.trim()
    if (!redirectUri) {
      throw new GarminServiceError(
        'garminRedirectUriUnavailable',
        'Garmin redirect URI is not configured for this environment.',
        503,
      )
    }

    return redirectUri
  }

  function buildStatusResponse(
    connection: GarminConnectionRecord,
    currentTime: Date,
  ): GarminStatusResponse {
    const nextConnection = normalizeConnectionForResponse(connection, currentTime)

    return {
      connection: nextConnection,
      staleData: nextConnection.staleData,
      lastSyncWindow: nextConnection.lastSyncWindow,
      providerConfigured,
      persistentStoreConfigured,
      backgroundAutomationEnabled,
      automationMode,
    }
  }

  async function createConnectionSession(
    userId: string,
    redirectUri?: string,
    returnToUrl?: string,
  ): Promise<GarminConnectSessionResult> {
    const currentTime = now()
    const connection = normalizeConnectionForResponse(
      await getGarminConnectionRecord(store, userId),
      currentTime,
    )
    const providerAdapter = ensureProviderReady(provider)
    const challenge = buildGarminPkceChallenge()
    const state = createStateToken()
    const session: GarminAuthSession = {
      state,
      userId,
      codeVerifier: challenge.codeVerifier,
      redirectUri: resolveRedirectUri(redirectUri),
      returnToUrl: returnToUrl?.trim() || undefined,
      createdAt: currentTime.toISOString(),
      expiresAt: new Date(currentTime.getTime() + SESSION_TTL_MS).toISOString(),
    }

    await saveGarminAuthSession(store, session)
    const authorizationUrl = providerAdapter.buildAuthorizationUrl({
      userId,
      state,
      codeChallenge: challenge.codeChallenge,
      codeChallengeMethod: challenge.codeChallengeMethod,
      redirectUri: session.redirectUri,
      scope,
    })

    return {
      authorizationUrl,
      state,
      expiresAt: session.expiresAt,
      connection,
    }
  }

  async function completeConnectionFromCallback(input: {
    state: string
    code: string
  }): Promise<GarminConnectionRecord> {
    const currentTime = now()
    const session = await saveAndConsumeSession(input.state)
    if (!session) {
      throw new GarminServiceError(
        'garminSessionExpired',
        'The Garmin authorization session expired.',
        400,
      )
    }

    if (new Date(session.expiresAt).getTime() <= currentTime.getTime()) {
      throw new GarminServiceError(
        'garminSessionExpired',
        'The Garmin authorization session expired.',
        400,
      )
    }

    const providerAdapter = ensureProviderReady(provider)
    const tokenBundle = await providerAdapter.exchangeCodeForTokens({
      code: input.code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
    })
    const keyRing = ensureTokenKeyRing(tokenKeyRing)
    const encryptedTokens = encryptGarminTokenBundle(tokenBundle, keyRing)

    const existing = await getGarminConnectionRecord(store, session.userId)
    const nextConnection: GarminConnectionRecord = {
      ...existing,
      userId: session.userId,
      status: 'connected',
      createdAt: existing.createdAt ?? currentTime.toISOString(),
      updatedAt: currentTime.toISOString(),
      connectedAt: existing.connectedAt ?? currentTime.toISOString(),
      lastSuccessfulSyncAt: existing.lastSuccessfulSyncAt,
      retryAfterAt: undefined,
      failureCount: 0,
      lastWatermarks: existing.lastWatermarks ?? {},
      accessToken: encryptedTokens.accessToken,
      refreshToken: encryptedTokens.refreshToken,
      tokenExpiresAt: tokenBundle.expiresAt,
      pendingState: undefined,
      staleData: isStale(existing.lastSuccessfulSyncAt, currentTime),
      lastSyncWindow: existing.lastSyncWindow,
      lastErrorMessage: undefined,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
      lastSyncActor: undefined,
    }

    await saveGarminConnectionRecord(store, nextConnection)
    return normalizeConnectionForResponse(nextConnection, currentTime)
  }

  async function getConnectionStatus(userId: string): Promise<GarminStatusResponse> {
    const currentTime = now()
    const connection = await getGarminConnectionRecord(store, userId)
    const nextConnection = normalizeConnectionForResponse(connection, currentTime)
    if (nextConnection.staleData !== connection.staleData) {
      await saveGarminConnectionRecord(store, nextConnection)
    }

    return buildStatusResponse(nextConnection, currentTime)
  }

  async function refreshAccessToken(
    connection: GarminConnectionRecord,
    currentTime: Date,
  ): Promise<{
    connection: GarminConnectionRecord
    tokenBundle: GarminTokenBundle
  }> {
    if (!connection.refreshToken) {
      throw new GarminServiceError(
        'garminReconnectRequired',
        'Garmin reconnect is required before new data can sync.',
        409,
      )
    }

    const keyRing = ensureTokenKeyRing(tokenKeyRing)
    const tokenBundle = await ensureProviderReady(provider).refreshAccessToken({
      refreshToken: decryptGarminSecret(connection.refreshToken, keyRing),
    })

    const encryptedTokens = encryptGarminTokenBundle(tokenBundle, keyRing)
    return {
      connection: {
        ...connection,
        updatedAt: currentTime.toISOString(),
        retryAfterAt: undefined,
        failureCount: 0,
        accessToken: encryptedTokens.accessToken,
        refreshToken: encryptedTokens.refreshToken,
        tokenExpiresAt: tokenBundle.expiresAt,
        lastErrorMessage: undefined,
      },
      tokenBundle,
    }
  }

  async function persistSuccessfulSync(
    userId: string,
    leaseId: string,
    connection: GarminConnectionRecord,
    records: GarminWellnessEntry[],
    actor: GarminSyncActor,
  ): Promise<void> {
    const applied = await applyGarminSyncSuccess(store, {
      userId,
      leaseId,
      connection,
      records,
      actor,
    })

    if (!applied) {
      throw new GarminServiceError(
        'garminSyncLeaseLost',
        'Garmin sync no longer owns the user lease.',
        409,
      )
    }
  }

  async function persistFailedSync(
    userId: string,
    leaseId: string,
    connection: GarminConnectionRecord,
  ): Promise<void> {
    const applied = await applyGarminSyncFailure(store, {
      userId,
      leaseId,
      connection,
    })

    if (!applied) {
      throw new GarminServiceError(
        'garminSyncLeaseLost',
        'Garmin sync no longer owns the user lease.',
        409,
      )
    }
  }

  async function handleSyncError(
    userId: string,
    leaseId: string,
    connection: GarminConnectionRecord,
    currentTime: Date,
    error: unknown,
    syncWindow?: GarminConnectionRecord['lastSyncWindow'],
  ): Promise<never> {
    if (error instanceof GarminServiceError) {
      throw error
    }

    const nextBaseConnection = normalizeConnectionForResponse(
      await getGarminConnectionRecord(store, userId),
      currentTime,
    )
    const baseConnection: GarminConnectionRecord = {
      ...nextBaseConnection,
      accessToken: connection.accessToken ?? nextBaseConnection.accessToken,
      refreshToken: connection.refreshToken ?? nextBaseConnection.refreshToken,
      tokenExpiresAt: connection.tokenExpiresAt ?? nextBaseConnection.tokenExpiresAt,
      lastWatermarks: connection.lastWatermarks ?? nextBaseConnection.lastWatermarks,
      lastSyncActor: connection.lastSyncActor,
      lastSyncWindow: syncWindow ?? connection.lastSyncWindow ?? nextBaseConnection.lastSyncWindow,
    }

    if (error instanceof GarminProviderError) {
      if (error.status === 401 || error.status === 403) {
        const updatedConnection: GarminConnectionRecord = {
          ...baseConnection,
          status: 'reconnect_required',
          updatedAt: currentTime.toISOString(),
          retryAfterAt: undefined,
          failureCount: baseConnection.failureCount + 1,
          lastErrorMessage: error.message,
          staleData: isStale(baseConnection.lastSuccessfulSyncAt, currentTime),
        }
        await persistFailedSync(userId, leaseId, updatedConnection)
        throw new GarminServiceError('garminReconnectRequired', error.message, 409)
      }

      if (error.status === 429) {
        const retryAfterAt = new Date(currentTime.getTime() + 6 * 60 * 60 * 1000).toISOString()
        const updatedConnection: GarminConnectionRecord = {
          ...baseConnection,
          status: 'rate_limited',
          updatedAt: currentTime.toISOString(),
          retryAfterAt,
          failureCount: baseConnection.failureCount + 1,
          lastErrorMessage: error.message,
          staleData: isStale(baseConnection.lastSuccessfulSyncAt, currentTime),
        }
        await persistFailedSync(userId, leaseId, updatedConnection)
        throw new GarminServiceError('garminRateLimited', error.message, 429)
      }
    }

    const failureCount = baseConnection.failureCount + 1
    const retryAfterAt = new Date(currentTime.getTime() + getBackoffDelay(failureCount)).toISOString()
    const updatedConnection: GarminConnectionRecord = {
      ...baseConnection,
      status: 'error',
      updatedAt: currentTime.toISOString(),
      retryAfterAt,
      failureCount,
      lastErrorMessage: error instanceof Error ? error.message : 'Garmin sync failed.',
      staleData: isStale(baseConnection.lastSuccessfulSyncAt, currentTime),
    }

    await persistFailedSync(userId, leaseId, updatedConnection)
    throw new GarminServiceError(
      'garminSyncFailed',
      error instanceof Error ? error.message : 'Garmin sync failed.',
      502,
    )
  }

  async function syncConnection(
    userId: string,
    actor: GarminSyncActor = 'manual',
  ): Promise<GarminSyncResult> {
    const currentTime = now()
    const currentConnection = normalizeConnectionForResponse(
      await getGarminConnectionRecord(store, userId),
      currentTime,
    )

    if (currentConnection.status === 'not_connected' || !currentConnection.accessToken) {
      throw new GarminServiceError(
        'garminNotConnected',
        'Garmin is not connected for this user.',
        409,
      )
    }

    if (currentConnection.status === 'reconnect_required') {
      throw new GarminServiceError(
        'garminReconnectRequired',
        'Garmin reconnect is required before syncing again.',
        409,
      )
    }

    if (
      currentConnection.retryAfterAt &&
      new Date(currentConnection.retryAfterAt).getTime() > currentTime.getTime()
    ) {
      throw new GarminServiceError(
        currentConnection.status === 'rate_limited' ? 'garminRateLimited' : 'garminBackoffActive',
        `Garmin sync is temporarily unavailable until ${currentConnection.retryAfterAt}.`,
        429,
      )
    }

    const leaseId = randomUUID()
    const leaseExpiresAt = new Date(currentTime.getTime() + LEASE_DURATION_MS).toISOString()
    const claimedConnection = await claimGarminSyncLease(store, {
      userId,
      leaseId,
      leaseExpiresAt,
      actor,
      now: currentTime.toISOString(),
    })

    if (!claimedConnection) {
      throw new GarminServiceError(
        'garminSyncLeaseConflict',
        'Garmin sync is already running for this user.',
        409,
      )
    }

    let workingConnection = claimedConnection
    const keyRing = ensureTokenKeyRing(tokenKeyRing)
    if (!workingConnection.accessToken) {
      throw new GarminServiceError(
        'garminNotConnected',
        'Garmin is not connected for this user.',
        409,
      )
    }

    let accessToken = decryptGarminSecret(workingConnection.accessToken, keyRing)
    if (shouldRefreshToken(workingConnection, currentTime)) {
      try {
        const refreshed = await refreshAccessToken(workingConnection, currentTime)
        workingConnection = {
          ...refreshed.connection,
          status: 'syncing',
          syncLeaseId: leaseId,
          syncLeaseExpiresAt: leaseExpiresAt,
          lastSyncActor: actor,
        }
        accessToken = refreshed.tokenBundle.accessToken
      } catch (error) {
        return handleSyncError(userId, leaseId, workingConnection, currentTime, error)
      }
    }

    const initialBackfill = !workingConnection.lastSuccessfulSyncAt
    const endDate = toDateOnly(currentTime)
    const startDate = initialBackfill
      ? shiftDate(endDate, -INITIAL_BACKFILL_DAYS)
      : shiftDate(
          toDateOnly(new Date(workingConnection.lastSuccessfulSyncAt ?? currentTime.toISOString())),
          -INCREMENTAL_OVERLAP_DAYS,
        )
    const syncWindow = { startDate, endDate }

    let response: GarminProviderSyncResponse
    try {
      response = cloneWellnessResponse(
        await ensureProviderReady(provider).fetchWellnessData({
          accessToken,
          startDate,
          endDate,
          healthCursor: workingConnection.lastWatermarks.health,
          activityCursor: workingConnection.lastWatermarks.activity,
        }),
      )
    } catch (error) {
      return handleSyncError(userId, leaseId, workingConnection, currentTime, error, syncWindow)
    }

    if (response.rateLimitedUntil) {
      const updatedConnection: GarminConnectionRecord = {
        ...workingConnection,
        status: 'rate_limited',
        updatedAt: currentTime.toISOString(),
        retryAfterAt: response.rateLimitedUntil,
        failureCount: workingConnection.failureCount + 1,
        lastErrorMessage: 'Garmin sync was rate limited.',
        staleData: isStale(workingConnection.lastSuccessfulSyncAt, currentTime),
        lastSyncWindow: syncWindow,
      }
      await persistFailedSync(userId, leaseId, updatedConnection)
      throw new GarminServiceError('garminRateLimited', 'Garmin sync was rate limited.', 429)
    }

    const nextConnection: GarminConnectionRecord = {
      ...workingConnection,
      status: 'connected',
      updatedAt: currentTime.toISOString(),
      lastSuccessfulSyncAt: currentTime.toISOString(),
      retryAfterAt: undefined,
      failureCount: 0,
      lastWatermarks: {
        health: response.nextHealthCursor ?? workingConnection.lastWatermarks.health,
        activity: response.nextActivityCursor ?? workingConnection.lastWatermarks.activity,
      },
      staleData: false,
      lastSyncWindow: syncWindow,
      lastErrorMessage: undefined,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
      lastSyncActor: actor,
    }

    await persistSuccessfulSync(userId, leaseId, nextConnection, response.wellnessEntries, actor)

    return {
      records: response.wellnessEntries,
      connection: nextConnection,
      window: {
        startDate,
        endDate,
        initialBackfill,
      },
    }
  }

  async function runBackgroundSync(): Promise<GarminBackgroundSyncResponse> {
    if (!providerConfigured) {
      throw new GarminServiceError(
        'garminProviderUnavailable',
        'Garmin Connect credentials are not configured for this environment.',
        503,
      )
    }

    if (!persistentStoreConfigured) {
      throw new GarminServiceError(
        'garminPersistentStoreUnavailable',
        'Garmin background sync requires a durable server-side store.',
        503,
      )
    }

    if (!backgroundAutomationEnabled) {
      throw new GarminServiceError(
        'garminBackgroundSyncDisabled',
        'Garmin background automation is not enabled for this environment.',
        503,
      )
    }

    const startedAt = now()
    const connections = await listGarminConnectionRecords(store)
    let syncedUsers = 0
    let skippedUsers = 0
    let failedUsers = 0

    for (const connection of connections) {
      const normalizedConnection = normalizeConnectionForResponse(connection, startedAt)
      if (!isGarminBackgroundSyncDue(normalizedConnection, startedAt)) {
        skippedUsers += 1
        continue
      }

      try {
        await syncConnection(connection.userId, 'background')
        syncedUsers += 1
      } catch (error) {
        if (
          error instanceof GarminServiceError &&
          (error.code === 'garminSyncLeaseConflict' ||
            error.code === 'garminSyncLeaseLost' ||
            error.code === 'garminNotConnected')
        ) {
          skippedUsers += 1
          continue
        }

        failedUsers += 1
      }
    }

    const finishedAt = now()

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      scannedUsers: connections.length,
      syncedUsers,
      skippedUsers,
      failedUsers,
    }
  }

  async function disconnectConnection(userId: string): Promise<GarminConnectionRecord> {
    const currentTime = now()
    const currentConnection = await getGarminConnectionRecord(store, userId)
    const nextConnection: GarminConnectionRecord = {
      ...currentConnection,
      status: 'not_connected',
      updatedAt: currentTime.toISOString(),
      retryAfterAt: undefined,
      failureCount: 0,
      accessToken: undefined,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
      lastWatermarks: {},
      pendingState: undefined,
      staleData: false,
      lastSyncWindow: undefined,
      lastErrorMessage: undefined,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
      lastSyncActor: undefined,
    }

    await saveGarminConnectionRecord(store, nextConnection)
    await removeGarminAuthSessionsForUser(store, userId)
    return nextConnection
  }

  async function saveAndConsumeSession(state: string): Promise<GarminAuthSession | null> {
    const session = await getGarminAuthSession(store, state)
    if (!session) {
      return null
    }

    return consumeGarminAuthSession(store, state)
  }

  return {
    createConnectionSession,
    completeConnectionFromCallback,
    getConnectionStatus,
    syncConnection,
    runBackgroundSync,
    disconnectConnection,
    getSession: (state: string) => getGarminAuthSession(store, state),
    getWellnessEntries: (userId: string) => listGarminWellnessEntries(store, userId),
    saveConnection: (record: GarminConnectionRecord) => saveGarminConnectionRecord(store, record),
    saveAuthSession: (session: GarminAuthSession) => saveGarminAuthSession(store, session),
    removeConnection: (userId: string) => disconnectConnection(userId),
  }
}

let defaultGarminService: ReturnType<typeof createGarminService> | null = null

export function getGarminService(): ReturnType<typeof createGarminService> {
  if (!defaultGarminService) {
    defaultGarminService = createGarminService()
  }

  return defaultGarminService
}
