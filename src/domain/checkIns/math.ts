import type {
  ActivityEntry,
  BodyProgressSnapshot,
  CheckInRecord,
  CoachingDecisionRecord,
  CoachingExplanationV1,
  CoachingReasonCode,
  CoachingRecommendationV1,
  DayMeta,
  DietPhase,
  DietPhaseEvent,
  FoodLogEntry,
  InterventionEntry,
  RecoveryReadiness,
  StrengthRetentionSnapshot,
  UserSettings,
  WeightEntry,
} from '../../types'
import { FEATURE_FLAGS } from '../../config/featureFlags'
import { buildAdaptiveCutOutcome } from '../adaptiveCut'
import {
  buildCoachingDecisionId,
  buildCoachingDecisionRecord,
  buildWeeklyCheckInPacket,
  compareCoachingShadowMode,
  evaluateCoachEngineV1,
  evaluateCoachEngineV2,
} from '../coaching'
import type { CoachingEngineEvaluation } from '../coaching/engine'
import { readCoachRuntimeState } from '../coaching/runtime'
import { addDays, enumerateDateKeys, getTodayDateKey, parseDateKey } from '../../utils/dates'
import { convertWeight } from '../../utils/macros'
import type { CoachingShadowComparison } from '../coaching/validation'

export interface CheckInComputation {
  record: CheckInRecord
  canApplyTargets: boolean
  decisionRecord: CoachingDecisionRecord
  shadowComparison?: CoachingShadowComparison
}

export interface AdaptiveCheckInInputs {
  bodyProgressSnapshots?: BodyProgressSnapshot[]
  dietPhases?: DietPhase[]
  dietPhaseEvents?: DietPhaseEvent[]
  readiness?: RecoveryReadiness
  strengthRetention?: StrengthRetentionSnapshot
  coachingDecisionHistory?: CoachingDecisionRecord[]
}

interface WindowComputation {
  record: CheckInRecord
  evaluation: CoachingEngineEvaluation
  shadowComparison?: CoachingShadowComparison
}

function roundTo(value: number, digits = 2): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const DEFAULT_STRENGTH_RETENTION: StrengthRetentionSnapshot = {
  anchorLiftTrend: 'flat',
  volumeFloorStatus: 'met',
  sessionCompletionRate7d: 100,
  strengthRetentionScore: 100,
}

function buildDefaultRecoveryReadiness(today: string): RecoveryReadiness {
  return {
    state: 'green',
    evaluatedDate: today,
    reasons: [],
    signals: [],
  }
}

export function getLatestCompletedWeekEnd(
  today: string,
  targetWeekday: UserSettings['checkInWeekday'],
): string {
  let cursor = addDays(today, -1)
  while (parseDateKey(cursor).getDay() !== targetWeekday) {
    cursor = addDays(cursor, -1)
  }

  return cursor
}

export function getNextCheckInDate(weekEndDate: string): string {
  return addDays(weekEndDate, 7)
}

export function isCheckInWindowActiveForDate(
  record: Pick<CheckInRecord, 'weekEndDate' | 'nextCheckInDate'>,
  effectiveDate: string,
): boolean {
  const effectiveDateKey = effectiveDate.slice(0, 10)
  const windowEnd = record.nextCheckInDate ?? getNextCheckInDate(record.weekEndDate)

  return effectiveDateKey >= record.weekEndDate && effectiveDateKey <= windowEnd
}

function buildActivityMap(activityLog: ActivityEntry[]): Map<string, ActivityEntry> {
  return new Map(activityLog.map((entry) => [entry.date, entry]))
}

function buildWellnessFallbackMap(
  settings: UserSettings,
): Map<string, { steps?: number; cardioMinutes?: number }> {
  const runtime = readCoachRuntimeState(settings)
  return new Map(
    (runtime?.recovery?.wellness ?? []).map((entry) => [
      entry.date,
      {
        steps: entry.steps,
        cardioMinutes: entry.derivedCardioMinutes,
      },
    ]),
  )
}

function buildWindowRecord(params: {
  weekEndDate: string
  settings: UserSettings
  weights: WeightEntry[]
  logsByDate: Record<string, FoodLogEntry[]>
  dayMeta: DayMeta[]
  activityLog: ActivityEntry[]
  interventions: InterventionEntry[]
  recoveryIssueCount: number
  shouldComputeV2: boolean
  useV2AsAuthority: boolean
  decisionSource: 'engine_v1' | 'engine_v2'
}): WindowComputation {
  const weekEndDate = params.weekEndDate
  const nextCheckInDate = getNextCheckInDate(weekEndDate)
  const weekStartDate = addDays(weekEndDate, -6)
  const priorWeekEndDate = addDays(weekEndDate, -7)
  const priorWeekStartDate = addDays(priorWeekEndDate, -6)
  const currentWeekDates = enumerateDateKeys(weekStartDate, weekEndDate)
  const priorWeekDates = enumerateDateKeys(priorWeekStartDate, priorWeekEndDate)
  const activityByDate = buildActivityMap(params.activityLog)
  const wellnessFallbackByDate = buildWellnessFallbackMap(params.settings)
  const weightUnit = params.settings.weightUnit

  const v1Evaluation = evaluateCoachEngineV1({
    windowEnd: weekEndDate,
    settings: params.settings,
    logsByDate: params.logsByDate,
    dayMeta: params.dayMeta,
    weights: params.weights,
    activityLog: params.activityLog,
    interventions: params.interventions,
    recoveryIssueCount: params.recoveryIssueCount,
  })
  const v2Evaluation = params.shouldComputeV2
    ? evaluateCoachEngineV2({
        windowEnd: weekEndDate,
        settings: params.settings,
        logsByDate: params.logsByDate,
        dayMeta: params.dayMeta,
        weights: params.weights,
        activityLog: params.activityLog,
        interventions: params.interventions,
        recoveryIssueCount: params.recoveryIssueCount,
      })
    : null
  const engine = params.useV2AsAuthority && v2Evaluation ? v2Evaluation : v1Evaluation
  const shadowComparison =
    params.shouldComputeV2 && v2Evaluation
      ? compareCoachingShadowMode(v1Evaluation.recommendation, v2Evaluation.recommendation)
      : undefined

  const currentWeekSeries = engine.context.series.filter(
    (day) => day.date >= weekStartDate && day.date <= weekEndDate,
  )
  const currentWeekCalories = currentWeekSeries
    .filter((day) => day.intakeState === 'complete' || day.intakeState === 'fasting')
    .map((day) => (day.intakeState === 'fasting' ? 0 : day.calories))
  const currentWeekProtein = currentWeekSeries
    .filter((day) => day.intakeState === 'complete' || day.intakeState === 'fasting')
    .map((day) => (day.intakeState === 'fasting' ? 0 : day.protein))

  const currentWeekWeights = params.weights
    .filter((entry) => currentWeekDates.includes(entry.date))
    .map((entry) => convertWeight(entry.weight, entry.unit, weightUnit))
  const priorWeekWeights = params.weights
    .filter((entry) => priorWeekDates.includes(entry.date))
    .map((entry) => convertWeight(entry.weight, entry.unit, weightUnit))

  const avgWeight = average(currentWeekWeights)
  const priorAvgWeight = average(priorWeekWeights)
  const actualWeeklyRatePercent =
    avgWeight !== null && priorAvgWeight !== null && priorAvgWeight > 0
      ? roundTo(((avgWeight - priorAvgWeight) / priorAvgWeight) * 100, 2)
      : 0

  const totalSteps = currentWeekDates.reduce(
    (sum, date) =>
      sum + (activityByDate.get(date)?.steps ?? wellnessFallbackByDate.get(date)?.steps ?? 0),
    0,
  )
  const weeklyCardioMinutes = currentWeekDates.reduce(
    (sum, date) =>
      sum +
      (activityByDate.get(date)?.cardioMinutes ??
        wellnessFallbackByDate.get(date)?.cardioMinutes ??
        0),
    0,
  )
  const avgSteps = roundTo(totalSteps / currentWeekDates.length, 0)
  const stepAdherencePercent = params.settings.dailyStepTarget
    ? roundTo((avgSteps / params.settings.dailyStepTarget) * 100, 0)
    : 100
  const cardioAdherencePercent = params.settings.weeklyCardioMinuteTarget
    ? roundTo((weeklyCardioMinutes / params.settings.weeklyCardioMinuteTarget) * 100, 0)
    : 100

  const recommendedCalorieDelta =
    typeof engine.policy.calorieDelta === 'number' ? engine.policy.calorieDelta : undefined
  const recommendedCalorieTarget = engine.policy.proposedTargets?.calorieTarget
  const recommendedMacroTargets = engine.recommendation.recommendedMacros
  const status: CheckInRecord['status'] =
    engine.recommendation.decisionType === 'ignore_period_due_to_confounders'
      ? 'deferred'
      : engine.recommendation.decisionType === 'hold_for_more_data'
        ? 'insufficientData'
        : 'ready'
  const createdAt = new Date().toISOString()

  return {
    record: {
      id: `checkin:${weekEndDate}`,
      weekEndDate,
      weekStartDate,
      nextCheckInDate,
      priorWeekStartDate,
      priorWeekEndDate,
      goalMode: params.settings.goalMode,
      targetWeeklyRatePercent: params.settings.targetWeeklyRatePercent,
      actualWeeklyRatePercent,
      avgCalories: roundTo(average(currentWeekCalories) ?? 0, 0),
      avgProtein: roundTo(average(currentWeekProtein) ?? 0, 1),
      avgSteps,
      weeklyCardioMinutes,
      stepAdherencePercent,
      cardioAdherencePercent,
      avgWeight: roundTo(avgWeight ?? 0, 2),
      priorAvgWeight: roundTo(priorAvgWeight ?? 0, 2),
      recommendedCalorieDelta,
      recommendedCalorieTarget,
      recommendedMacroTargets,
      recommendationReason: engine.explanation.reason,
      recommendationExplanation: engine.explanation.explanation,
      confidenceBand: engine.recommendation.confidenceBand,
      confidenceScore: engine.recommendation.confidenceScore,
      decisionType: engine.recommendation.decisionType,
      reasonCodes: engine.recommendation.reasonCodes,
      blockedReasons: engine.recommendation.blockedReasons,
      dataQuality: engine.recommendation.dataQuality,
      adherence: engine.recommendation.adherence,
      confounders: engine.recommendation.confounders,
      decisionRecordId: buildCoachingDecisionId(
        engine.context.windowStart,
        engine.context.windowEnd,
        params.decisionSource,
      ),
      status,
      createdAt,
      updatedAt: createdAt,
    },
    evaluation: engine,
    shadowComparison,
  }
}

function buildDecisionRecommendation(
  baseRecommendation: CoachingRecommendationV1,
  baseExplanation: CoachingExplanationV1,
  record: CheckInRecord,
  previousTargets: CoachingRecommendationV1['previousTargets'],
  proposedTargets: CoachingRecommendationV1['proposedTargets'],
): { recommendation: CoachingRecommendationV1; explanation: CoachingExplanationV1 } {
  const nextRecommendation: CoachingRecommendationV1 = {
    ...baseRecommendation,
    decisionType: record.decisionType ?? baseRecommendation.decisionType,
    recommendedCalories:
      typeof record.recommendedCalorieTarget === 'number'
        ? record.recommendedCalorieTarget
        : previousTargets.calorieTarget,
    recommendedMacros: record.recommendedMacroTargets,
    previousTargets,
    proposedTargets,
    reasonCodes: record.reasonCodes ?? baseRecommendation.reasonCodes,
    blockedReasons: record.blockedReasons ?? baseRecommendation.blockedReasons,
    dataQuality: record.dataQuality ?? baseRecommendation.dataQuality,
    adherence: record.adherence ?? baseRecommendation.adherence,
    confounders: record.confounders ?? baseRecommendation.confounders,
    effectiveDate: record.weekEndDate,
  }

  const nextExplanation: CoachingExplanationV1 = {
    ...baseExplanation,
    reason: record.recommendationReason,
    explanation: record.recommendationExplanation ?? baseExplanation.explanation,
    reasonCodes: record.reasonCodes ?? baseExplanation.reasonCodes,
    confounders: record.confounders?.reasons ?? baseExplanation.confounders,
  }

  return {
    recommendation: nextRecommendation,
    explanation: nextExplanation,
  }
}

export function evaluateCheckInWeek(
  settings: UserSettings,
  weights: WeightEntry[],
  logsByDate: Record<string, FoodLogEntry[]>,
  dayMeta: DayMeta[],
  activityLog: ActivityEntry[],
  interventions: InterventionEntry[],
  recoveryIssueCount: number,
  adaptiveInputs?: AdaptiveCheckInInputs,
): CheckInComputation {
  const today = getTodayDateKey()
  const weekEndDate = getLatestCompletedWeekEnd(today, settings.checkInWeekday)
  const priorWeekEndDate = addDays(weekEndDate, -7)
  const shouldComputeV2 = FEATURE_FLAGS.coachMethodV2
  const useV2AsAuthority = shouldComputeV2 && import.meta.env.PROD
  const decisionSource = useV2AsAuthority ? 'engine_v2' : 'engine_v1'
  const currentWindow = buildWindowRecord({
    weekEndDate,
    settings,
    weights,
    logsByDate,
    dayMeta,
    activityLog,
    interventions,
    recoveryIssueCount,
    shouldComputeV2,
    useV2AsAuthority,
    decisionSource,
  })
  const priorWindow = buildWindowRecord({
    weekEndDate: priorWeekEndDate,
    settings,
    weights,
    logsByDate,
    dayMeta,
    activityLog,
    interventions,
    recoveryIssueCount,
    shouldComputeV2,
    useV2AsAuthority,
    decisionSource,
  })

  const adaptiveOutcome = buildAdaptiveCutOutcome({
    enabled: FEATURE_FLAGS.adaptiveCutIntelligenceV1 && settings.goalMode === 'lose',
    current: currentWindow.record,
    prior: priorWindow.record,
    bodyProgressSnapshots: adaptiveInputs?.bodyProgressSnapshots ?? [],
    dietPhases: adaptiveInputs?.dietPhases ?? [],
    dietPhaseEvents: adaptiveInputs?.dietPhaseEvents ?? [],
    readiness: adaptiveInputs?.readiness ?? buildDefaultRecoveryReadiness(today),
    strengthRetention: adaptiveInputs?.strengthRetention ?? DEFAULT_STRENGTH_RETENTION,
    coachingDecisionHistory: adaptiveInputs?.coachingDecisionHistory ?? [],
    settings,
    previousTargets: currentWindow.evaluation.policy.previousTargets,
    baseDecisionType: currentWindow.evaluation.recommendation.decisionType,
    baseReasonCodes: (currentWindow.record.reasonCodes ?? []) as CoachingReasonCode[],
    baseRecommendationReason: currentWindow.evaluation.explanation.reason,
    baseRecommendationExplanation: currentWindow.evaluation.explanation.explanation,
    baseProposedTargets: currentWindow.evaluation.policy.proposedTargets,
  })

  const finalDecisionType = adaptiveOutcome?.decisionType ?? currentWindow.record.decisionType
  const usesCalorieTargets =
    finalDecisionType === 'increase_calories' || finalDecisionType === 'decrease_calories'
  const finalStatus: CheckInRecord['status'] = adaptiveOutcome?.cutReviewCard
    ? adaptiveOutcome.cutReviewCard.state === 'deferred'
      ? 'deferred'
      : 'ready'
    : currentWindow.record.status
  const finalRecordBase: CheckInRecord = {
    ...currentWindow.record,
    recommendedCalorieDelta: usesCalorieTargets
      ? currentWindow.record.recommendedCalorieDelta
      : undefined,
    recommendedCalorieTarget: usesCalorieTargets
      ? currentWindow.record.recommendedCalorieTarget
      : undefined,
    recommendedMacroTargets: usesCalorieTargets
      ? currentWindow.record.recommendedMacroTargets
      : undefined,
    recommendedStepDelta: adaptiveOutcome?.recommendedStepDelta,
    recommendedStepTarget: adaptiveOutcome?.recommendedStepTarget,
    recommendationReason:
      adaptiveOutcome?.recommendationReason ?? currentWindow.record.recommendationReason,
    recommendationExplanation:
      adaptiveOutcome?.recommendationExplanation ?? currentWindow.record.recommendationExplanation,
    decisionType: finalDecisionType,
    reviewVerdict: adaptiveOutcome?.reviewVerdict,
    reasonCodes:
      adaptiveOutcome && adaptiveOutcome.reasonCodes.length > 0
        ? adaptiveOutcome.reasonCodes
        : currentWindow.record.reasonCodes,
    cutReviewCard: adaptiveOutcome?.cutReviewCard,
    status: finalStatus,
  }
  const decisionRecordId = buildCoachingDecisionId(
    currentWindow.evaluation.context.windowStart,
    currentWindow.evaluation.context.windowEnd,
    decisionSource,
    adaptiveOutcome?.decisionIdSuffix,
  )

  let weeklyCheckInPacket = FEATURE_FLAGS.coachEngineV3
    ? buildWeeklyCheckInPacket({
        record: finalRecordBase,
        evaluation: currentWindow.evaluation,
        source: decisionSource,
        generatedAt: finalRecordBase.createdAt,
      })
    : undefined

  if (weeklyCheckInPacket) {
    weeklyCheckInPacket = {
      ...weeklyCheckInPacket,
      recommendationReason: finalRecordBase.recommendationReason,
      recommendationExplanation: finalRecordBase.recommendationExplanation,
      decisionType: finalRecordBase.decisionType ?? weeklyCheckInPacket.decisionType,
      targetDelta: finalRecordBase.recommendedCalorieDelta,
      previousTargets: weeklyCheckInPacket.previousTargets,
      proposedTargets: adaptiveOutcome?.proposedTargets ?? weeklyCheckInPacket.proposedTargets,
      cutReviewCard: finalRecordBase.cutReviewCard,
    }
  }

  const record: CheckInRecord = {
    ...finalRecordBase,
    decisionRecordId,
    weeklyCheckInPacket,
  }

  const { recommendation, explanation } = buildDecisionRecommendation(
    currentWindow.evaluation.recommendation,
    currentWindow.evaluation.explanation,
    record,
    weeklyCheckInPacket?.previousTargets ?? currentWindow.evaluation.policy.previousTargets,
    weeklyCheckInPacket?.proposedTargets ?? adaptiveOutcome?.proposedTargets,
  )
  const decisionRecord = buildCoachingDecisionRecord({
    id: decisionRecordId,
    source: decisionSource,
    windowStart: currentWindow.evaluation.context.windowStart,
    windowEnd: currentWindow.evaluation.context.windowEnd,
    recommendation,
    explanation,
    weeklyCheckInPacket,
    status:
      record.cutReviewCard?.state === 'accepted'
        ? 'applied'
        : record.status === 'deferred'
          ? 'deferred'
          : 'pending',
    createdAt: record.createdAt,
  })
  const canApplyTargets =
    record.status === 'ready' &&
    record.cutReviewCard?.state !== 'accepted' &&
    (Boolean(record.recommendedMacroTargets && typeof record.recommendedCalorieTarget === 'number') ||
      typeof record.recommendedStepTarget === 'number')

  return {
    record,
    canApplyTargets,
    decisionRecord,
    shadowComparison: currentWindow.shadowComparison,
  }
}

export function upsertCheckInRecord(
  records: CheckInRecord[],
  record: CheckInRecord,
): CheckInRecord[] {
  const existingRecord = records.find((entry) => entry.id === record.id)
  if (!existingRecord) {
    return [record, ...records]
  }

  if (existingRecord.status === 'applied' || existingRecord.status === 'kept') {
    return records
  }

  if (existingRecord.status === 'overridden') {
    return records
  }

  const nextRecord: CheckInRecord = {
    ...record,
    createdAt: existingRecord.createdAt,
    appliedAt: existingRecord.appliedAt,
    supersededByDecisionRecordId: existingRecord.supersededByDecisionRecordId,
    updatedAt: existingRecord.updatedAt,
    weeklyCheckInPacket:
      record.weeklyCheckInPacket && existingRecord.weeklyCheckInPacket?.id === record.weeklyCheckInPacket.id
        ? {
            ...record.weeklyCheckInPacket,
            generatedAt: existingRecord.weeklyCheckInPacket.generatedAt,
          }
        : record.weeklyCheckInPacket,
  }

  if (JSON.stringify(nextRecord) === JSON.stringify(existingRecord)) {
    return records
  }

  return records.map((entry) =>
    entry.id === record.id
      ? {
          ...nextRecord,
          updatedAt: new Date().toISOString(),
        }
      : entry,
  )
}
