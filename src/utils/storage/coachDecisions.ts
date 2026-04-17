import type {
  ActionResult,
  CoachingDecisionRecord,
  CoachingEvidenceCard,
  EnergyModelSnapshot,
  GarminModifierWindow,
  WeeklyCheckInPacket,
} from '../../types'
import { normalizeBlockedReasonCode, normalizeReasonCode } from '../../domain/coaching/codes'
import { normalizeWeeklyCheckInPacket } from '../../domain/coaching'
import { queueCoachDecisionSyncMutations } from '../sync/storageQueue'
import { createExtraCollectionStore } from './extraStore'

const STORAGE_KEY = 'mt_coach_decision_history'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeDateKeyField(value: unknown): string | undefined {
  const normalized = readString(value)
  const match = normalized?.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0]
}

function parseEnergyModelSnapshot(rawValue: unknown): EnergyModelSnapshot | undefined {
  if (!isRecord(rawValue)) {
    return undefined
  }

  return {
    estimatedTdee:
      typeof rawValue.estimatedTdee === 'number' && Number.isFinite(rawValue.estimatedTdee)
        ? rawValue.estimatedTdee
        : null,
    averageLoggedCalories: Number(rawValue.averageLoggedCalories ?? 0),
    currentCalorieTarget: Number(rawValue.currentCalorieTarget ?? 0),
    proposedCalorieTarget:
      typeof rawValue.proposedCalorieTarget === 'number' && Number.isFinite(rawValue.proposedCalorieTarget)
        ? rawValue.proposedCalorieTarget
        : undefined,
    calorieDelta:
      typeof rawValue.calorieDelta === 'number' && Number.isFinite(rawValue.calorieDelta)
        ? rawValue.calorieDelta
        : undefined,
    targetWeeklyRatePercent: Number(rawValue.targetWeeklyRatePercent ?? 0),
    observedWeeklyRatePercent: Number(rawValue.observedWeeklyRatePercent ?? 0),
    averageSteps: Number(rawValue.averageSteps ?? 0),
    weeklyCardioMinutes: Number(rawValue.weeklyCardioMinutes ?? 0),
  }
}

function parseGarminModifierWindow(rawValue: unknown): GarminModifierWindow | undefined {
  if (!isRecord(rawValue)) {
    return undefined
  }

  const windowStart = normalizeDateKeyField(rawValue.windowStart)
  const windowEnd = normalizeDateKeyField(rawValue.windowEnd)
  if (!windowStart || !windowEnd) {
    return undefined
  }

  return {
    windowStart,
    windowEnd,
    importedDays: Number(rawValue.importedDays ?? 0),
    averageSleepMinutes:
      typeof rawValue.averageSleepMinutes === 'number' && Number.isFinite(rawValue.averageSleepMinutes)
        ? rawValue.averageSleepMinutes
        : null,
    averageRestingHeartRate:
      typeof rawValue.averageRestingHeartRate === 'number' &&
      Number.isFinite(rawValue.averageRestingHeartRate)
        ? rawValue.averageRestingHeartRate
        : null,
    averageSteps:
      typeof rawValue.averageSteps === 'number' && Number.isFinite(rawValue.averageSteps)
        ? rawValue.averageSteps
        : null,
    totalDerivedCardioMinutes: Number(rawValue.totalDerivedCardioMinutes ?? 0),
    nextWindowOnly: true,
  }
}

function parseEvidenceCard(rawValue: unknown): CoachingEvidenceCard | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = readString(rawValue.id)
  const title = readString(rawValue.title)
  const summary = readString(rawValue.summary)
  const tone = readString(rawValue.tone)
  if (!id || !title || !summary || !tone) {
    return null
  }

  return {
    id,
    title,
    summary,
    tone: tone as CoachingEvidenceCard['tone'],
    details: Array.isArray(rawValue.details)
      ? rawValue.details.filter((value): value is string => typeof value === 'string').map((value) => value.trim())
      : [],
  }
}

function parseWeeklyCheckInPacket(rawValue: unknown): WeeklyCheckInPacket | undefined {
  if (!isRecord(rawValue)) {
    return undefined
  }

  const id = readString(rawValue.id)
  const source = readString(rawValue.source)
  const generatedAt = readString(rawValue.generatedAt)
  const recommendationReason = readString(rawValue.recommendationReason)
  const confidenceBand = readString(rawValue.confidenceBand)
  const decisionType = readString(rawValue.decisionType)
  const nextCheckInDate = normalizeDateKeyField(rawValue.nextCheckInDate)
  const previousTargets = isRecord(rawValue.previousTargets)
    ? {
        calorieTarget: Number(rawValue.previousTargets.calorieTarget ?? 0),
        proteinTarget: Number(rawValue.previousTargets.proteinTarget ?? 0),
        carbTarget: Number(rawValue.previousTargets.carbTarget ?? 0),
        fatTarget: Number(rawValue.previousTargets.fatTarget ?? 0),
      }
    : null
  const energyModel = parseEnergyModelSnapshot(rawValue.energyModel)
  if (
    !id ||
    !source ||
    !generatedAt ||
    !recommendationReason ||
    !confidenceBand ||
    !decisionType ||
    !nextCheckInDate ||
    !previousTargets ||
    !energyModel
  ) {
    return undefined
  }

  const proposedTargets = isRecord(rawValue.proposedTargets)
    ? {
        calorieTarget: Number(rawValue.proposedTargets.calorieTarget ?? 0),
        proteinTarget: Number(rawValue.proposedTargets.proteinTarget ?? 0),
        carbTarget: Number(rawValue.proposedTargets.carbTarget ?? 0),
        fatTarget: Number(rawValue.proposedTargets.fatTarget ?? 0),
      }
    : undefined

  return normalizeWeeklyCheckInPacket({
    id,
    source: source as WeeklyCheckInPacket['source'],
    generatedAt,
    recommendationReason,
    recommendationExplanation: readString(rawValue.recommendationExplanation),
    confidenceBand: confidenceBand as WeeklyCheckInPacket['confidenceBand'],
    confidenceScore:
      typeof rawValue.confidenceScore === 'number' && Number.isFinite(rawValue.confidenceScore)
        ? rawValue.confidenceScore
        : null,
    decisionType: decisionType as WeeklyCheckInPacket['decisionType'],
    nextCheckInDate,
    targetDelta:
      typeof rawValue.targetDelta === 'number' && Number.isFinite(rawValue.targetDelta)
        ? rawValue.targetDelta
        : undefined,
    previousTargets,
    proposedTargets,
    energyModel,
    garminModifierWindow: parseGarminModifierWindow(rawValue.garminModifierWindow),
    evidenceCards: Array.isArray(rawValue.evidenceCards)
      ? rawValue.evidenceCards
          .map((entry) => parseEvidenceCard(entry))
          .filter((entry): entry is CoachingEvidenceCard => entry !== null)
      : [],
  })
}

function normalizeDecisionRecord(rawValue: unknown): CoachingDecisionRecord | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = readString(rawValue.id)
  const source = readString(rawValue.source)
  const status = readString(rawValue.status)
  const decisionType = readString(rawValue.decisionType)
  const windowStart = normalizeDateKeyField(rawValue.windowStart)
  const windowEnd = normalizeDateKeyField(rawValue.windowEnd)
  const effectiveDate = normalizeDateKeyField(rawValue.effectiveDate)
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
    weeklyCheckInPacket: parseWeeklyCheckInPacket(rawValue.weeklyCheckInPacket),
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
