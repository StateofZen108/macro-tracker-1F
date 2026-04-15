import type {
  CoachingReasonCode,
  CoachingDecisionRecord,
  CoachingDecisionSource,
  CoachingExplanationV1,
  LegacyCoachingCode,
  CoachingRecommendationV1,
  UserSettings,
} from '../../../types'
import type { CoachingEngineEvaluation, CoachingHistoryEntry } from './_types'

function buildTargetSet(settings: Pick<UserSettings, 'calorieTarget' | 'proteinTarget' | 'carbTarget' | 'fatTarget'>) {
  return {
    calorieTarget: settings.calorieTarget,
    proteinTarget: settings.proteinTarget,
    carbTarget: settings.carbTarget,
    fatTarget: settings.fatTarget,
  }
}

export function buildCoachingDecisionId(
  windowStart: string,
  windowEnd: string,
  source: CoachingDecisionSource = 'engine_v1',
): string {
  return `${source}:${windowStart}:${windowEnd}`
}

export function buildCoachingDecisionRecord(params: {
  id?: string
  source?: CoachingDecisionSource
  status?: CoachingDecisionRecord['status']
  windowStart: string
  windowEnd: string
  recommendation: CoachingRecommendationV1
  explanation: CoachingExplanationV1
  createdAt?: string
}): CoachingDecisionRecord {
  const timestamp = params.createdAt ?? new Date().toISOString()

  return {
    id: params.id ?? buildCoachingDecisionId(params.windowStart, params.windowEnd, params.source),
    source: params.source ?? 'engine_v1',
    status: params.status ?? 'pending',
    decisionType: params.recommendation.decisionType,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    effectiveDate: params.recommendation.effectiveDate,
    confidenceBand: params.recommendation.confidenceBand,
    confidenceScore: params.recommendation.confidenceScore,
    reasonCodes: params.recommendation.reasonCodes,
    blockedReasons: params.recommendation.blockedReasons,
    explanation: params.explanation.explanation,
    previousTargets: params.recommendation.previousTargets,
    proposedTargets: params.recommendation.proposedTargets,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function upsertCoachingDecisionRecord(
  history: CoachingDecisionRecord[],
  record: CoachingDecisionRecord,
): CoachingDecisionRecord[] {
  const existing = history.find((entry) => entry.id === record.id)
  if (!existing) {
    return [record, ...history].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  const preservedStatus =
    existing.status === 'applied' ||
    existing.status === 'kept' ||
    existing.status === 'overridden' ||
    existing.status === 'deferred'
      ? existing.status
      : record.status

  const nextRecord: CoachingDecisionRecord = {
    ...record,
    createdAt: existing.createdAt,
    appliedAt: existing.appliedAt,
    overriddenAt: existing.overriddenAt,
    status: preservedStatus,
    updatedAt: existing.updatedAt,
  }

  if (JSON.stringify(nextRecord) === JSON.stringify(existing)) {
    return history
  }

  return history
    .map((entry) =>
      entry.id === record.id
        ? {
            ...nextRecord,
            updatedAt: record.updatedAt ?? new Date().toISOString(),
          }
        : entry,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function updateCoachingDecisionRecordStatus(
  history: CoachingDecisionRecord[],
  id: string,
  status: CoachingDecisionRecord['status'],
): CoachingDecisionRecord[] {
  const timestamp = new Date().toISOString()
  return history.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          status,
          appliedAt: status === 'applied' || status === 'kept' ? timestamp : entry.appliedAt,
          overriddenAt: status === 'overridden' ? timestamp : entry.overriddenAt,
          updatedAt: timestamp,
        }
      : entry,
  )
}

export function buildManualOverrideDecisionRecord(
  previousSettings: Pick<UserSettings, 'calorieTarget' | 'proteinTarget' | 'carbTarget' | 'fatTarget'>,
  nextSettings: Pick<UserSettings, 'calorieTarget' | 'proteinTarget' | 'carbTarget' | 'fatTarget'>,
  effectiveDate: string,
  reasonCode: CoachingReasonCode | LegacyCoachingCode = 'manual_override',
): CoachingDecisionRecord {
  const previousTargets = buildTargetSet(previousSettings)
  const proposedTargets = buildTargetSet(nextSettings)
  const calorieDelta = proposedTargets.calorieTarget - previousTargets.calorieTarget
  const decisionType =
    calorieDelta > 0
      ? 'increase_calories'
      : calorieDelta < 0
        ? 'decrease_calories'
        : 'keep_targets'
  const timestamp = new Date().toISOString()

  return {
    id: `manual_override:${effectiveDate}:${timestamp}`,
    source: 'manual_override',
    status: 'overridden',
    decisionType,
    windowStart: effectiveDate,
    windowEnd: effectiveDate,
    effectiveDate,
    confidenceBand: 'high',
    confidenceScore: null,
    reasonCodes: [reasonCode, 'manual_override'],
    blockedReasons: [],
    explanation: 'Targets were changed manually outside the automatic coaching adjustment flow.',
    previousTargets,
    proposedTargets,
    createdAt: timestamp,
    overriddenAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildCoachingHistoryEntry(
  evaluation: CoachingEngineEvaluation,
  generatedAt = new Date().toISOString(),
): CoachingHistoryEntry {
  return {
    id: `coaching-engine:${evaluation.context.windowStart}:${evaluation.context.windowEnd}`,
    windowStart: evaluation.context.windowStart,
    windowEnd: evaluation.context.windowEnd,
    generatedAt,
    confidenceScore: evaluation.quality.confidenceScore,
    confidenceBand: evaluation.quality.confidenceBand,
    recommendedCalories: evaluation.policy.recommendedCalories,
    estimatedTdee: evaluation.trend.estimatedTdee,
    eligibleDays: evaluation.summary.eligibleDays,
    weighInDays: evaluation.summary.weighInDays,
    fastingDays: evaluation.summary.fastingDays,
    partialDays: evaluation.summary.partialDays,
    unmarkedLoggedDays: evaluation.summary.unmarkedLoggedDays,
    recentlyImported: evaluation.context.recentlyImported,
    confounders: [...evaluation.intervention.confounders],
    reason: evaluation.policy.reason,
  }
}

export function upsertCoachingHistoryEntry(
  entries: CoachingHistoryEntry[],
  nextEntry: CoachingHistoryEntry,
): CoachingHistoryEntry[] {
  const filteredEntries = entries.filter((entry) => entry.id !== nextEntry.id)
  return [nextEntry, ...filteredEntries].sort(
    (left, right) =>
      right.windowEnd.localeCompare(left.windowEnd) ||
      right.generatedAt.localeCompare(left.generatedAt),
  )
}
