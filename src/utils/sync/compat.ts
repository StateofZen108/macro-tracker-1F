import type { SyncRecordEnvelope, SyncScope } from '../../types'

export type FutureSyncScope = never
export type SupportedSyncScope = SyncScope | FutureSyncScope

const KNOWN_CLIENT_SYNC_SCOPES: SyncScope[] = [
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

export const FUTURE_SYNC_SCOPES: FutureSyncScope[] = []
export const SUPPORTED_SYNC_SCOPES: SupportedSyncScope[] = [
  ...KNOWN_CLIENT_SYNC_SCOPES,
  ...FUTURE_SYNC_SCOPES,
]

const SCOPE_PRIORITY: Record<SupportedSyncScope, number> = {
  settings_targets: 0,
  settings_preferences: 1,
  settings_coaching_runtime: 2,
  foods: 10,
  recipes: 20,
  meal_templates: 30,
  favorite_foods: 40,
  weekly_check_ins: 45,
  coach_decisions: 46,
  food_log_entries: 50,
  weights: 60,
  day_meta: 70,
  activity: 80,
  wellness: 85,
  recovery_check_ins: 86,
  diet_phases: 87,
  diet_phase_events: 88,
  interventions: 90,
}

const KNOWN_SCOPE_SET = new Set<string>(KNOWN_CLIENT_SYNC_SCOPES)
const FUTURE_SCOPE_SET = new Set<string>(FUTURE_SYNC_SCOPES)
const SUPPORTED_SCOPE_SET = new Set<string>(SUPPORTED_SYNC_SCOPES)

type LooseSyncRecordEnvelope = Omit<SyncRecordEnvelope, 'scope'> & {
  scope: string
}

export interface FutureSyncRecordEnvelope extends Omit<SyncRecordEnvelope, 'scope'> {
  scope: FutureSyncScope
}

export function isKnownClientSyncScope(scope: string): scope is SyncScope {
  return KNOWN_SCOPE_SET.has(scope)
}

export function isFutureSyncScope(scope: string): scope is FutureSyncScope {
  return FUTURE_SCOPE_SET.has(scope)
}

export function isSupportedSyncScope(scope: string): scope is SupportedSyncScope {
  return SUPPORTED_SCOPE_SET.has(scope)
}

export function coerceSupportedSyncScope(scope: unknown): SupportedSyncScope | null {
  return typeof scope === 'string' && isSupportedSyncScope(scope.trim())
    ? (scope.trim() as SupportedSyncScope)
    : null
}

export function getSyncApplyPriority(scope: string): number {
  return isSupportedSyncScope(scope) ? SCOPE_PRIORITY[scope] : Number.MAX_SAFE_INTEGER
}

export function sortSyncRecordEnvelopesForApply<T extends { scope: string; serverVersion: number; recordId: string }>(
  records: T[],
): T[] {
  return [...records].sort((left, right) => {
    if (left.serverVersion !== right.serverVersion) {
      return left.serverVersion - right.serverVersion
    }

    const priorityDelta = getSyncApplyPriority(left.scope) - getSyncApplyPriority(right.scope)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return left.recordId.localeCompare(right.recordId)
  })
}

export function splitFutureSyncRecords(records: LooseSyncRecordEnvelope[]): {
  knownRecords: SyncRecordEnvelope[]
  futureRecords: FutureSyncRecordEnvelope[]
} {
  const knownRecords: SyncRecordEnvelope[] = []
  const futureRecords: FutureSyncRecordEnvelope[] = []

  for (const record of records) {
    if (isFutureSyncScope(record.scope)) {
      futureRecords.push({
        ...record,
        scope: record.scope,
      })
      continue
    }

    if (isKnownClientSyncScope(record.scope)) {
      knownRecords.push({
        ...record,
        scope: record.scope,
      })
    }
  }

  return {
    knownRecords: sortSyncRecordEnvelopesForApply(knownRecords),
    futureRecords: sortSyncRecordEnvelopesForApply(futureRecords),
  }
}
