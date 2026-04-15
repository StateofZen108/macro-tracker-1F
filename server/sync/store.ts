import type { BootstrapStatusSummary, SyncCounts, SyncPullResponse, SyncPushResponse, SyncRecordEnvelope, SyncScope } from '../../src/types.js'
import type { SyncRecordDraft } from '../../src/utils/sync/shared.js'
import { getSupabaseServiceClient } from './supabase.js'

interface SyncRecordRow {
  scope: SyncScope
  record_id: string
  payload_json: Record<string, unknown>
  deleted_at: string | null
  server_version: number
  server_updated_at: string
  last_mutation_id: string
  last_device_id: string
}

interface BootstrapCountRow {
  scope: SyncScope
  record_id: string
  payload_json?: {
    date?: string
  }
}

const SYNC_SCOPES: SyncScope[] = [
  'foods',
  'food_log_entries',
  'weights',
  'day_meta',
  'activity',
  'wellness',
  'recovery_check_ins',
  'diet_phases',
  'diet_phase_events',
  'interventions',
  'meal_templates',
  'recipes',
  'favorite_foods',
  'weekly_check_ins',
  'coach_decisions',
  'settings_targets',
  'settings_preferences',
  'settings_coaching_runtime',
]

function emptyCounts(): SyncCounts {
  return {
    foods: 0,
    logDays: 0,
    logEntries: 0,
    weights: 0,
    dayMeta: 0,
    activity: 0,
    wellness: 0,
    recoveryCheckIns: 0,
    dietPhases: 0,
    dietPhaseEvents: 0,
    interventions: 0,
    savedMeals: 0,
    recipes: 0,
    favoriteFoods: 0,
  }
}

export function buildBootstrapCounts(rows: BootstrapCountRow[]): SyncCounts {
  const counts = emptyCounts()
  const logDays = new Set<string>()

  for (const row of rows) {
    switch (row.scope) {
      case 'foods':
        counts.foods += 1
        break
      case 'food_log_entries':
        counts.logEntries += 1
        if (row.payload_json?.date) {
          logDays.add(row.payload_json.date)
        }
        break
      case 'weights':
        counts.weights += 1
        break
      case 'day_meta':
        counts.dayMeta += 1
        break
      case 'activity':
        counts.activity += 1
        break
      case 'wellness':
        counts.wellness += 1
        break
      case 'recovery_check_ins':
        counts.recoveryCheckIns += 1
        break
      case 'diet_phases':
        counts.dietPhases += 1
        break
      case 'diet_phase_events':
        counts.dietPhaseEvents += 1
        break
      case 'interventions':
        counts.interventions += 1
        break
      case 'meal_templates':
        counts.savedMeals += 1
        break
      case 'recipes':
        counts.recipes += 1
        break
      case 'favorite_foods':
        counts.favoriteFoods += 1
        break
      default:
        break
    }
  }

  counts.logDays = logDays.size
  return counts
}

export function buildBootstrapStatusSummary(
  rows: BootstrapCountRow[],
  bootstrapCompleted: boolean,
): BootstrapStatusSummary {
  const counts = buildBootstrapCounts(rows)

  return {
    localCounts: emptyCounts(),
    cloudCounts: counts,
    localEmpty: false,
    cloudEmpty: Object.values(counts).every((count) => count === 0),
    bootstrapCompleted,
  }
}

function toEnvelope(row: SyncRecordRow): SyncRecordEnvelope {
  return {
    scope: row.scope,
    recordId: row.record_id,
    payload: row.payload_json,
    deletedAt: row.deleted_at ?? undefined,
    serverVersion: row.server_version,
    serverUpdatedAt: row.server_updated_at,
  }
}

async function getNextServerVersion(): Promise<number> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new Error('Supabase sync credentials are not configured.')
  }

  const { data, error } = await supabase.rpc('claim_sync_server_version')
  if (error || typeof data !== 'number') {
    throw new Error(error?.message ?? 'Unable to claim the next sync server version.')
  }

  return data
}

function extractDeletedAt(
  scope: SyncScope,
  payload: Record<string, unknown> | null,
  explicitDeletedAt?: string | null,
): string | null {
  if (explicitDeletedAt) {
    return explicitDeletedAt
  }

  if (!payload) {
    return null
  }

  if (scope === 'foods') {
    return typeof payload.archivedAt === 'string' && payload.archivedAt.trim()
      ? payload.archivedAt
      : null
  }

  return typeof payload.deletedAt === 'string' && payload.deletedAt.trim()
    ? payload.deletedAt
    : null
}

export async function getBootstrapStatusForUser(userId: string): Promise<BootstrapStatusSummary> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new Error('Supabase sync credentials are not configured.')
  }

  const { data: rows, error } = await supabase
    .from('sync_records')
    .select('scope,record_id,payload_json')
    .eq('user_id', userId)
    .in('scope', SYNC_SCOPES)

  if (error) {
    throw new Error(error.message)
  }

  const { data: syncUser } = await supabase
    .from('sync_users')
    .select('bootstrap_completed_at')
    .eq('user_id', userId)
    .maybeSingle()

  return buildBootstrapStatusSummary(
    (rows ?? []) as BootstrapCountRow[],
    Boolean(syncUser?.bootstrap_completed_at),
  )
}

export async function getSyncRecordsAfterVersion(
  userId: string,
  afterVersion: number,
): Promise<SyncPullResponse> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new Error('Supabase sync credentials are not configured.')
  }

  const { data, error } = await supabase
    .from('sync_records')
    .select(
      'scope,record_id,payload_json,deleted_at,server_version,server_updated_at,last_mutation_id,last_device_id',
    )
    .eq('user_id', userId)
    .gt('server_version', afterVersion)
    .order('server_version', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const records = (data ?? []).map((row) => toEnvelope(row as SyncRecordRow))
  const highWatermark =
    records.length > 0 ? records[records.length - 1].serverVersion : afterVersion

  const { data: syncUser } = await supabase
    .from('sync_users')
    .select('bootstrap_completed_at')
    .eq('user_id', userId)
    .maybeSingle()

  return {
    records,
    highWatermark,
    bootstrapCompletedAt: syncUser?.bootstrap_completed_at ?? null,
  }
}

export async function pushUserMutations(
  userId: string,
  deviceId: string,
  mutations: Array<{
    mutationId: string
    scope: SyncScope
    recordId: string
    operation: 'upsert' | 'delete'
    payload: Record<string, unknown> | null
    baseServerVersion: number | null
    queuedAt: string
  }>,
): Promise<SyncPushResponse> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new Error('Supabase sync credentials are not configured.')
  }

  const applied: SyncPushResponse['applied'] = []
  const deadLetters: SyncPushResponse['deadLetters'] = []
  let highWatermark = 0

  for (const mutation of mutations) {
    if (!mutation.payload) {
      deadLetters.push({
        mutationId: mutation.mutationId,
        scope: mutation.scope,
        recordId: mutation.recordId,
        code: 'invalidMutationPayload',
        message: 'Sync mutations require a payload for both upserts and deletes.',
      })
      continue
    }

    const existingMutation = await supabase
      .from('sync_mutations')
      .select('mutation_id,result_server_version,scope,record_id,status')
      .eq('user_id', userId)
      .eq('mutation_id', mutation.mutationId)
      .maybeSingle()

    if (existingMutation.data) {
      const existingRow = await supabase
        .from('sync_records')
        .select('deleted_at,server_updated_at')
        .eq('user_id', userId)
        .eq('scope', mutation.scope)
        .eq('record_id', mutation.recordId)
        .maybeSingle()

      applied.push({
        mutationId: mutation.mutationId,
        scope: mutation.scope,
        recordId: mutation.recordId,
        serverVersion: existingMutation.data.result_server_version,
        serverUpdatedAt: existingRow.data?.server_updated_at ?? new Date().toISOString(),
        deletedAt: existingRow.data?.deleted_at ?? undefined,
      })
      highWatermark = Math.max(highWatermark, existingMutation.data.result_server_version)
      continue
    }

    const serverVersion = await getNextServerVersion()
    const serverUpdatedAt = new Date().toISOString()
    const deletedAt = mutation.operation === 'delete'
      ? extractDeletedAt(mutation.scope, mutation.payload) ?? serverUpdatedAt
      : extractDeletedAt(mutation.scope, mutation.payload)

    const upsertResult = await supabase.from('sync_records').upsert(
      {
        user_id: userId,
        scope: mutation.scope,
        record_id: mutation.recordId,
        payload_json: mutation.payload,
        deleted_at: deletedAt,
        server_version: serverVersion,
        server_updated_at: serverUpdatedAt,
        last_mutation_id: mutation.mutationId,
        last_device_id: deviceId,
      },
      { onConflict: 'user_id,scope,record_id' },
    )

    if (upsertResult.error) {
      deadLetters.push({
        mutationId: mutation.mutationId,
        scope: mutation.scope,
        recordId: mutation.recordId,
        code: 'syncWriteFailed',
        message: upsertResult.error.message,
      })
      continue
    }

    const mutationInsert = await supabase.from('sync_mutations').insert({
      user_id: userId,
      mutation_id: mutation.mutationId,
      scope: mutation.scope,
      record_id: mutation.recordId,
      result_server_version: serverVersion,
      applied_at: serverUpdatedAt,
      status: 'applied',
    })

    if (mutationInsert.error) {
      deadLetters.push({
        mutationId: mutation.mutationId,
        scope: mutation.scope,
        recordId: mutation.recordId,
        code: 'mutationAuditFailed',
        message: mutationInsert.error.message,
      })
      continue
    }

    applied.push({
      mutationId: mutation.mutationId,
      scope: mutation.scope,
      recordId: mutation.recordId,
      serverVersion,
      serverUpdatedAt,
      deletedAt: deletedAt ?? undefined,
    })
    highWatermark = Math.max(highWatermark, serverVersion)
  }

  return {
    applied,
    deadLetters,
    highWatermark,
  }
}

export async function completeBootstrapWithCloudState(userId: string): Promise<SyncPullResponse> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new Error('Supabase sync credentials are not configured.')
  }

  const upsertResult = await supabase.from('sync_users').upsert({
    user_id: userId,
    bootstrap_completed_at: new Date().toISOString(),
  })

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message)
  }

  return getSyncRecordsAfterVersion(userId, 0)
}

export async function replaceBootstrapRecordsForUser(
  userId: string,
  records: SyncRecordDraft[],
): Promise<SyncPullResponse> {
  const supabase = getSupabaseServiceClient()
  if (!supabase) {
    throw new Error('Supabase sync credentials are not configured.')
  }

  const { error } = await supabase.rpc('replace_sync_records_for_user', {
    p_user_id: userId,
    p_records: records,
    p_bootstrap_completed_at: new Date().toISOString(),
  })

  if (error) {
    throw new Error(error.message)
  }

  return getSyncRecordsAfterVersion(userId, 0)
}
