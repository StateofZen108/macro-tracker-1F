import { randomBytes } from 'node:crypto'

import {
  decryptGarminSecret,
  encryptGarminTokenBundle,
  readGarminTokenKeyRingFromEnv,
  type GarminTokenKeyRing,
} from './crypto'
import { buildGarminPkceChallenge, createGarminProviderAdapter, GarminProviderError } from './provider'
import {
  createGarminConnectionRecord,
  consumeGarminAuthSession,
  createGarminStateStore,
  getGarminConnectionRecord,
  getGarminAuthSession,
  listGarminWellnessEntries,
  removeGarminConnectionRecord,
  removeGarminAuthSessionsForUser,
  saveGarminAuthSession,
  saveGarminConnectionRecord,
  saveGarminWellnessEntries,
  type GarminStateStore,
} from './store'
import type {
  GarminAuthSession,
  GarminConnectionRecord,
  GarminProviderAdapter,
  GarminProviderSyncResponse,
  GarminWellnessEntry,
  GarminStatusResponse,
  GarminSyncResult,
  GarminTokenBundle,
} from './types'

const INITIAL_BACKFILL_DAYS = 30
const INCREMENTAL_OVERLAP_DAYS = 3
const STALE_THRESHOLD_MS = 72 * 60 * 60 * 1000
const SESSION_TTL_MS = 15 * 60 * 1000
const REFRESH_WINDOW_MS = 10 * 60 * 1000
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
  return randomBytes(16).toString('base64url')
}

function buildDefaultConnection(userId: string, now: Date): GarminConnectionRecord {
  return createGarminConnectionRecord(userId, now)
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

function ensureProviderReady(provider: GarminProviderAdapter): GarminProviderAdapter {
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

export function createGarminService(options: GarminServiceOptions = {}) {
  const store = options.store ?? createGarminStateStore()
  const provider = options.provider ?? createGarminProviderAdapter()
  const tokenKeyRing = options.tokenKeyRing ?? readGarminTokenKeyRingFromEnv()
  const now = options.now ?? (() => new Date())
  const redirectUriFromOptions = options.redirectUri?.trim() || undefined
  const scope = options.scope?.trim() || process.env.GARMIN_OAUTH_SCOPE?.trim() || 'read'

  function resolveRedirectUri(explicitRedirectUri?: string): string {
    const redirectUri = explicitRedirectUri?.trim() || redirectUriFromOptions || process.env.GARMIN_REDIRECT_URI?.trim()
    if (!redirectUri) {
      throw new GarminServiceError(
        'garminRedirectUriUnavailable',
        'Garmin redirect URI is not configured for this environment.',
        503,
      )
    }

    return redirectUri
  }

  async function createConnectionSession(
    userId: string,
    redirectUri?: string,
  ): Promise<GarminConnectSessionResult> {
    const currentTime = now()
    const connection = normalizeConnectionForResponse(
      (await getGarminConnectionRecord(store, userId)) ?? buildDefaultConnection(userId, currentTime),
      currentTime,
    )
    const challenge = buildGarminPkceChallenge()
    const state = createStateToken()
    const session: GarminAuthSession = {
      state,
      userId,
      codeVerifier: challenge.codeVerifier,
      redirectUri: resolveRedirectUri(redirectUri),
      createdAt: currentTime.toISOString(),
      expiresAt: new Date(currentTime.getTime() + SESSION_TTL_MS).toISOString(),
    }

    await saveGarminAuthSession(store, session)
    const authorizationUrl = ensureProviderReady(provider).buildAuthorizationUrl({
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
    const session = await consumeGarminAuthSession(store, input.state)
    if (!session) {
      throw new GarminServiceError('garminSessionExpired', 'The Garmin authorization session expired.', 400)
    }

    if (new Date(session.expiresAt).getTime() <= currentTime.getTime()) {
      throw new GarminServiceError('garminSessionExpired', 'The Garmin authorization session expired.', 400)
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

    return {
      connection: nextConnection,
      staleData: nextConnection.staleData,
      lastSyncWindow: nextConnection.lastSyncWindow,
    }
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
    const nextConnection: GarminConnectionRecord = {
      ...connection,
      status: 'connected',
      updatedAt: currentTime.toISOString(),
      retryAfterAt: undefined,
      failureCount: 0,
      accessToken: encryptedTokens.accessToken,
      refreshToken: encryptedTokens.refreshToken,
      tokenExpiresAt: tokenBundle.expiresAt,
      lastErrorMessage: undefined,
    }

    await saveGarminConnectionRecord(store, nextConnection)

    return {
      connection: nextConnection,
      tokenBundle,
    }
  }

  async function syncConnection(userId: string): Promise<GarminSyncResult> {
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
        currentConnection.status === 'rate_limited' ? 429 : 429,
      )
    }

    const providerAdapter = ensureProviderReady(provider)
    const keyRing = ensureTokenKeyRing(tokenKeyRing)
    let accessToken = decryptGarminSecret(currentConnection.accessToken, keyRing)
    let nextConnection = currentConnection
    if (shouldRefreshToken(currentConnection, currentTime)) {
      const refreshed = await refreshAccessToken(currentConnection, currentTime)
      nextConnection = refreshed.connection
      accessToken = refreshed.tokenBundle.accessToken
    }

    const initialBackfill = !nextConnection.lastSuccessfulSyncAt
    const endDate = toDateOnly(currentTime)
    const startDate = initialBackfill
      ? shiftDate(endDate, -INITIAL_BACKFILL_DAYS)
      : shiftDate(toDateOnly(new Date(nextConnection.lastSuccessfulSyncAt ?? currentTime.toISOString())), -INCREMENTAL_OVERLAP_DAYS)

    const response = cloneWellnessResponse(
      await providerAdapter.fetchWellnessData({
        accessToken,
        startDate,
        endDate,
        healthCursor: nextConnection.lastWatermarks.health,
        activityCursor: nextConnection.lastWatermarks.activity,
      }),
    )

    if (response.rateLimitedUntil) {
      const retryAfterAt = response.rateLimitedUntil
      const updatedConnection: GarminConnectionRecord = {
        ...nextConnection,
        status: 'rate_limited',
        updatedAt: currentTime.toISOString(),
        retryAfterAt,
        failureCount: nextConnection.failureCount + 1,
        lastErrorMessage: 'Garmin sync was rate limited.',
        staleData: isStale(nextConnection.lastSuccessfulSyncAt, currentTime),
        lastSyncWindow: {
          startDate,
          endDate,
        },
      }

      await saveGarminConnectionRecord(store, updatedConnection)
      throw new GarminServiceError('garminRateLimited', 'Garmin sync was rate limited.', 429)
    }

    const mergedWellness = mergeWellnessEntries(
      await listGarminWellnessEntries(store, userId),
      response.wellnessEntries,
    )
    await saveGarminWellnessEntries(store, userId, mergedWellness)

    nextConnection = {
      ...nextConnection,
      status: 'connected',
      updatedAt: currentTime.toISOString(),
      lastSuccessfulSyncAt: currentTime.toISOString(),
      retryAfterAt: undefined,
      failureCount: 0,
      lastWatermarks: {
        health: response.nextHealthCursor ?? nextConnection.lastWatermarks.health,
        activity: response.nextActivityCursor ?? nextConnection.lastWatermarks.activity,
      },
      staleData: false,
      lastSyncWindow: {
        startDate,
        endDate,
      },
      lastErrorMessage: undefined,
    }

    await saveGarminConnectionRecord(store, nextConnection)

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

  async function handleSyncError(
    userId: string,
    error: unknown,
  ): Promise<never> {
    const currentTime = now()
    if (error instanceof GarminServiceError) {
      throw error
    }

    const connection = normalizeConnectionForResponse(
      await getGarminConnectionRecord(store, userId),
      currentTime,
    )
    if (error instanceof GarminProviderError) {
      if (error.status === 401 || error.status === 403) {
        const updatedConnection: GarminConnectionRecord = {
          ...connection,
          status: 'reconnect_required',
          updatedAt: currentTime.toISOString(),
          retryAfterAt: undefined,
          failureCount: connection.failureCount + 1,
          lastErrorMessage: error.message,
          staleData: isStale(connection.lastSuccessfulSyncAt, currentTime),
        }
        await saveGarminConnectionRecord(store, updatedConnection)
        throw new GarminServiceError('garminReconnectRequired', error.message, 409)
      }

      if (error.status === 429) {
        const retryAfterAt = new Date(currentTime.getTime() + 6 * 60 * 60 * 1000).toISOString()
        const updatedConnection: GarminConnectionRecord = {
          ...connection,
          status: 'rate_limited',
          updatedAt: currentTime.toISOString(),
          retryAfterAt,
          failureCount: connection.failureCount + 1,
          lastErrorMessage: error.message,
          staleData: isStale(connection.lastSuccessfulSyncAt, currentTime),
        }
        await saveGarminConnectionRecord(store, updatedConnection)
        throw new GarminServiceError('garminRateLimited', error.message, 429)
      }
    }

    const failureCount = connection.failureCount + 1
    const retryAfterAt = new Date(
      currentTime.getTime() + getBackoffDelay(failureCount),
    ).toISOString()
    const updatedConnection: GarminConnectionRecord = {
      ...connection,
      status: 'error',
      updatedAt: currentTime.toISOString(),
      retryAfterAt,
      failureCount,
      lastErrorMessage: error instanceof Error ? error.message : 'Garmin sync failed.',
      staleData: isStale(connection.lastSuccessfulSyncAt, currentTime),
    }

    await saveGarminConnectionRecord(store, updatedConnection)
    throw new GarminServiceError(
      'garminSyncFailed',
      error instanceof Error ? error.message : 'Garmin sync failed.',
      502,
    )
  }

  async function syncConnectionWithErrorHandling(userId: string): Promise<GarminSyncResult> {
    try {
      return await syncConnection(userId)
    } catch (error) {
      return handleSyncError(userId, error)
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
    }

    await saveGarminConnectionRecord(store, nextConnection)
    await removeGarminAuthSessionsForUser(store, userId)
    return nextConnection
  }

  return {
    createConnectionSession,
    completeConnectionFromCallback,
    getConnectionStatus,
    syncConnection: syncConnectionWithErrorHandling,
    disconnectConnection,
    getSession: (state: string) => getGarminAuthSession(store, state),
    getWellnessEntries: (userId: string) => listGarminWellnessEntries(store, userId),
    saveConnection: (record: GarminConnectionRecord) => saveGarminConnectionRecord(store, record),
    saveAuthSession: (session: GarminAuthSession) => saveGarminAuthSession(store, session),
    removeConnection: (userId: string) => removeGarminConnectionRecord(store, userId),
  }
}

let defaultGarminService: ReturnType<typeof createGarminService> | null = null

export function getGarminService(): ReturnType<typeof createGarminService> {
  if (!defaultGarminService) {
    defaultGarminService = createGarminService()
  }

  return defaultGarminService
}

function mergeWellnessEntries(
  existing: GarminWellnessEntry[],
  incoming: GarminProviderSyncResponse['wellnessEntries'],
): GarminWellnessEntry[] {
  const merged = new Map<string, GarminWellnessEntry>()
  for (const entry of [...existing, ...incoming]) {
    const current = merged.get(entry.date)
    if (!current || current.updatedAt <= entry.updatedAt) {
      merged.set(entry.date, entry)
    }
  }

  return [...merged.values()].sort((left, right) => right.date.localeCompare(left.date))
}
