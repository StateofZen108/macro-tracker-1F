import type { SyncDeadLetterItem, SyncMutation, SyncScope, SyncState, SyncStatus } from '../../types'
import { recordDiagnosticsEvent } from '../diagnostics'
import { loadPersistedSyncSnapshot, persistSyncSnapshot } from '../persistence/appDb'

const SYNC_STORAGE_KEYS = {
  state: 'mt_sync_state',
  queue: 'mt_sync_queue',
  deadLetter: 'mt_sync_dead_letter',
  deviceId: 'mt_device_id',
} as const

const SYNC_CHANNEL_NAME = 'macrotracker-sync'
const SYNC_CHANNEL_SOURCE =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `macrotracker-sync-${Date.now()}`

type SyncListener = () => void
type SyncPersistenceMode = 'indexeddb' | 'legacy'

const syncListeners = new Set<SyncListener>()
let syncChannel: BroadcastChannel | null = null
let syncBound = false
let syncInitialized = false
let syncInitPromise: Promise<void> | null = null
let syncPersistenceMode: SyncPersistenceMode = 'legacy'
let syncPersistChain = Promise.resolve()

let cachedDeviceId = ''
let cachedStateSnapshot: SyncState | null = null
let cachedQueueSnapshot: SyncMutation[] = []
let cachedDeadLetterSnapshot: SyncDeadLetterItem[] = []

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function notifySyncListeners(): void {
  for (const listener of syncListeners) {
    listener()
  }
}

function broadcastSyncChange(): void {
  syncChannel?.postMessage({
    type: 'sync-updated',
    source: SYNC_CHANNEL_SOURCE,
  })
}

function emitSyncChange(): void {
  notifySyncListeners()
  broadcastSyncChange()
}

function readLegacyStorageValue(key: string): string | null {
  if (!canUseStorage()) {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLegacyJson(key: string, value: unknown): void {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

function readLegacyDeviceId(): string {
  if (!canUseStorage()) {
    return 'macrotracker-device-unavailable'
  }

  const existingValue = window.localStorage.getItem(SYNC_STORAGE_KEYS.deviceId)
  if (existingValue?.trim()) {
    return existingValue
  }

  const deviceId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `macrotracker-device-${Date.now()}`
  window.localStorage.setItem(SYNC_STORAGE_KEYS.deviceId, deviceId)
  return deviceId
}

function getDefaultStatus(): SyncStatus {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offlineChangesPending'
  }

  return 'signedOut'
}

function normalizeMutation(value: unknown): SyncMutation | null {
  if (!isRecord(value)) {
    return null
  }

  const mutationId = typeof value.mutationId === 'string' && value.mutationId.trim()
    ? value.mutationId
    : null
  const scope = typeof value.scope === 'string' && value.scope.trim()
    ? (value.scope as SyncScope)
    : null
  const recordId = typeof value.recordId === 'string' && value.recordId.trim()
    ? value.recordId
    : null
  const operation =
    value.operation === 'delete' || value.operation === 'upsert' ? value.operation : null
  const queuedAt = typeof value.queuedAt === 'string' && value.queuedAt.trim()
    ? value.queuedAt
    : null

  if (!mutationId || !scope || !recordId || !operation || !queuedAt) {
    return null
  }

  return {
    mutationId,
    scope,
    recordId,
    operation,
    payload: isRecord(value.payload) ? value.payload : null,
    baseServerVersion:
      typeof value.baseServerVersion === 'number' && Number.isFinite(value.baseServerVersion)
        ? value.baseServerVersion
        : null,
    queuedAt,
    attemptCount:
      typeof value.attemptCount === 'number' && Number.isFinite(value.attemptCount)
        ? Math.max(0, Math.round(value.attemptCount))
        : 0,
    lastAttemptAt:
      typeof value.lastAttemptAt === 'string' && value.lastAttemptAt.trim()
        ? value.lastAttemptAt
        : null,
  }
}

function normalizeDeadLetter(value: unknown): SyncDeadLetterItem | null {
  if (!isRecord(value)) {
    return null
  }

  const mutation = normalizeMutation(value.mutation)
  const code = typeof value.code === 'string' && value.code.trim() ? value.code : null
  const message = typeof value.message === 'string' && value.message.trim() ? value.message : null
  const movedAt = typeof value.movedAt === 'string' && value.movedAt.trim() ? value.movedAt : null
  if (!mutation || !code || !message || !movedAt) {
    return null
  }

  return {
    mutation,
    code,
    message,
    movedAt,
  }
}

function buildDefaultState(deviceId: string): SyncState {
  return {
    status: getDefaultStatus(),
    deviceId,
    pendingMutationCount: 0,
    deadLetterCount: 0,
    consecutiveFailures: 0,
    highWatermark: 0,
    recordVersions: {},
    localRecordUpdatedAt: {},
  }
}

function normalizeState(value: unknown, queue: SyncMutation[], deadLetters: SyncDeadLetterItem[], deviceId: string): SyncState {
  const fallback = buildDefaultState(deviceId)
  if (!isRecord(value)) {
    return {
      ...fallback,
      pendingMutationCount: queue.length,
      deadLetterCount: deadLetters.length,
    }
  }

  return {
    status:
      value.status === 'notConfigured' ||
      value.status === 'authenticating' ||
      value.status === 'bootstrapRequired' ||
      value.status === 'syncing' ||
      value.status === 'upToDate' ||
      value.status === 'offlineChangesPending' ||
      value.status === 'error' ||
      value.status === 'reauthRequired' ||
      value.status === 'signedOut'
        ? value.status
        : fallback.status,
    deviceId,
    pendingMutationCount: queue.length,
    deadLetterCount: deadLetters.length,
    consecutiveFailures:
      typeof value.consecutiveFailures === 'number' && Number.isFinite(value.consecutiveFailures)
        ? Math.max(0, Math.round(value.consecutiveFailures))
        : 0,
    highWatermark:
      typeof value.highWatermark === 'number' && Number.isFinite(value.highWatermark)
        ? Math.max(0, Math.round(value.highWatermark))
        : 0,
    bootstrapCompletedForUserId:
      typeof value.bootstrapCompletedForUserId === 'string' && value.bootstrapCompletedForUserId.trim()
        ? value.bootstrapCompletedForUserId
        : undefined,
    currentUserId:
      typeof value.currentUserId === 'string' && value.currentUserId.trim()
        ? value.currentUserId
        : undefined,
    lastSyncedAt:
      typeof value.lastSyncedAt === 'string' && value.lastSyncedAt.trim()
        ? value.lastSyncedAt
        : undefined,
    lastSyncError:
      typeof value.lastSyncError === 'string' && value.lastSyncError.trim()
        ? value.lastSyncError
        : undefined,
    blockingMessage:
      typeof value.blockingMessage === 'string' && value.blockingMessage.trim()
        ? value.blockingMessage
        : undefined,
    authEmail:
      typeof value.authEmail === 'string' && value.authEmail.trim() ? value.authEmail : undefined,
    recordVersions: isRecord(value.recordVersions)
      ? Object.fromEntries(
          Object.entries(value.recordVersions).flatMap(([key, version]) =>
            typeof version === 'number' && Number.isFinite(version) ? [[key, version]] : [],
          ),
        )
      : {},
    localRecordUpdatedAt: isRecord(value.localRecordUpdatedAt)
      ? Object.fromEntries(
          Object.entries(value.localRecordUpdatedAt).flatMap(([key, updatedAt]) =>
            typeof updatedAt === 'string' && updatedAt.trim() ? [[key, updatedAt]] : [],
          ),
        )
      : {},
  }
}

function parseLegacyArray<T>(key: string, normalize: (value: unknown) => T | null): T[] {
  const rawValue = readLegacyStorageValue(key)
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown[]
    return Array.isArray(parsed) ? parsed.map(normalize).filter((value): value is T => value !== null) : []
  } catch {
    return []
  }
}

function hydrateFromLegacyStorage(): void {
  cachedDeviceId = readLegacyDeviceId()
  cachedQueueSnapshot = parseLegacyArray(SYNC_STORAGE_KEYS.queue, normalizeMutation)
  cachedDeadLetterSnapshot = parseLegacyArray(SYNC_STORAGE_KEYS.deadLetter, normalizeDeadLetter)

  let parsedState: unknown = null
  const rawState = readLegacyStorageValue(SYNC_STORAGE_KEYS.state)
  if (rawState) {
    try {
      parsedState = JSON.parse(rawState)
    } catch {
      parsedState = null
    }
  }

  cachedStateSnapshot = normalizeState(
    parsedState,
    cachedQueueSnapshot,
    cachedDeadLetterSnapshot,
    cachedDeviceId,
  )
  syncInitialized = true
}

async function hydrateFromIndexedDb(): Promise<boolean> {
  const persistedSnapshot = await loadPersistedSyncSnapshot()
  if (!persistedSnapshot) {
    return false
  }

  cachedDeviceId = persistedSnapshot.deviceId?.trim() || readLegacyDeviceId()
  cachedQueueSnapshot = persistedSnapshot.queue
  cachedDeadLetterSnapshot = persistedSnapshot.deadLetters
  cachedStateSnapshot = normalizeState(
    persistedSnapshot.state,
    cachedQueueSnapshot,
    cachedDeadLetterSnapshot,
    cachedDeviceId,
  )
  syncInitialized = true
  return Boolean(persistedSnapshot.state || persistedSnapshot.queue.length || persistedSnapshot.deadLetters.length)
}

async function persistCurrentSnapshot(): Promise<void> {
  const snapshot = {
    deviceId: cachedDeviceId,
    state: cachedStateSnapshot,
    queue: cachedQueueSnapshot,
    deadLetters: cachedDeadLetterSnapshot,
  }

  if (syncPersistenceMode === 'legacy') {
    if (canUseStorage()) {
      window.localStorage.setItem(SYNC_STORAGE_KEYS.deviceId, cachedDeviceId)
      writeLegacyJson(SYNC_STORAGE_KEYS.state, cachedStateSnapshot)
      writeLegacyJson(SYNC_STORAGE_KEYS.queue, cachedQueueSnapshot)
      writeLegacyJson(SYNC_STORAGE_KEYS.deadLetter, cachedDeadLetterSnapshot)
    }
    return
  }

  const persisted = await persistSyncSnapshot(snapshot)
  if (!persisted) {
    syncPersistenceMode = 'legacy'
    await recordDiagnosticsEvent({
      eventType: 'sync_push_failed',
      severity: 'error',
      scope: 'diagnostics',
      message: 'Sync runtime persistence fell back to legacy storage after IndexedDB write failure.',
      payload: { reason: 'indexeddb-persist-failed' },
    })
    await persistCurrentSnapshot()
  }
}

function scheduleSyncPersist(): void {
  syncPersistChain = syncPersistChain
    .then(() => persistCurrentSnapshot())
    .catch(async (error) => {
      await recordDiagnosticsEvent({
        eventType: 'sync_push_failed',
        severity: 'error',
        scope: 'diagnostics',
        message: error instanceof Error ? error.message : 'Sync runtime persistence failed.',
      })
    })
}

async function refreshFromPersistence(): Promise<void> {
  if (syncPersistenceMode !== 'indexeddb') {
    hydrateFromLegacyStorage()
    return
  }

  const loaded = await hydrateFromIndexedDb()
  if (!loaded) {
    hydrateFromLegacyStorage()
    syncPersistenceMode = 'legacy'
  }
}

function ensureBound(): void {
  if (syncBound || typeof window === 'undefined') {
    return
  }

  syncBound = true
  window.addEventListener('storage', (event) => {
    if (
      syncPersistenceMode === 'legacy' &&
      (
        event.key === null ||
        event.key === SYNC_STORAGE_KEYS.state ||
        event.key === SYNC_STORAGE_KEYS.queue ||
        event.key === SYNC_STORAGE_KEYS.deadLetter ||
        event.key === SYNC_STORAGE_KEYS.deviceId
      )
    ) {
      hydrateFromLegacyStorage()
      notifySyncListeners()
    }
  })

  if (typeof BroadcastChannel !== 'undefined') {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME)
    syncChannel.addEventListener('message', (event: MessageEvent<{ type?: string; source?: string }>) => {
      if (event.data?.type === 'sync-updated' && event.data.source !== SYNC_CHANNEL_SOURCE) {
        void refreshFromPersistence().then(() => {
          notifySyncListeners()
        })
      }
    })
  }
}

function ensureInitialized(): void {
  ensureBound()
  if (!syncInitialized) {
    hydrateFromLegacyStorage()
  }
}

export async function initializeSyncPersistence(): Promise<void> {
  ensureBound()
  if (syncInitialized) {
    await refreshFromPersistence().catch(() => {
      hydrateFromLegacyStorage()
      syncPersistenceMode = 'legacy'
    })
    return
  }

  if (!syncInitPromise) {
    syncInitPromise = (async () => {
      const loadedFromIndexedDb = await hydrateFromIndexedDb().catch(() => false)
      if (loadedFromIndexedDb) {
        syncPersistenceMode = 'indexeddb'
        return
      }

      hydrateFromLegacyStorage()
      const migrated = await persistSyncSnapshot({
        deviceId: cachedDeviceId,
        state: cachedStateSnapshot,
        queue: cachedQueueSnapshot,
        deadLetters: cachedDeadLetterSnapshot,
      }).catch(() => false)

      syncPersistenceMode = migrated ? 'indexeddb' : 'legacy'
    })()
  }

  await syncInitPromise
}

export function subscribeToSyncStore(listener: SyncListener): () => void {
  ensureInitialized()
  syncListeners.add(listener)
  return () => {
    syncListeners.delete(listener)
  }
}

export function getDeviceId(): string {
  ensureInitialized()
  if (cachedDeviceId.trim()) {
    return cachedDeviceId
  }

  cachedDeviceId = readLegacyDeviceId()
  scheduleSyncPersist()
  return cachedDeviceId
}

export function loadSyncQueue(): SyncMutation[] {
  ensureInitialized()
  return cachedQueueSnapshot
}

export function loadSyncDeadLetters(): SyncDeadLetterItem[] {
  ensureInitialized()
  return cachedDeadLetterSnapshot
}

export function loadSyncState(): SyncState {
  ensureInitialized()
  if (!cachedStateSnapshot) {
    cachedStateSnapshot = buildDefaultState(getDeviceId())
  }
  return cachedStateSnapshot
}

function setSyncState(nextState: SyncState): void {
  cachedStateSnapshot = nextState
  scheduleSyncPersist()
  emitSyncChange()
}

export function writeSyncState(nextState: SyncState): void {
  setSyncState(nextState)
}

export function updateSyncState(updater: (currentState: SyncState) => SyncState): SyncState {
  const nextState = updater(loadSyncState())
  setSyncState(nextState)
  return nextState
}

export function getSyncRecordKey(scope: SyncScope, recordId: string): string {
  return `${scope}:${recordId}`
}

export function getStoredServerVersion(scope: SyncScope, recordId: string): number | null {
  const version = loadSyncState().recordVersions[getSyncRecordKey(scope, recordId)]
  return typeof version === 'number' && Number.isFinite(version) ? version : null
}

export function getLocalRecordUpdatedAt(scope: SyncScope, recordId: string): string | undefined {
  return loadSyncState().localRecordUpdatedAt?.[getSyncRecordKey(scope, recordId)]
}

export function isSyncEnabled(): boolean {
  return Boolean(loadSyncState().currentUserId)
}

export function saveSyncQueue(queue: SyncMutation[]): void {
  cachedQueueSnapshot = queue
  scheduleSyncPersist()
  updateSyncState((currentState) => ({
    ...currentState,
    pendingMutationCount: queue.length,
  }))
}

export function enqueueSyncMutation(
  scope: SyncScope,
  recordId: string,
  operation: SyncMutation['operation'],
  payload: Record<string, unknown> | null,
): void {
  if (!isSyncEnabled()) {
    return
  }

  const queue = loadSyncQueue().filter(
    (mutation) => !(mutation.scope === scope && mutation.recordId === recordId),
  )
  queue.push({
    mutationId: crypto.randomUUID(),
    scope,
    recordId,
    operation,
    payload,
    baseServerVersion: getStoredServerVersion(scope, recordId),
    queuedAt: new Date().toISOString(),
    attemptCount: 0,
    lastAttemptAt: null,
  })
  saveSyncQueue(queue)
}

export function touchLocalRecordUpdatedAt(scope: SyncScope, recordId: string, updatedAt: string): void {
  updateSyncState((currentState) => ({
    ...currentState,
    localRecordUpdatedAt: {
      ...(currentState.localRecordUpdatedAt ?? {}),
      [getSyncRecordKey(scope, recordId)]: updatedAt,
    },
  }))
}

export function markQueuedMutationAttempts(
  mutationIds: string[],
  lastAttemptAt = new Date().toISOString(),
): void {
  if (!mutationIds.length) {
    return
  }

  saveSyncQueue(
    loadSyncQueue().map((mutation) =>
      mutationIds.includes(mutation.mutationId)
        ? {
            ...mutation,
            attemptCount: mutation.attemptCount + 1,
            lastAttemptAt,
          }
        : mutation,
    ),
  )
}

export function removeQueuedMutations(mutationIds: string[]): void {
  if (!mutationIds.length) {
    return
  }

  saveSyncQueue(loadSyncQueue().filter((mutation) => !mutationIds.includes(mutation.mutationId)))
}

export function clearSyncDeadLetters(): void {
  cachedDeadLetterSnapshot = []
  scheduleSyncPersist()
  updateSyncState((currentState) => ({
    ...currentState,
    deadLetterCount: 0,
    blockingMessage: undefined,
  }))
}

export function moveMutationsToDeadLetter(
  mutationIds: string[],
  code: string,
  message: string,
): void {
  if (!mutationIds.length) {
    return
  }

  const queue = loadSyncQueue()
  const movedAt = new Date().toISOString()
  const movedMutations = queue.filter((mutation) => mutationIds.includes(mutation.mutationId))
  const nextQueue = queue.filter((mutation) => !mutationIds.includes(mutation.mutationId))
  cachedQueueSnapshot = nextQueue
  cachedDeadLetterSnapshot = cachedDeadLetterSnapshot.concat(
    movedMutations.map((mutation) => ({
      mutation,
      code,
      message,
      movedAt,
    })),
  )
  scheduleSyncPersist()
  void Promise.all(
    movedMutations.map((mutation) =>
      recordDiagnosticsEvent({
        eventType: 'sync_dead_letter_created',
        severity: 'error',
        scope: mutation.scope,
        recordKey: mutation.recordId,
        message,
        payload: {
          mutationId: mutation.mutationId,
          code,
        },
      }),
    ),
  )
  updateSyncState((currentState) => ({
    ...currentState,
    pendingMutationCount: nextQueue.length,
    deadLetterCount: cachedDeadLetterSnapshot.length,
    blockingMessage: message,
  }))
}

export function applySyncWatermark(
  highWatermark: number,
  applied: Array<{ scope: SyncScope; recordId: string; serverVersion: number }>,
): void {
  updateSyncState((currentState) => {
    const nextRecordVersions = { ...currentState.recordVersions }
    for (const record of applied) {
      nextRecordVersions[getSyncRecordKey(record.scope, record.recordId)] = record.serverVersion
    }

    return {
      ...currentState,
      highWatermark: Math.max(currentState.highWatermark, highWatermark),
      recordVersions: nextRecordVersions,
      localRecordUpdatedAt: {
        ...(currentState.localRecordUpdatedAt ?? {}),
        ...Object.fromEntries(
          applied.map((record) => [getSyncRecordKey(record.scope, record.recordId), new Date().toISOString()]),
        ),
      },
      pendingMutationCount: cachedQueueSnapshot.length,
      deadLetterCount: cachedDeadLetterSnapshot.length,
    }
  })
}

export function setSyncRuntimeStatus(
  status: SyncStatus,
  options?: {
    lastSyncedAt?: string
    lastSyncError?: string
    blockingMessage?: string
    consecutiveFailures?: number
  },
): void {
  updateSyncState((currentState) => ({
    ...currentState,
    status,
    lastSyncedAt: options?.lastSyncedAt ?? currentState.lastSyncedAt,
    lastSyncError: options?.lastSyncError,
    blockingMessage: options?.blockingMessage ?? currentState.blockingMessage,
    consecutiveFailures:
      options?.consecutiveFailures ?? currentState.consecutiveFailures,
  }))
}

export function setSyncUser(userId: string | undefined, authEmail?: string): void {
  updateSyncState((currentState) => {
    const switchingUsers = currentState.currentUserId && userId && currentState.currentUserId !== userId

    return {
      ...currentState,
      currentUserId: userId,
      authEmail,
      status: userId ? currentState.status : 'signedOut',
      highWatermark: switchingUsers ? 0 : currentState.highWatermark,
      recordVersions: switchingUsers ? {} : currentState.recordVersions,
      localRecordUpdatedAt: switchingUsers ? {} : currentState.localRecordUpdatedAt,
      bootstrapCompletedForUserId:
        switchingUsers ? undefined : currentState.bootstrapCompletedForUserId,
      lastSyncError: switchingUsers ? undefined : currentState.lastSyncError,
      blockingMessage: switchingUsers ? undefined : currentState.blockingMessage,
    }
  })
}

export function markBootstrapCompletedForUser(userId: string): void {
  updateSyncState((currentState) => ({
    ...currentState,
    bootstrapCompletedForUserId: userId,
  }))
}

export function resetSyncRuntimeForAccountSwitch(): void {
  cachedQueueSnapshot = []
  cachedDeadLetterSnapshot = []
  cachedStateSnapshot = {
    ...buildDefaultState(getDeviceId()),
    deviceId: getDeviceId(),
  }
  scheduleSyncPersist()
  emitSyncChange()
}
