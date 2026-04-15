import type { ActionResult, CoachingDecisionRecord } from '../../types'
import { normalizeBlockedReasonCode, normalizeReasonCode } from '../../domain/coaching/codes'
import { queueCoachDecisionSyncMutations } from '../sync/storageQueue'
import { createExtraCollectionStore } from './extraStore'

const STORAGE_KEY = 'mt_coach_decision_history'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeDecisionRecord(rawValue: unknown): CoachingDecisionRecord | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = readString(rawValue.id)
  const source = readString(rawValue.source)
  const status = readString(rawValue.status)
  const decisionType = readString(rawValue.decisionType)
  const windowStart = readString(rawValue.windowStart)
  const windowEnd = readString(rawValue.windowEnd)
  const effectiveDate = readString(rawValue.effectiveDate)
  const confidenceBand = readString(rawValue.confidenceBand)
  const explanation = readString(rawValue.explanation)
  const createdAt = readString(rawValue.createdAt)
  const updatedAt = readString(rawValue.updatedAt)
  if (
    !id ||
    !source ||
    !status ||
    !decisionType ||
    !windowStart ||
    !windowEnd ||
    !effectiveDate ||
    !confidenceBand ||
    !explanation ||
    !createdAt ||
    !updatedAt
  ) {
    return null
  }

  const previousTargets = isRecord(rawValue.previousTargets)
    ? {
        calorieTarget: Number(rawValue.previousTargets.calorieTarget ?? 0),
        proteinTarget: Number(rawValue.previousTargets.proteinTarget ?? 0),
        carbTarget: Number(rawValue.previousTargets.carbTarget ?? 0),
        fatTarget: Number(rawValue.previousTargets.fatTarget ?? 0),
      }
    : null

  if (!previousTargets) {
    return null
  }

  const proposedTargets = isRecord(rawValue.proposedTargets)
    ? {
        calorieTarget: Number(rawValue.proposedTargets.calorieTarget ?? 0),
        proteinTarget: Number(rawValue.proposedTargets.proteinTarget ?? 0),
        carbTarget: Number(rawValue.proposedTargets.carbTarget ?? 0),
        fatTarget: Number(rawValue.proposedTargets.fatTarget ?? 0),
      }
    : undefined

  const reasonCodes = Array.isArray(rawValue.reasonCodes)
    ? rawValue.reasonCodes
        .filter((value): value is string => typeof value === 'string')
        .map((value) => normalizeReasonCode(value))
    : []
  const blockedReasons = Array.isArray(rawValue.blockedReasons)
    ? rawValue.blockedReasons.filter(isRecord).map((reason) => ({
        code: normalizeBlockedReasonCode(readString(reason.code)),
        message: readString(reason.message) ?? 'Unknown blocked reason.',
      }))
    : []

  return {
    id,
    source: source as CoachingDecisionRecord['source'],
    status: status as CoachingDecisionRecord['status'],
    decisionType: decisionType as CoachingDecisionRecord['decisionType'],
    windowStart,
    windowEnd,
    effectiveDate,
    confidenceBand: confidenceBand as CoachingDecisionRecord['confidenceBand'],
    confidenceScore:
      typeof rawValue.confidenceScore === 'number' && Number.isFinite(rawValue.confidenceScore)
        ? rawValue.confidenceScore
        : null,
    reasonCodes,
    blockedReasons,
    explanation,
    previousTargets,
    proposedTargets,
    createdAt,
    appliedAt: readString(rawValue.appliedAt),
    overriddenAt: readString(rawValue.overriddenAt),
    updatedAt,
  }
}

function sortRecords(records: CoachingDecisionRecord[]): CoachingDecisionRecord[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

const store = createExtraCollectionStore<CoachingDecisionRecord>({
  key: STORAGE_KEY,
  parse: (value) =>
    Array.isArray(value)
      ? value
          .map((entry) => normalizeDecisionRecord(entry))
          .filter((entry): entry is CoachingDecisionRecord => entry !== null)
      : [],
  sort: sortRecords,
})

export function loadCoachingDecisionHistory(): CoachingDecisionRecord[] {
  return store.load()
}

export function saveCoachingDecisionHistory(records: CoachingDecisionRecord[]): ActionResult<void> {
  const previousRecords = store.load()
  const result = store.save(records)
  if (!result.ok) {
    return result
  }

  queueCoachDecisionSyncMutations(previousRecords, records)
  return result
}

export function appendCoachingDecision(record: CoachingDecisionRecord): ActionResult<void> {
  return saveCoachingDecisionHistory([record, ...loadCoachingDecisionHistory()])
}

export function subscribeToCoachingDecisionHistory(listener: () => void): () => void {
  return store.subscribe(listener)
}
