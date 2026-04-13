import type {
  ActivityEntry,
  CheckInRecord,
  CoachingDecisionRecord,
  DayMeta,
  FoodLogEntry,
  InterventionEntry,
  UserSettings,
  WeightEntry,
} from '../../types'
import {
  buildCoachingDecisionId,
  buildCoachingDecisionRecord,
  evaluateCoachEngineV1,
} from '../coaching'
import { addDays, enumerateDateKeys, getTodayDateKey, parseDateKey } from '../../utils/dates'
import { convertWeight } from '../../utils/macros'

export interface CheckInComputation {
  record: CheckInRecord
  canApplyTargets: boolean
  decisionRecord: CoachingDecisionRecord
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

function buildActivityMap(activityLog: ActivityEntry[]): Map<string, ActivityEntry> {
  return new Map(activityLog.map((entry) => [entry.date, entry]))
}

export function evaluateCheckInWeek(
  settings: UserSettings,
  weights: WeightEntry[],
  logsByDate: Record<string, FoodLogEntry[]>,
  dayMeta: DayMeta[],
  activityLog: ActivityEntry[],
  interventions: InterventionEntry[],
  recoveryIssueCount: number,
): CheckInComputation {
  const today = getTodayDateKey()
  const weekEndDate = getLatestCompletedWeekEnd(today, settings.checkInWeekday)
  const weekStartDate = addDays(weekEndDate, -6)
  const priorWeekEndDate = addDays(weekEndDate, -7)
  const priorWeekStartDate = addDays(priorWeekEndDate, -6)
  const currentWeekDates = enumerateDateKeys(weekStartDate, weekEndDate)
  const priorWeekDates = enumerateDateKeys(priorWeekStartDate, priorWeekEndDate)
  const activityByDate = buildActivityMap(activityLog)
  const weightUnit = settings.weightUnit

  const engine = evaluateCoachEngineV1({
    windowEnd: weekEndDate,
    settings,
    logsByDate,
    dayMeta,
    weights,
    activityLog,
    interventions,
    recoveryIssueCount,
  })
  const currentWeekSeries = engine.context.series.filter(
    (day) => day.date >= weekStartDate && day.date <= weekEndDate,
  )
  const currentWeekCalories = currentWeekSeries
    .filter((day) => day.intakeState === 'complete' || day.intakeState === 'fasting')
    .map((day) => (day.intakeState === 'fasting' ? 0 : day.calories))
  const currentWeekProtein = currentWeekSeries
    .filter((day) => day.intakeState === 'complete' || day.intakeState === 'fasting')
    .map((day) => (day.intakeState === 'fasting' ? 0 : day.protein))

  const currentWeekWeights = weights
    .filter((entry) => currentWeekDates.includes(entry.date))
    .map((entry) => convertWeight(entry.weight, entry.unit, weightUnit))
  const priorWeekWeights = weights
    .filter((entry) => priorWeekDates.includes(entry.date))
    .map((entry) => convertWeight(entry.weight, entry.unit, weightUnit))

  const avgWeight = average(currentWeekWeights)
  const priorAvgWeight = average(priorWeekWeights)
  const actualWeeklyRatePercent =
    avgWeight !== null && priorAvgWeight !== null && priorAvgWeight > 0
      ? roundTo(((avgWeight - priorAvgWeight) / priorAvgWeight) * 100, 2)
      : 0

  const totalSteps = currentWeekDates.reduce(
    (sum, date) => sum + (activityByDate.get(date)?.steps ?? 0),
    0,
  )
  const weeklyCardioMinutes = currentWeekDates.reduce(
    (sum, date) => sum + (activityByDate.get(date)?.cardioMinutes ?? 0),
    0,
  )
  const avgSteps = roundTo(totalSteps / currentWeekDates.length, 0)
  const stepAdherencePercent = settings.dailyStepTarget
    ? roundTo((avgSteps / settings.dailyStepTarget) * 100, 0)
    : 100
  const cardioAdherencePercent = settings.weeklyCardioMinuteTarget
    ? roundTo((weeklyCardioMinutes / settings.weeklyCardioMinuteTarget) * 100, 0)
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
  const canApplyTargets =
    status === 'ready' &&
    typeof recommendedCalorieTarget === 'number' &&
    engine.recommendation.decisionType !== 'keep_targets'

  const record: CheckInRecord = {
    id: `checkin:${weekEndDate}`,
    weekEndDate,
    weekStartDate,
    priorWeekStartDate,
    priorWeekEndDate,
    goalMode: settings.goalMode,
    targetWeeklyRatePercent: settings.targetWeeklyRatePercent,
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
    decisionRecordId: buildCoachingDecisionId(engine.context.windowStart, engine.context.windowEnd),
    status,
    createdAt: new Date().toISOString(),
  }
  const decisionRecord = buildCoachingDecisionRecord({
    id: record.decisionRecordId,
    windowStart: engine.context.windowStart,
    windowEnd: engine.context.windowEnd,
    recommendation: engine.recommendation,
    explanation: engine.explanation,
    status: status === 'deferred' ? 'deferred' : 'pending',
    createdAt: record.createdAt,
  })

  return {
    record,
    canApplyTargets,
    decisionRecord,
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

  return records.map((entry) =>
    entry.id === record.id
      ? {
          ...record,
          createdAt: entry.createdAt,
          appliedAt: entry.appliedAt,
        }
      : entry,
  )
}
