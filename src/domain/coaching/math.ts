import type {
  CoachingCalibrationRecord,
  CoachingConfidence,
  CoachingInsight,
  DayMeta,
  FoodLogEntry,
  InterventionEntry,
  UserSettings,
  WeightEntry,
} from '../../types'
import { addDays, enumerateDateKeys, parseDateKey } from '../../utils/dates'
import { convertWeight } from '../../utils/macros'
import { buildDailyCoachingSeriesV1, summarizeDailyCoachingSeriesV1 } from './series'

export const COACHING_CONFIG = {
  analysisWindowDays: 21,
  minActionableEligibleDays: 17,
  minActionableWeighIns: 10,
  scoreWeights: {
    intakeCoverage: 40,
    weighIns: 25,
    explicitStates: 10,
    interventionStability: 10,
    dataHygiene: 15,
  },
  scoreCaps: {
    recoveryIssue: 25,
    recentImport: 40,
    partialDays: 49,
    interventionChange: 74,
    unmarkedLoggedDays: 74,
  },
  bandThresholds: {
    none: 24,
    low: 49,
    medium: 74,
  },
} as const

interface InterventionSummary {
  confounders: string[]
  hasRecentChanges: boolean
  hasStableRecentUse: boolean
}

export interface WindowEvaluation {
  windowStart: string
  windowEnd: string
  intakeDays: number
  weighInDays: number
  eligibleDays: number
  completeDays: number
  partialDays: number
  fastingDays: number
  unmarkedLoggedDays: number
  avgDailyCalories: number | null
  avgDailyProtein: number | null
  estimatedTdee: number | null
  allDayRecommendedCalories: number | null
  eatingDayRecommendedCalories: number | null
  recommendedCalories: number | null
  confidenceScore: number | null
  confidenceBand: CoachingConfidence
  explanation: string
  reason: string
  adherenceTone: CoachingInsight['adherenceTone']
  weightChangeLb: number | null
  confounders: string[]
  hasInterventionConfounder: boolean
  recentlyImported: boolean
  isActionable: boolean
}

export function roundCoachingValue(value: number, digits = 1): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function compareDateKeys(left: string, right: string): number {
  return parseDateKey(left).getTime() - parseDateKey(right).getTime()
}

function getRecommendation(tdee: number, goalMode: UserSettings['goalMode']): number {
  if (goalMode === 'lose') {
    return Math.max(1200, roundCoachingValue(tdee - 500, 0))
  }

  if (goalMode === 'gain') {
    return roundCoachingValue(tdee + 300, 0)
  }

  return roundCoachingValue(tdee, 0)
}

function buildRollingTrendPoints(
  weights: WeightEntry[],
  endDate: string,
): Array<{ date: string; trend: number | null }> {
  const startDate = addDays(endDate, -(COACHING_CONFIG.analysisWindowDays - 1))
  const dates = enumerateDateKeys(startDate, endDate)
  const weightIndex = new Map(
    weights.map((entry) => [entry.date, convertWeight(entry.weight, entry.unit, 'lb')] as const),
  )

  return dates.map((date, index) => {
    const windowDates = dates.slice(Math.max(0, index - 6), index + 1)
    const values = windowDates
      .map((windowDate) => weightIndex.get(windowDate))
      .filter((value): value is number => value !== undefined)

    return {
      date,
      trend: values.length >= 3 ? average(values) : null,
    }
  })
}

function normalizeInterventionName(value: string): string {
  return value.trim().toLowerCase()
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  const sortedValues = [...values].sort((left, right) => left - right)
  const middleIndex = Math.floor(sortedValues.length / 2)
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
  }

  return sortedValues[middleIndex]
}

function isDateInRange(date: string, start: string, end: string): boolean {
  return compareDateKeys(date, start) >= 0 && compareDateKeys(date, end) <= 0
}

function getInterventionSummary(
  interventions: InterventionEntry[],
  endDate: string,
): InterventionSummary {
  const recent14Start = addDays(endDate, -13)
  const prior14Start = addDays(endDate, -27)
  const prior14End = addDays(endDate, -14)
  const recent7Start = addDays(endDate, -6)
  const interventionsByName = new Map<string, InterventionEntry[]>()

  for (const entry of interventions) {
    const normalizedName = normalizeInterventionName(entry.name)
    const existingEntries = interventionsByName.get(normalizedName) ?? []
    existingEntries.push(entry)
    interventionsByName.set(normalizedName, existingEntries)
  }

  const confounders: string[] = []
  let hasStableRecentUse = false
  let hasRecentChanges = false

  for (const [normalizedName, entries] of interventionsByName.entries()) {
    const recent14Entries = entries.filter((entry) => isDateInRange(entry.date, recent14Start, endDate))
    const prior14Entries = entries.filter((entry) => isDateInRange(entry.date, prior14Start, prior14End))
    const recent7Entries = entries.filter((entry) => isDateInRange(entry.date, recent7Start, endDate))

    if (!recent14Entries.length && !prior14Entries.length) {
      continue
    }

    const label = recent14Entries[0]?.name ?? prior14Entries[0]?.name ?? normalizedName

    if (recent14Entries.length > 0 && prior14Entries.length === 0) {
      confounders.push(`${label} started recently.`)
      hasRecentChanges = true
      continue
    }

    if (prior14Entries.length > 0 && recent7Entries.length === 0) {
      confounders.push(`${label} stopped recently.`)
      hasRecentChanges = true
      continue
    }

    const baselineUnit = prior14Entries[0]?.unit
    const currentUnit = recent7Entries[0]?.unit
    const sameUnit =
      baselineUnit !== undefined &&
      currentUnit !== undefined &&
      baselineUnit.trim().toLowerCase() === currentUnit.trim().toLowerCase()
    const baselineMedian = sameUnit ? median(prior14Entries.map((entry) => entry.dose)) : null
    const currentMedian = sameUnit ? median(recent7Entries.map((entry) => entry.dose)) : null

    if (
      baselineMedian !== null &&
      currentMedian !== null &&
      baselineMedian > 0 &&
      Math.abs(currentMedian - baselineMedian) / baselineMedian >= 0.15
    ) {
      confounders.push(`${label} dose changed recently.`)
      hasRecentChanges = true
      continue
    }

    if (recent14Entries.length > 0) {
      hasStableRecentUse = true
    }
  }

  return {
    confounders,
    hasRecentChanges,
    hasStableRecentUse,
  }
}

function scoreToBand(score: number): CoachingConfidence {
  if (score <= COACHING_CONFIG.bandThresholds.none) {
    return 'none'
  }

  if (score <= COACHING_CONFIG.bandThresholds.low) {
    return 'low'
  }

  if (score <= COACHING_CONFIG.bandThresholds.medium) {
    return 'medium'
  }

  return 'high'
}

export function evaluateCoachingWindow(
  windowEnd: string,
  settings: UserSettings,
  logsByDate: Record<string, FoodLogEntry[]>,
  weights: WeightEntry[],
  dayMeta: DayMeta[],
  interventions: InterventionEntry[],
  recoveryIssueCount: number,
): WindowEvaluation {
  const windowStart = addDays(windowEnd, -(COACHING_CONFIG.analysisWindowDays - 1))
  const dailySeries = buildDailyCoachingSeriesV1(windowStart, windowEnd, logsByDate, dayMeta)
  const seriesSummary = summarizeDailyCoachingSeriesV1(dailySeries)
  const interventionSummary = getInterventionSummary(interventions, windowEnd)
  const recentlyImported =
    settings.lastImportAt !== undefined &&
    compareDateKeys(settings.lastImportAt.slice(0, 10), addDays(windowEnd, -6)) >= 0
  const completeDays = seriesSummary.completeDays
  const partialDays = seriesSummary.partialDays
  const fastingDays = seriesSummary.fastingDays
  const unmarkedLoggedDays = seriesSummary.unmarkedLoggedDays
  const intakeDays = seriesSummary.intakeDays
  const explicitEligibleDays = seriesSummary.explicitEligibleDays
  const eatingDays = seriesSummary.eatingDays
  const eligibleDays = seriesSummary.eligibleDays
  const weighInDays = weights.filter((entry) => isDateInRange(entry.date, windowStart, windowEnd)).length

  const intakeCoverageScore = roundCoachingValue(
    (eligibleDays / COACHING_CONFIG.analysisWindowDays) * COACHING_CONFIG.scoreWeights.intakeCoverage,
    1,
  )
  const weighInScore = roundCoachingValue(
    (Math.min(weighInDays, COACHING_CONFIG.minActionableWeighIns) /
      COACHING_CONFIG.minActionableWeighIns) *
      COACHING_CONFIG.scoreWeights.weighIns,
    1,
  )
  const explicitStateScore = roundCoachingValue(
    (explicitEligibleDays / COACHING_CONFIG.analysisWindowDays) * COACHING_CONFIG.scoreWeights.explicitStates,
    1,
  )

  let interventionStabilityScore: number = COACHING_CONFIG.scoreWeights.interventionStability
  if (interventionSummary.hasRecentChanges) {
    interventionStabilityScore = 0
  } else if (interventionSummary.hasStableRecentUse) {
    interventionStabilityScore = 5
  }

  let dataHygieneScore: number = COACHING_CONFIG.scoreWeights.dataHygiene
  if (recentlyImported) {
    dataHygieneScore = 7
  }
  if (recoveryIssueCount > 0) {
    dataHygieneScore = 0
  }

  let confidenceScore = Math.max(
    0,
    roundCoachingValue(
      intakeCoverageScore +
        weighInScore +
        explicitStateScore +
        interventionStabilityScore +
        dataHygieneScore,
      0,
    ),
  )

  if (recoveryIssueCount > 0) {
    confidenceScore = Math.min(confidenceScore, COACHING_CONFIG.scoreCaps.recoveryIssue)
  }
  if (recentlyImported) {
    confidenceScore = Math.min(confidenceScore, COACHING_CONFIG.scoreCaps.recentImport)
  }
  if (partialDays > 4) {
    confidenceScore = Math.min(confidenceScore, COACHING_CONFIG.scoreCaps.partialDays)
  }
  if (interventionSummary.hasRecentChanges) {
    confidenceScore = Math.min(confidenceScore, COACHING_CONFIG.scoreCaps.interventionChange)
  }
  if (unmarkedLoggedDays > 3) {
    confidenceScore = Math.min(confidenceScore, COACHING_CONFIG.scoreCaps.unmarkedLoggedDays)
  }

  const confidenceBand = scoreToBand(confidenceScore)
  const avgDailyCalories =
    seriesSummary.avgEligibleCalories !== null
      ? roundCoachingValue(seriesSummary.avgEligibleCalories, 0)
      : null
  const avgDailyProtein =
    seriesSummary.avgEligibleProtein !== null
      ? roundCoachingValue(seriesSummary.avgEligibleProtein, 1)
      : null

  const trendPoints = buildRollingTrendPoints(weights, windowEnd).filter((point) => point.trend !== null)
  const firstTrendPoint = trendPoints[0]
  const lastTrendPoint = trendPoints[trendPoints.length - 1]
  const weightChangeLb =
    firstTrendPoint && lastTrendPoint
      ? roundCoachingValue((lastTrendPoint.trend ?? 0) - (firstTrendPoint.trend ?? 0), 2)
      : null
  const elapsedDays =
    firstTrendPoint && lastTrendPoint
      ? Math.max(
          1,
          Math.round(
            (parseDateKey(lastTrendPoint.date).getTime() - parseDateKey(firstTrendPoint.date).getTime()) /
              86400000,
          ),
        )
      : 1

  const estimatedTdee =
    weightChangeLb !== null && avgDailyCalories !== null
      ? roundCoachingValue(avgDailyCalories - ((weightChangeLb * 3500) / elapsedDays), 0)
      : null

  const allDayRecommendedCalories =
    estimatedTdee !== null ? getRecommendation(estimatedTdee, settings.goalMode) : null
  const eatingDayRecommendedCalories =
    allDayRecommendedCalories !== null && fastingDays > 0 && eatingDays > 0
      ? roundCoachingValue((allDayRecommendedCalories * eligibleDays) / eatingDays, 0)
      : null

  const isActionable =
    (confidenceBand === 'medium' || confidenceBand === 'high') &&
    estimatedTdee !== null &&
    eligibleDays >= COACHING_CONFIG.minActionableEligibleDays &&
    weighInDays >= COACHING_CONFIG.minActionableWeighIns

  const recommendedCalories = isActionable ? allDayRecommendedCalories : null
  const comparisonTarget = recommendedCalories ?? settings.calorieTarget
  const intakeDelta = avgDailyCalories !== null ? avgDailyCalories - comparisonTarget : 0
  const adherenceTone: CoachingInsight['adherenceTone'] =
    avgDailyCalories === null
      ? 'neutral'
      : Math.abs(intakeDelta) <= 100
        ? 'onTrack'
        : intakeDelta > 100
          ? 'over'
          : 'under'

  const explanationParts = [
    `${eligibleDays} eligible days (${completeDays} complete, ${fastingDays} fasting, ${partialDays} partial excluded).`,
    `${weighInDays} weigh-ins across the last ${COACHING_CONFIG.analysisWindowDays} days.`,
    `Confidence score ${confidenceScore}/100.`,
  ]

  if (unmarkedLoggedDays > 0) {
    explanationParts.push(
      `${unmarkedLoggedDays} logged day${unmarkedLoggedDays === 1 ? '' : 's'} still unmarked.`,
    )
  }
  if (recentlyImported) {
    explanationParts.push('Recent import activity is capping confidence.')
  }
  if (recoveryIssueCount > 0) {
    explanationParts.push('Stored data issues are capping confidence.')
  }
  if (interventionSummary.confounders.length > 0) {
    explanationParts.push(interventionSummary.confounders.join(' '))
  }

  let reason = 'Not enough data yet'
  if (isActionable) {
    reason = 'Recommendation ready'
  } else if (confidenceBand === 'low' || confidenceBand === 'medium') {
    reason = 'Trend guidance only'
  }

  return {
    windowStart,
    windowEnd,
    intakeDays,
    weighInDays,
    eligibleDays,
    completeDays,
    partialDays,
    fastingDays,
    unmarkedLoggedDays,
    avgDailyCalories,
    avgDailyProtein,
    estimatedTdee,
    allDayRecommendedCalories: isActionable ? allDayRecommendedCalories : null,
    eatingDayRecommendedCalories: isActionable ? eatingDayRecommendedCalories : null,
    recommendedCalories,
    confidenceScore,
    confidenceBand,
    explanation: explanationParts.join(' '),
    reason,
    adherenceTone,
    weightChangeLb,
    confounders: interventionSummary.confounders,
    hasInterventionConfounder: interventionSummary.confounders.length > 0,
    recentlyImported,
    isActionable,
  }
}

export function buildCalibrationRecord(
  metrics: WindowEvaluation,
  goalMode: UserSettings['goalMode'],
): CoachingCalibrationRecord {
  return {
    id: `calibration:${metrics.windowStart}:${metrics.windowEnd}:${goalMode}`,
    windowStart: metrics.windowStart,
    windowEnd: metrics.windowEnd,
    predictedTdee: metrics.estimatedTdee ?? 0,
    allDayRecommendedCalories: metrics.allDayRecommendedCalories ?? 0,
    eatingDayRecommendedCalories: metrics.eatingDayRecommendedCalories ?? undefined,
    goalMode,
    confidenceScore: metrics.confidenceScore ?? 0,
    eligibleDays: metrics.eligibleDays,
    fastingDays: metrics.fastingDays,
    partialDays: metrics.partialDays,
    hasInterventionConfounder: metrics.hasInterventionConfounder,
    validated: false,
    createdAt: new Date().toISOString(),
  }
}

export function getCalibrationPhase(
  currentWindow: WindowEvaluation,
  calibrationRecords: CoachingCalibrationRecord[],
): { phase: CoachingInsight['calibrationPhase']; percent: number | null } {
  const validatedRecords = calibrationRecords.filter(
    (record) => record.validated && record.within150 !== undefined,
  )
  if (validatedRecords.length < 10) {
    return {
      phase:
        calibrationRecords.length > 0 || currentWindow.confidenceScore !== null
          ? 'collecting'
          : 'none',
      percent: null,
    }
  }

  const matchingPool = validatedRecords.filter(
    (record) =>
      (record.fastingDays > 0) === (currentWindow.fastingDays > 0) &&
      record.hasInterventionConfounder === currentWindow.hasInterventionConfounder,
  )
  const evaluationPool = matchingPool.length >= 5 ? matchingPool : validatedRecords
  const percent = roundCoachingValue(
    (evaluationPool.filter((record) => record.within150).length / evaluationPool.length) * 100,
    0,
  )

  return {
    phase: validatedRecords.length >= 20 ? 'calibrated' : 'provisional',
    percent,
  }
}

export function buildEmptyCoachingInsight(
  settings: UserSettings,
  reason: string,
  explanation: string,
): CoachingInsight {
  return {
    confidence: 'none',
    confidenceBand: 'none',
    confidenceScore: null,
    goalMode: settings.goalMode,
    isReady: false,
    reason,
    explanation,
    avgDailyCalories: null,
    avgDailyProtein: null,
    estimatedTdee: null,
    recommendedCalories: null,
    allDayRecommendedCalories: null,
    eatingDayRecommendedCalories: null,
    weightChange: null,
    weightChangeUnit: settings.weightUnit,
    adherenceTone: 'neutral',
    windowDays: COACHING_CONFIG.analysisWindowDays,
    weighInDays: 0,
    intakeDays: 0,
    completeDays: 0,
    partialDays: 0,
    fastingDays: 0,
    unmarkedLoggedDays: 0,
    eligibleDays: 0,
    confounders: [],
    calibrationPhase: 'none',
    calibratedConfidencePercent: null,
  }
}
