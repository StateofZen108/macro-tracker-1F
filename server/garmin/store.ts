import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseServiceClient } from '../sync/supabase.js'
import type {
  GarminAuthSession,
  GarminConnectionRecord,
  GarminSecretEnvelope,
  GarminSyncActor,
  GarminWellnessEntry,
} from './types.js'

export interface GarminStateDocument {
  version: 1
  connections: Record<string, GarminConnectionRecord>
  sessions: Record<string, GarminAuthSession>
  wellnessEntries: Record<string, GarminWellnessEntry[]>
}

export type GarminStateStoreKind = 'memory' | 'file' | 'supabase'

interface LocalGarminStateStore {
  kind: 'memory' | 'file'
  load(): Promise<GarminStateDocument>
  save(next: GarminStateDocument): Promise<void>
  update(
    mutator: (
      current: GarminStateDocument,
    ) => GarminStateDocument | Promise<GarminStateDocument>,
  ): Promise<GarminStateDocument>
}

interface SupabaseGarminStateStore {
  kind: 'supabase'
  client: SupabaseClient
}

export type GarminStateStore = LocalGarminStateStore | SupabaseGarminStateStore

interface FileGarminStateStoreOptions {
  stateDir?: string | null
  fileName?: string
  initialState?: Partial<GarminStateDocument>
}

interface GarminConnectionRow {
  user_id: string
  status: GarminConnectionRecord['status']
  created_at: string
  updated_at: string
  connected_at: string | null
  last_successful_sync_at: string | null
  retry_after_at: string | null
  failure_count: number
  last_watermarks_json: Record<string, unknown> | null
  access_token_json: GarminSecretEnvelope | null
  refresh_token_json: GarminSecretEnvelope | null
  token_expires_at: string | null
  pending_state: string | null
  stale_data: boolean
  last_sync_window_start_date: string | null
  last_sync_window_end_date: string | null
  last_error_message: string | null
  sync_lease_id: string | null
  sync_lease_expires_at: string | null
  last_sync_actor: GarminSyncActor | null
}

interface GarminAuthSessionRow {
  state: string
  user_id: string
  code_verifier: string
  redirect_uri: string
  return_to_url: string | null
  created_at: string
  expires_at: string
}

interface GarminSyncLeaseInput {
  userId: string
  leaseId: string
  leaseExpiresAt: string
  actor: GarminSyncActor
  now?: string
}

interface GarminSyncApplySuccessInput {
  userId: string
  leaseId: string
  connection: GarminConnectionRecord
  records: GarminWellnessEntry[]
  actor: GarminSyncActor
}

interface GarminSyncApplyFailureInput {
  userId: string
  leaseId: string
  connection: GarminConnectionRecord
}

function isLocalStore(store: GarminStateStore): store is LocalGarminStateStore {
  return store.kind === 'memory' || store.kind === 'file'
}

function cloneState(document: GarminStateDocument): GarminStateDocument {
  return {
    version: 1,
    connections: structuredClone(document.connections),
    sessions: structuredClone(document.sessions),
    wellnessEntries: structuredClone(document.wellnessEntries),
  }
}

function normalizeStateDocument(
  document: Partial<GarminStateDocument> | null | undefined,
): GarminStateDocument {
  return {
    version: 1,
    connections: structuredClone(document?.connections ?? {}),
    sessions: structuredClone(document?.sessions ?? {}),
    wellnessEntries: structuredClone(document?.wellnessEntries ?? {}),
  }
}

function normalizeWellnessEntries(entries: GarminWellnessEntry[]): GarminWellnessEntry[] {
  const normalized = new Map<string, GarminWellnessEntry>()
  for (const entry of entries) {
    const existing = normalized.get(entry.date)
    if (!existing || existing.updatedAt <= entry.updatedAt) {
      normalized.set(entry.date, structuredClone(entry))
    }
  }

  return [...normalized.values()].sort((left, right) => right.date.localeCompare(left.date))
}

function createMemoryGarminStateStore(
  initialState?: Partial<GarminStateDocument>,
): GarminStateStore {
  let state = normalizeStateDocument(initialState)

  return {
    kind: 'memory',
    async load() {
      return cloneState(state)
    },
    async save(next) {
      state = cloneState(normalizeStateDocument(next))
    },
    async update(mutator) {
      const next = normalizeStateDocument(await mutator(cloneState(state)))
      state = cloneState(next)
      return cloneState(state)
    },
  }
}

function createFileGarminStateStore(options: {
  stateDir: string
  fileName: string
  initialState?: Partial<GarminStateDocument>
}): GarminStateStore {
  const filePath = join(options.stateDir, options.fileName)
  let loadedState: GarminStateDocument | null = null
  const initialState = normalizeStateDocument(options.initialState)

  async function readState(): Promise<GarminStateDocument> {
    if (loadedState) {
      return cloneState(loadedState)
    }

    try {
      const raw = await readFile(filePath, 'utf8')
      loadedState = normalizeStateDocument(JSON.parse(raw) as Partial<GarminStateDocument>)
    } catch {
      loadedState = cloneState(initialState)
    }

    return cloneState(loadedState ?? initialState)
  }

  async function writeState(next: GarminStateDocument): Promise<void> {
    loadedState = cloneState(normalizeStateDocument(next))
    await mkdir(dirname(filePath), { recursive: true })
    const tempFilePath = `${filePath}.tmp`
    await writeFile(tempFilePath, `${JSON.stringify(loadedState, null, 2)}\n`, 'utf8')
    await rename(tempFilePath, filePath)
  }

  return {
    kind: 'file',
    load: readState,
    save: writeState,
    async update(mutator) {
      const current = await readState()
      const next = normalizeStateDocument(await mutator(cloneState(current)))
      await writeState(next)
      return cloneState(next)
    },
  }
}

function createSupabaseGarminStateStore(client: SupabaseClient): GarminStateStore {
  return {
    kind: 'supabase',
    client,
  }
}

export function createGarminStateStore(
  options: FileGarminStateStoreOptions = {},
): GarminStateStore {
  const stateDir = options.stateDir ?? process.env.GARMIN_STATE_DIR?.trim() ?? null
  const fileName = options.fileName ?? 'garmin-state.json'

  if (stateDir) {
    return createFileGarminStateStore({
      stateDir,
      fileName,
      initialState: options.initialState,
    })
  }

  const supabase = getSupabaseServiceClient()
  if (supabase) {
    return createSupabaseGarminStateStore(supabase)
  }

  return createMemoryGarminStateStore(options.initialState)
}

export function getGarminStateStoreKind(store: GarminStateStore): GarminStateStoreKind {
  return store.kind
}

export function isGarminPersistentStateStore(store: GarminStateStore): boolean {
  return store.kind !== 'memory'
}

function normalizeGarminSecretEnvelope(
  value: unknown,
): GarminSecretEnvelope | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const record = value as Record<string, unknown>
  if (
    typeof record.keyId !== 'string' ||
    typeof record.iv !== 'string' ||
    typeof record.authTag !== 'string' ||
    typeof record.ciphertext !== 'string' ||
    typeof record.expiresAt !== 'string'
  ) {
    return undefined
  }

  return {
    keyId: record.keyId,
    iv: record.iv,
    authTag: record.authTag,
    ciphertext: record.ciphertext,
    expiresAt: record.expiresAt,
    algorithm: record.algorithm === 'aes-256-gcm' ? 'aes-256-gcm' : 'aes-256-gcm',
  }
}

function connectionRowToRecord(row: GarminConnectionRow): GarminConnectionRecord {
  return {
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectedAt: row.connected_at ?? undefined,
    lastSuccessfulSyncAt: row.last_successful_sync_at ?? undefined,
    retryAfterAt: row.retry_after_at ?? undefined,
    failureCount: row.failure_count ?? 0,
    lastWatermarks: {
      health:
        typeof row.last_watermarks_json?.health === 'string'
          ? row.last_watermarks_json.health
          : undefined,
      activity:
        typeof row.last_watermarks_json?.activity === 'string'
          ? row.last_watermarks_json.activity
          : undefined,
    },
    accessToken: normalizeGarminSecretEnvelope(row.access_token_json),
    refreshToken: normalizeGarminSecretEnvelope(row.refresh_token_json),
    tokenExpiresAt: row.token_expires_at ?? undefined,
    pendingState: row.pending_state ?? undefined,
    staleData: Boolean(row.stale_data),
    lastSyncWindow:
      row.last_sync_window_start_date && row.last_sync_window_end_date
        ? {
            startDate: row.last_sync_window_start_date,
            endDate: row.last_sync_window_end_date,
          }
        : undefined,
    lastErrorMessage: row.last_error_message ?? undefined,
    syncLeaseId: row.sync_lease_id ?? undefined,
    syncLeaseExpiresAt: row.sync_lease_expires_at ?? undefined,
    lastSyncActor: row.last_sync_actor ?? undefined,
  }
}

function connectionRecordToRow(record: GarminConnectionRecord): GarminConnectionRow {
  return {
    user_id: record.userId,
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    connected_at: record.connectedAt ?? null,
    last_successful_sync_at: record.lastSuccessfulSyncAt ?? null,
    retry_after_at: record.retryAfterAt ?? null,
    failure_count: record.failureCount,
    last_watermarks_json: {
      health: record.lastWatermarks.health ?? null,
      activity: record.lastWatermarks.activity ?? null,
    },
    access_token_json: record.accessToken ?? null,
    refresh_token_json: record.refreshToken ?? null,
    token_expires_at: record.tokenExpiresAt ?? null,
    pending_state: record.pendingState ?? null,
    stale_data: record.staleData,
    last_sync_window_start_date: record.lastSyncWindow?.startDate ?? null,
    last_sync_window_end_date: record.lastSyncWindow?.endDate ?? null,
    last_error_message: record.lastErrorMessage ?? null,
    sync_lease_id: record.syncLeaseId ?? null,
    sync_lease_expires_at: record.syncLeaseExpiresAt ?? null,
    last_sync_actor: record.lastSyncActor ?? null,
  }
}

function authSessionRowToRecord(row: GarminAuthSessionRow): GarminAuthSession {
  return {
    state: row.state,
    userId: row.user_id,
    codeVerifier: row.code_verifier,
    redirectUri: row.redirect_uri,
    returnToUrl: row.return_to_url ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

function authSessionRecordToRow(session: GarminAuthSession): GarminAuthSessionRow {
  return {
    state: session.state,
    user_id: session.userId,
    code_verifier: session.codeVerifier,
    redirect_uri: session.redirectUri,
    return_to_url: session.returnToUrl ?? null,
    created_at: session.createdAt,
    expires_at: session.expiresAt,
  }
}

function wellnessRowToEntry(row: { payload_json: Record<string, unknown> }): GarminWellnessEntry {
  return structuredClone(row.payload_json as unknown as GarminWellnessEntry)
}

async function claimNextSyncServerVersion(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('claim_sync_server_version')
  if (error || typeof data !== 'number') {
    throw new Error(error?.message ?? 'Unable to claim the next sync server version.')
  }

  return data
}

export function createGarminConnectionRecord(
  userId: string,
  now: Date = new Date(),
): GarminConnectionRecord {
  const timestamp = now.toISOString()

  return {
    userId,
    status: 'not_connected',
    createdAt: timestamp,
    updatedAt: timestamp,
    failureCount: 0,
    lastWatermarks: {},
    staleData: false,
  }
}

export async function getGarminConnectionRecord(
  store: GarminStateStore,
  userId: string,
): Promise<GarminConnectionRecord> {
  if (isLocalStore(store)) {
    const state = await store.load()
    return state.connections[userId] ?? createGarminConnectionRecord(userId)
  }

  const { data, error } = await store.client
    .from('garmin_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? connectionRowToRecord(data as GarminConnectionRow) : createGarminConnectionRecord(userId)
}

export async function listGarminConnectionRecords(
  store: GarminStateStore,
): Promise<GarminConnectionRecord[]> {
  if (isLocalStore(store)) {
    const state = await store.load()
    return Object.values(state.connections).map((record) => structuredClone(record))
  }

  const { data, error } = await store.client.from('garmin_connections').select('*')
  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => connectionRowToRecord(row as GarminConnectionRow))
}

export async function saveGarminConnectionRecord(
  store: GarminStateStore,
  record: GarminConnectionRecord,
): Promise<GarminConnectionRecord> {
  if (isLocalStore(store)) {
    await store.update(async (current) => {
      const next = cloneState(current)
      next.connections[record.userId] = structuredClone(record)
      return next
    })

    return record
  }

  const { error } = await store.client
    .from('garmin_connections')
    .upsert(connectionRecordToRow(record), { onConflict: 'user_id' })

  if (error) {
    throw new Error(error.message)
  }

  return record
}

export async function removeGarminConnectionRecord(
  store: GarminStateStore,
  userId: string,
): Promise<void> {
  if (isLocalStore(store)) {
    await store.update(async (current) => {
      const next = cloneState(current)
      delete next.connections[userId]
      delete next.wellnessEntries[userId]
      for (const [stateKey, session] of Object.entries(next.sessions)) {
        if (session.userId === userId) {
          delete next.sessions[stateKey]
        }
      }
      return next
    })
    return
  }

  const sessionDelete = await store.client.from('garmin_auth_sessions').delete().eq('user_id', userId)
  if (sessionDelete.error) {
    throw new Error(sessionDelete.error.message)
  }

  const connectionDelete = await store.client.from('garmin_connections').delete().eq('user_id', userId)
  if (connectionDelete.error) {
    throw new Error(connectionDelete.error.message)
  }
}

export async function removeGarminAuthSessionsForUser(
  store: GarminStateStore,
  userId: string,
): Promise<void> {
  if (isLocalStore(store)) {
    await store.update(async (current) => {
      const next = cloneState(current)
      for (const [stateKey, session] of Object.entries(next.sessions)) {
        if (session.userId === userId) {
          delete next.sessions[stateKey]
        }
      }
      return next
    })
    return
  }

  const { error } = await store.client.from('garmin_auth_sessions').delete().eq('user_id', userId)
  if (error) {
    throw new Error(error.message)
  }
}

export async function saveGarminAuthSession(
  store: GarminStateStore,
  session: GarminAuthSession,
): Promise<GarminAuthSession> {
  if (isLocalStore(store)) {
    await store.update(async (current) => {
      const next = cloneState(current)
      next.sessions[session.state] = structuredClone(session)
      return next
    })

    return session
  }

  const { error } = await store.client
    .from('garmin_auth_sessions')
    .upsert(authSessionRecordToRow(session), { onConflict: 'state' })

  if (error) {
    throw new Error(error.message)
  }

  return session
}

export async function consumeGarminAuthSession(
  store: GarminStateStore,
  state: string,
): Promise<GarminAuthSession | null> {
  if (isLocalStore(store)) {
    let consumedSession: GarminAuthSession | null = null
    await store.update(async (current) => {
      const next = cloneState(current)
      consumedSession = next.sessions[state] ? structuredClone(next.sessions[state]) : null
      delete next.sessions[state]
      return next
    })

    return consumedSession
  }

  const { data, error } = await store.client
    .from('garmin_auth_sessions')
    .select('*')
    .eq('state', state)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  const deleteResult = await store.client.from('garmin_auth_sessions').delete().eq('state', state)
  if (deleteResult.error) {
    throw new Error(deleteResult.error.message)
  }

  return authSessionRowToRecord(data as GarminAuthSessionRow)
}

export async function getGarminAuthSession(
  store: GarminStateStore,
  state: string,
): Promise<GarminAuthSession | null> {
  if (isLocalStore(store)) {
    const stateDocument = await store.load()
    return stateDocument.sessions[state] ?? null
  }

  const { data, error } = await store.client
    .from('garmin_auth_sessions')
    .select('*')
    .eq('state', state)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? authSessionRowToRecord(data as GarminAuthSessionRow) : null
}

export async function listGarminWellnessEntries(
  store: GarminStateStore,
  userId: string,
): Promise<GarminWellnessEntry[]> {
  if (isLocalStore(store)) {
    const state = await store.load()
    return [...(state.wellnessEntries[userId] ?? [])]
  }

  const { data, error } = await store.client
    .from('sync_records')
    .select('payload_json')
    .eq('user_id', userId)
    .eq('scope', 'wellness')
    .like('record_id', 'garmin:%')

  if (error) {
    throw new Error(error.message)
  }

  return normalizeWellnessEntries(
    (data ?? []).map((row) => wellnessRowToEntry(row as { payload_json: Record<string, unknown> })),
  )
}

export async function saveGarminWellnessEntries(
  store: GarminStateStore,
  userId: string,
  entries: GarminWellnessEntry[],
): Promise<GarminWellnessEntry[]> {
  const normalized = normalizeWellnessEntries(entries)

  if (isLocalStore(store)) {
    await store.update(async (current) => {
      const next = cloneState(current)
      next.wellnessEntries[userId] = normalizeWellnessEntries([
        ...(next.wellnessEntries[userId] ?? []),
        ...normalized,
      ])
      return next
    })

    return normalized
  }

  for (const entry of normalized) {
    const serverVersion = await claimNextSyncServerVersion(store.client)
    const serverUpdatedAt = entry.updatedAt
    const upsertResult = await store.client.from('sync_records').upsert(
      {
        user_id: userId,
        scope: 'wellness',
        record_id: `${entry.provider}:${entry.date}`,
        payload_json: entry,
        deleted_at: entry.deletedAt ?? null,
        server_version: serverVersion,
        server_updated_at: serverUpdatedAt,
        last_mutation_id: randomUUID(),
        last_device_id: 'garmin-store',
      },
      { onConflict: 'user_id,scope,record_id' },
    )

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message)
    }
  }

  return normalized
}

export async function claimGarminSyncLease(
  store: GarminStateStore,
  input: GarminSyncLeaseInput,
): Promise<GarminConnectionRecord | null> {
  if (isLocalStore(store)) {
    let claimedConnection: GarminConnectionRecord | null = null
    await store.update(async (current) => {
      const next = cloneState(current)
      const existing = next.connections[input.userId] ?? createGarminConnectionRecord(input.userId)
      const leaseExpiresAt = existing.syncLeaseExpiresAt
        ? new Date(existing.syncLeaseExpiresAt).getTime()
        : 0
      const nowTimestamp = new Date(input.now ?? new Date().toISOString()).getTime()
      if (existing.syncLeaseId && leaseExpiresAt > nowTimestamp) {
        claimedConnection = null
        return next
      }

      claimedConnection = {
        ...existing,
        status: 'syncing',
        updatedAt: input.now ?? new Date().toISOString(),
        syncLeaseId: input.leaseId,
        syncLeaseExpiresAt: input.leaseExpiresAt,
        lastSyncActor: input.actor,
      }
      next.connections[input.userId] = structuredClone(claimedConnection)
      return next
    })

    return claimedConnection
  }

  const { data, error } = await store.client.rpc('claim_garmin_sync_lease', {
    p_user_id: input.userId,
    p_lease_id: input.leaseId,
    p_lease_expires_at: input.leaseExpiresAt,
    p_actor: input.actor,
    p_now: input.now ?? new Date().toISOString(),
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  return connectionRowToRecord(data as GarminConnectionRow)
}

export async function applyGarminSyncSuccess(
  store: GarminStateStore,
  input: GarminSyncApplySuccessInput,
): Promise<boolean> {
  if (isLocalStore(store)) {
    const current = await getGarminConnectionRecord(store, input.userId)
    if (current.syncLeaseId !== input.leaseId) {
      return false
    }

    await saveGarminWellnessEntries(store, input.userId, [
      ...(await listGarminWellnessEntries(store, input.userId)),
      ...input.records,
    ])
    await saveGarminConnectionRecord(store, {
      ...input.connection,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
      lastSyncActor: input.actor,
    })
    return true
  }

  const { data, error } = await store.client.rpc('apply_garmin_sync_success', {
    p_user_id: input.userId,
    p_lease_id: input.leaseId,
    p_connection: connectionRecordToRow({
      ...input.connection,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
      lastSyncActor: input.actor,
    }),
    p_records: input.records,
    p_actor: input.actor,
  })

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}

export async function applyGarminSyncFailure(
  store: GarminStateStore,
  input: GarminSyncApplyFailureInput,
): Promise<boolean> {
  if (isLocalStore(store)) {
    const current = await getGarminConnectionRecord(store, input.userId)
    if (current.syncLeaseId !== input.leaseId) {
      return false
    }

    await saveGarminConnectionRecord(store, {
      ...input.connection,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
    })
    return true
  }

  const { data, error } = await store.client.rpc('apply_garmin_sync_failure', {
    p_user_id: input.userId,
    p_lease_id: input.leaseId,
    p_connection: connectionRecordToRow({
      ...input.connection,
      syncLeaseId: undefined,
      syncLeaseExpiresAt: undefined,
    }),
  })

  if (error) {
    throw new Error(error.message)
  }

  return Boolean(data)
}
