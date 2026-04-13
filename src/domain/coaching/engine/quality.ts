import type { AdherenceScore, ConfounderSet, DataQualityScore } from '../../../types'
import { COACH_ENGINE_CONFIG } from './_constants'
import { compareDateKeys, median, roundTo } from './_helpers'
import type {
  CoachingEngineInputContext,
  InterventionSummary,
  QualityAssessment,
  SeriesSummary,
  TrendSummary,
} from './_types'

function scoreToBand(score: number): DataQualityScore['band'] {
  if (score <= COACH_ENGINE_CONFIG.confidenceBands.none) {
    return 'none'
  }

  if (score <= COACH_ENGINE_CONFIG.confidenceBands.low) {
    return 'low'
  }

  if (score <= COACH_ENGINE_CONFIG.confidenceBands.medium) {
    return 'medium'
  }

  return 'high'
}

function normalizeInterventionName(value: string): string {
  return value.trim().toLowerCase()
}

function buildExplicitMarkerCounts(context: CoachingEngineInputContext): {
  markedConfounderDays: number
  recentConfounderDays: number
  travelDays: number
  illnessDays: number
  highCalorieEventDays: number
} {
  const lookbackStartDate = new Date(`${context.windowEnd}T00:00:00.000Z`)
  lookbackStartDate.setUTCDate(
    lookbackStartDate.getUTCDate() - (COACH_ENGINE_CONFIG.explicitConfounderLookbackDays - 1),
  )
  const lookbackStart = lookbackStartDate.toISOString().slice(0, 10)

  let markedConfounderDays = 0
  let recentConfounderDays = 0
  let travelDays = 0
  let illnessDays = 0
  let highCalorieEventDays = 0

  for (const day of context.series) {
    if (day.confounders.length > 0) {
      markedConfounderDays += 1
      if (compareDateKeys(day.date, lookbackStart) >= 0) {
        recentConfounderDays += 1
      }
    }

    if (day.confounders.includes('travel')) {
      travelDays += 1
    }
    if (day.confounders.includes('illness')) {
      illnessDays += 1
    }
    if (day.confounders.includes('high_calorie_event')) {
      highCalorieEventDays += 1
    }
  }

  return {
    markedConfounderDays,
    recentConfounderDays,
    travelDays,
    illnessDays,
    highCalorieEventDays,
  }
}

export function summarizeCoachingSeries(context: CoachingEngineInputContext): SeriesSummary {
  const intakeDays = context.series.filter((day) => day.intakeState !== 'untracked').length
  const eligibleDays = context.series.filter(
    (day) => day.intakeState === 'complete' || day.intakeState === 'fasting',
  ).length
  const explicitEligibleDays = context.series.filter(
    (day) =>
      day.explicitDayState && (day.intakeState === 'complete' || day.intakeState === 'fasting'),
  ).length
  const completeDays = context.series.filter(
    (day) => day.explicitDayState && day.intakeState === 'complete',
  ).length
  const partialDays = context.series.filter((day) => day.intakeState === 'partial').length
  const fastingDays = context.series.filter((day) => day.intakeState === 'fasting').length
  const unmarkedLoggedDays = context.series.filter(
    (day) => !day.explicitDayState && day.intakeState === 'complete',
  ).length
  const eatingDays = context.series.filter((day) => day.intakeState === 'complete').length
  const eligibleDaysSeries = context.series.filter(
    (day) => day.intakeState === 'complete' || day.intakeState === 'fasting',
  )
  const avgEligibleCalories =
    eligibleDaysSeries.length > 0
      ? eligibleDaysSeries.reduce(
          (total, day) => total + (day.intakeState === 'fasting' ? 0 : day.calories),
          0,
        ) / eligibleDaysSeries.length
      : null
  const avgEligibleProtein =
    eligibleDaysSeries.length > 0
      ? eligibleDaysSeries.reduce(
          (total, day) => total + (day.intakeState === 'fasting' ? 0 : day.protein),
          0,
        ) / eligibleDaysSeries.length
      : null
  const weighInDays = context.series.filter((day) => day.weighIn).length
  const markerCounts = buildExplicitMarkerCounts(context)

  return {
    intakeDays,
    eligibleDays,
    explicitEligibleDays,
    completeDays,
    partialDays,
    fastingDays,
    unmarkedLoggedDays,
    eatingDays,
    avgEligibleCalories: avgEligibleCalories === null ? null : roundTo(avgEligibleCalories, 1),
    avgEligibleProtein: avgEligibleProtein === null ? null : roundTo(avgEligibleProtein, 1),
    weighInDays,
    markedConfounderDays: markerCounts.markedConfounderDays,
  }
}

export function summarizeInterventions(context: CoachingEngineInputContext): InterventionSummary {
  const recent14StartDate = new Date(`${context.windowEnd}T00:00:00.000Z`)
  recent14StartDate.setUTCDate(recent14StartDate.getUTCDate() - 13)
  const recent14Start = recent14StartDate.toISOString().slice(0, 10)
  const prior14StartDate = new Date(`${recent14Start}T00:00:00.000Z`)
  prior14StartDate.setUTCDate(prior14StartDate.getUTCDate() - 14)
  const prior14Start = prior14StartDate.toISOString().slice(0, 10)
  const prior14EndDate = new Date(`${recent14Start}T00:00:00.000Z`)
  prior14EndDate.setUTCDate(prior14EndDate.getUTCDate() - 1)
  const prior14End = prior14EndDate.toISOString().slice(0, 10)
  const recent7StartDate = new Date(`${context.windowEnd}T00:00:00.000Z`)
  recent7StartDate.setUTCDate(recent7StartDate.getUTCDate() - 6)
  const recent7Start = recent7StartDate.toISOString().slice(0, 10)

  const interventionsByName = new Map<string, typeof context.interventionsInWindow>()
  for (const intervention of context.interventionsInWindow) {
    const key = normalizeInterventionName(intervention.name)
    const bucket = interventionsByName.get(key) ?? []
    bucket.push(intervention)
    interventionsByName.set(key, bucket)
  }

  const confounders: string[] = []
  let hasRecentChanges = false
  let hasStableRecentUse = false

  for (const [normalizedName, entries] of interventionsByName.entries()) {
    const recent14Entries = entries.filter(
      (entry) => entry.date >= recent14Start && entry.date <= context.windowEnd,
    )
    const prior14Entries = entries.filter(
      (entry) => entry.date >= prior14Start && entry.date <= prior14End,
    )
    const recent7Entries = entries.filter(
      (entry) => entry.date >= recent7Start && entry.date <= context.windowEnd,
    )

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

export function assessDataQuality(
  context: CoachingEngineInputContext,
  summary: SeriesSummary,
  intervention: InterventionSummary,
): DataQualityScore {
  const markerCounts = buildExplicitMarkerCounts(context)
  const intakeCoverageScore = roundTo(
    (summary.eligibleDays / COACH_ENGINE_CONFIG.windowDays) *
      COACH_ENGINE_CONFIG.scoreWeights.intakeCoverage,
    1,
  )
  const weighInScore = roundTo(
    (Math.min(summary.weighInDays, COACH_ENGINE_CONFIG.minWeighIns) /
      COACH_ENGINE_CONFIG.minWeighIns) *
      COACH_ENGINE_CONFIG.scoreWeights.weighIns,
    1,
  )
  const explicitStateScore = roundTo(
    (summary.explicitEligibleDays / COACH_ENGINE_CONFIG.windowDays) *
      COACH_ENGINE_CONFIG.scoreWeights.explicitStates,
    1,
  )

  let interventionStabilityScore: number = COACH_ENGINE_CONFIG.scoreWeights.interventionStability
  if (intervention.hasRecentChanges) {
    interventionStabilityScore = 0
  } else if (intervention.hasStableRecentUse) {
    interventionStabilityScore = 5
  }

  let dataHygieneScore: number = COACH_ENGINE_CONFIG.scoreWeights.dataHygiene
  if (context.recentlyImported) {
    dataHygieneScore = 7
  }
  if (context.recoveryIssueCount > 0) {
    dataHygieneScore = 0
  }

  let score = Math.max(
    0,
    roundTo(
      intakeCoverageScore +
        weighInScore +
        explicitStateScore +
        interventionStabilityScore +
        dataHygieneScore,
      0,
    ),
  )

  if (context.recoveryIssueCount > 0) {
    score = Math.min(score, COACH_ENGINE_CONFIG.scoreCaps.recoveryIssue)
  }
  if (context.recentlyImported) {
    score = Math.min(score, COACH_ENGINE_CONFIG.scoreCaps.recentImport)
  }
  if (summary.partialDays > 4) {
    score = Math.min(score, COACH_ENGINE_CONFIG.scoreCaps.partialDays)
  }
  if (intervention.hasRecentChanges) {
    score = Math.min(score, COACH_ENGINE_CONFIG.scoreCaps.interventionChange)
  }
  if (summary.unmarkedLoggedDays > 3) {
    score = Math.min(score, COACH_ENGINE_CONFIG.scoreCaps.unmarkedLoggedDays)
  }
  if (markerCounts.recentConfounderDays > 0) {
    score = Math.min(score, COACH_ENGINE_CONFIG.scoreCaps.explicitConfounders)
  }

  return {
    score,
    band: scoreToBand(score),
    eligibleDays: summary.eligibleDays,
    weighInDays: summary.weighInDays,
    explicitEligibleDays: summary.explicitEligibleDays,
    completeDays: summary.completeDays,
    partialDays: summary.partialDays,
    fastingDays: summary.fastingDays,
    unmarkedLoggedDays: summary.unmarkedLoggedDays,
    markedConfounderDays: summary.markedConfounderDays,
    recentlyImported: context.recentlyImported,
    recoveryIssueCount: context.recoveryIssueCount,
  }
}

export function assessAdherence(
  context: CoachingEngineInputContext,
  summary: SeriesSummary,
): AdherenceScore {
  const eligibleDays = context.series.filter(
    (day) => day.intakeState === 'complete' || day.intakeState === 'fasting',
  )
  const calorieAverage =
    eligibleDays.length > 0
      ? eligibleDays.reduce(
          (total, day) => total + (day.intakeState === 'fasting' ? 0 : day.calories),
          0,
        ) / eligibleDays.length
      : null
  const calorieDeviationPercent =
    calorieAverage !== null && context.input.calorieTarget > 0
      ? roundTo(
          ((calorieAverage - context.input.calorieTarget) / context.input.calorieTarget) * 100,
          1,
        )
      : null
  const proteinHitRate =
    eligibleDays.length > 0
      ? roundTo(
          (eligibleDays.filter(
            (day) =>
              (day.intakeState === 'fasting' ? 0 : day.protein) >=
              context.input.proteinTarget *
                (COACH_ENGINE_CONFIG.adherence.minProteinHitRate / 100),
          ).length /
            eligibleDays.length) *
            100,
          0,
        )
      : null
  const daysWithSteps = context.series.filter((day) => typeof day.steps === 'number')
  const averageSteps =
    daysWithSteps.length > 0
      ? daysWithSteps.reduce((total, day) => total + (day.steps ?? 0), 0) / daysWithSteps.length
      : null
  const stepAdherencePercent =
    typeof context.input.dailyStepTarget === 'number' &&
    averageSteps !== null &&
    context.input.dailyStepTarget > 0
      ? roundTo((averageSteps / context.input.dailyStepTarget) * 100, 0)
      : undefined
  const totalCardioMinutes = context.series.reduce(
    (total, day) => total + (day.cardioMinutes ?? 0),
    0,
  )
  const expectedCardioMinutes =
    typeof context.input.weeklyCardioMinuteTarget === 'number'
      ? (context.input.weeklyCardioMinuteTarget * COACH_ENGINE_CONFIG.windowDays) / 7
      : null
  const cardioAdherencePercent =
    expectedCardioMinutes !== null && expectedCardioMinutes > 0
      ? roundTo((totalCardioMinutes / expectedCardioMinutes) * 100, 0)
      : undefined

  const reasons: string[] = []
  if (
    calorieDeviationPercent !== null &&
    Math.abs(calorieDeviationPercent) > COACH_ENGINE_CONFIG.adherence.maxCalorieDeviationPercent
  ) {
    reasons.push(
      `Average calories drifted ${Math.abs(calorieDeviationPercent).toFixed(1)}% from target.`,
    )
  }
  if (
    proteinHitRate !== null &&
    proteinHitRate < COACH_ENGINE_CONFIG.adherence.minProteinHitRate
  ) {
    reasons.push(`Protein target was hit on ${proteinHitRate}% of eligible days.`)
  }
  if (
    typeof stepAdherencePercent === 'number' &&
    stepAdherencePercent < COACH_ENGINE_CONFIG.adherence.minStepAdherencePercent
  ) {
    reasons.push(`Steps averaged ${stepAdherencePercent}% of target.`)
  }
  if (
    typeof cardioAdherencePercent === 'number' &&
    cardioAdherencePercent < COACH_ENGINE_CONFIG.adherence.minCardioAdherencePercent
  ) {
    reasons.push(`Cardio landed at ${cardioAdherencePercent}% of target.`)
  }

  return {
    isAdequate: reasons.length === 0 && summary.eligibleDays > 0,
    calorieDeviationPercent,
    proteinHitRate,
    stepAdherencePercent,
    cardioAdherencePercent,
    reasons,
  }
}

export function buildConfounderSet(
  context: CoachingEngineInputContext,
  summary: SeriesSummary,
  intervention: InterventionSummary,
): ConfounderSet {
  const markerCounts = buildExplicitMarkerCounts(context)
  const reasons = [...intervention.confounders]
  const explicitMarkers = [
    ...new Set(context.series.flatMap((day) => day.confounders)),
  ].filter(
    (marker): marker is ConfounderSet['explicitMarkers'][number] =>
      marker === 'travel' || marker === 'illness' || marker === 'high_calorie_event',
  )

  if (context.recentlyImported) {
    reasons.push('Recent import activity is still inside the recommendation window.')
  }
  if (context.recoveryIssueCount > 0) {
    reasons.push('Stored recovery issues are still unresolved.')
  }
  if (summary.partialDays > 4 || summary.unmarkedLoggedDays > 3) {
    reasons.push('Partial or unmarked logging is still high enough to reduce trust.')
  }
  if (summary.weighInDays < COACH_ENGINE_CONFIG.minWeighIns) {
    reasons.push('Weigh-in coverage is below the minimum threshold.')
  }
  if (markerCounts.travelDays > 0) {
    reasons.push('Travel was marked inside the recommendation window.')
  }
  if (markerCounts.illnessDays > 0) {
    reasons.push('Illness or recovery disruption was marked inside the recommendation window.')
  }
  if (markerCounts.highCalorieEventDays > 0) {
    reasons.push('High-calorie event markers were logged inside the recommendation window.')
  }

  return {
    reasons,
    explicitMarkers,
    hasRecentImport: context.recentlyImported,
    hasInterventionChange: intervention.hasRecentChanges,
    hasRecoveryIssues: context.recoveryIssueCount > 0,
    hasPartialLogging: summary.partialDays > 4 || summary.unmarkedLoggedDays > 3,
    hasMissingWeighIns: summary.weighInDays < COACH_ENGINE_CONFIG.minWeighIns,
    hasTravel: markerCounts.travelDays > 0,
    hasIllness: markerCounts.illnessDays > 0,
    hasHighCalorieEvent: markerCounts.highCalorieEventDays > 0,
    highCalorieEventDays: markerCounts.highCalorieEventDays,
  }
}

export function assessQuality(
  context: CoachingEngineInputContext,
  summary: SeriesSummary,
  intervention: InterventionSummary,
  trendAvailable: boolean,
): QualityAssessment {
  const dataQuality = assessDataQuality(context, summary, intervention)
  const adherence = assessAdherence(context, summary)
  const confounders = buildConfounderSet(context, summary, intervention)
  const blockedReasons: QualityAssessment['blockedReasons'] = []
  const reasonCodes: string[] = []

  if (dataQuality.eligibleDays < COACH_ENGINE_CONFIG.minEligibleDays) {
    blockedReasons.push({
      code: 'insufficient_eligible_days',
      message: `Need at least ${COACH_ENGINE_CONFIG.minEligibleDays} eligible days in the ${COACH_ENGINE_CONFIG.windowDays}-day window.`,
    })
    reasonCodes.push('insufficient_eligible_days')
  }
  if (dataQuality.weighInDays < COACH_ENGINE_CONFIG.minWeighIns) {
    blockedReasons.push({
      code: 'insufficient_weighins',
      message: `Need at least ${COACH_ENGINE_CONFIG.minWeighIns} weigh-ins in the ${COACH_ENGINE_CONFIG.windowDays}-day window.`,
    })
    reasonCodes.push('insufficient_weighins')
  }
  if (dataQuality.band === 'none' || dataQuality.band === 'low') {
    blockedReasons.push({
      code: 'low_data_quality',
      message: 'Data quality is too low for a confident automatic adjustment.',
    })
    reasonCodes.push('low_data_quality')
  }
  if (!trendAvailable) {
    blockedReasons.push({
      code: 'trend_unavailable',
      message: 'Trend weight is not stable enough to estimate expenditure yet.',
    })
    reasonCodes.push('trend_unavailable')
  }
  if (!adherence.isAdequate) {
    blockedReasons.push({
      code: 'adherence_low',
      message: 'Adherence is below the minimum threshold for automatic calorie changes.',
    })
    reasonCodes.push('adherence_low')
  }
  if (confounders.hasRecentImport) {
    blockedReasons.push({
      code: 'recent_import',
      message: 'Recent imports are still inside the recommendation window.',
    })
    reasonCodes.push('recent_import')
  }
  if (confounders.hasInterventionChange) {
    blockedReasons.push({
      code: 'intervention_change',
      message: 'Recent intervention changes confound this recommendation window.',
    })
    reasonCodes.push('intervention_change')
  }
  if (confounders.hasRecoveryIssues) {
    blockedReasons.push({
      code: 'recovery_issues',
      message: 'Resolve current recovery issues before changing targets automatically.',
    })
    reasonCodes.push('recovery_issues')
  }
  if (confounders.hasTravel || confounders.hasIllness || confounders.highCalorieEventDays >= 2) {
    blockedReasons.push({
      code: 'explicit_day_confounder',
      message: 'Marked day-level confounders make this window non-representative.',
    })
    reasonCodes.push('explicit_day_confounder')
  }

  const confidenceScore = dataQuality.score
  const confidenceBand = dataQuality.band
  const status =
    blockedReasons.length === 0
      ? 'actionable'
      : confounders.hasRecentImport ||
          confounders.hasInterventionChange ||
          confounders.hasRecoveryIssues ||
          confounders.hasTravel ||
          confounders.hasIllness ||
          confounders.highCalorieEventDays >= 2
        ? 'trendOnly'
        : 'notEnoughData'
  const adherenceTone =
    adherence.calorieDeviationPercent === null
      ? 'neutral'
      : Math.abs(adherence.calorieDeviationPercent) <= 5
        ? 'onTrack'
        : adherence.calorieDeviationPercent > 0
          ? 'over'
          : 'under'

  return {
    summary,
    intervention,
    confidenceScore,
    confidenceBand,
    blockedReasons,
    reasonCodes,
    dataQuality,
    adherence,
    confounders,
    blockedBy: blockedReasons.map((reason) => reason.code),
    status,
    isActionable: blockedReasons.length === 0,
    adherenceTone,
  }
}

export function assessCoachingQuality(
  context: CoachingEngineInputContext,
  trend: TrendSummary,
): QualityAssessment {
  const summary = summarizeCoachingSeries(context)
  const intervention = summarizeInterventions(context)
  return assessQuality(context, summary, intervention, trend.estimatedTdee !== null)
}
