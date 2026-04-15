import type {
  AdherenceScore,
  CoachingBlockedReason,
  CoachingReasonCode,
  ConfounderSet,
  LegacyCoachingCode,
  UserSettings,
} from '../../../types'
import { normalizeBlockedReasonCode } from '../codes'
import { COACH_ENGINE_CONFIG } from './_constants'
import { buildWindowDates, compareDateKeys, roundTo } from './_helpers'
import {
  applyConfidenceShift,
  evaluateCoachRuntimeState,
} from '../runtime'
import {
  assessDataQuality,
  summarizeCoachingSeries,
  summarizeInterventions,
} from './quality'
import type {
  CoachingEngineInputContext,
  QualityAssessment,
  SeriesSummary,
  TrendSummary,
} from './_types'

function collectMarkerCounts(context: CoachingEngineInputContext): {
  travelDays: number
  illnessDays: number
  highCalorieEventDays: number
} {
  let travelDays = 0
  let illnessDays = 0
  let highCalorieEventDays = 0

  for (const day of context.series) {
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
    travelDays,
    illnessDays,
    highCalorieEventDays,
  }
}

function buildConfoundersV2(
  context: CoachingEngineInputContext,
  summary: SeriesSummary,
  hasInterventionChange: boolean,
): ConfounderSet {
  const markerCounts = collectMarkerCounts(context)
  const reasons: string[] = []
  const explicitMarkers = [...new Set(context.series.flatMap((day) => day.confounders))].filter(
    (marker): marker is ConfounderSet['explicitMarkers'][number] =>
      marker === 'travel' || marker === 'illness' || marker === 'high_calorie_event',
  )

  if (context.recentlyImported) {
    reasons.push('Recent import activity is still inside the recommendation window.')
  }
  if (hasInterventionChange) {
    reasons.push('Recent intervention changes confound this recommendation window.')
  }
  if (context.recoveryIssueCount > 0) {
    reasons.push('Stored recovery issues are still unresolved.')
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
    hasInterventionChange,
    hasRecoveryIssues: context.recoveryIssueCount > 0,
    hasPartialLogging: summary.partialDays > COACH_ENGINE_CONFIG.v2MaxPartialDays,
    hasMissingWeighIns: summary.weighInDays < COACH_ENGINE_CONFIG.v2MinWeighIns,
    hasTravel: markerCounts.travelDays > 0,
    hasIllness: markerCounts.illnessDays > 0,
    hasHighCalorieEvent: markerCounts.highCalorieEventDays > 0,
    highCalorieEventDays: markerCounts.highCalorieEventDays,
  }
}

function assessAdherenceV2(
  context: CoachingEngineInputContext,
  summary: SeriesSummary,
  runtimeAssessment: ReturnType<typeof evaluateCoachRuntimeState> | undefined,
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
  const proteinThreshold =
    (context.settings.fatLossMode ?? 'standard_cut') === 'psmf'
      ? COACH_ENGINE_CONFIG.adherence.psmfMinProteinHitRate
      : COACH_ENGINE_CONFIG.adherence.minProteinHitRate
  const proteinHitRate =
    eligibleDays.length > 0
      ? roundTo(
          (eligibleDays.filter(
            (day) =>
              (day.intakeState === 'fasting' ? 0 : day.protein) >=
              context.input.proteinTarget * (proteinThreshold / 100),
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
  const isPsmf = (context.settings.fatLossMode ?? 'standard_cut') === 'psmf'
  const hasPlannedRefeed = Boolean(runtimeAssessment?.phase.hasPlannedRefeed)

  if (
    calorieDeviationPercent !== null &&
    (isPsmf
      ? !hasPlannedRefeed &&
        calorieDeviationPercent > COACH_ENGINE_CONFIG.adherence.maxCalorieDeviationPercent
      : Math.abs(calorieDeviationPercent) > COACH_ENGINE_CONFIG.adherence.maxCalorieDeviationPercent)
  ) {
    reasons.push(
      `Average calories drifted ${Math.abs(calorieDeviationPercent).toFixed(1)}% from target.`,
    )
  }
  if (proteinHitRate !== null && proteinHitRate < proteinThreshold) {
    reasons.push(`Protein target was hit on ${proteinHitRate}% of eligible days.`)
  }
  if (
    !isPsmf &&
    typeof stepAdherencePercent === 'number' &&
    stepAdherencePercent < COACH_ENGINE_CONFIG.adherence.minStepAdherencePercent
  ) {
    reasons.push(`Steps averaged ${stepAdherencePercent}% of target.`)
  }
  if (
    !isPsmf &&
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

function isInsideStabilizationWindow(
  changedAt: string | undefined,
  windowEnd: string,
  stabilizationDays: number,
): boolean {
  if (!changedAt?.trim()) {
    return false
  }

  const stabilizationWindow = buildWindowDates(windowEnd, stabilizationDays)
  return compareDateKeys(changedAt.slice(0, 10), stabilizationWindow.windowStart) >= 0
}

export function getGoalModeStabilizationDays(settings: Pick<UserSettings, 'goalMode' | 'goalModeChangedFrom'>): number {
  if (settings.goalMode === 'lose') {
    return COACH_ENGINE_CONFIG.stabilizationDays.enterLose
  }

  if (settings.goalModeChangedFrom === 'lose') {
    return COACH_ENGINE_CONFIG.stabilizationDays.leaveLose
  }

  return COACH_ENGINE_CONFIG.stabilizationDays.maintainGainSwitch
}

export function collectRecentStabilizationBlockedReasons(
  settings: Pick<
    UserSettings,
    'goalMode' | 'goalModeChangedAt' | 'goalModeChangedFrom' | 'fatLossModeChangedAt'
  >,
  windowEnd: string,
): CoachingBlockedReason[] {
  const blockedReasons: CoachingBlockedReason[] = []

  if (
    isInsideStabilizationWindow(
      settings.goalModeChangedAt,
      windowEnd,
      getGoalModeStabilizationDays(settings),
    )
  ) {
    blockedReasons.push({
      code: 'goal_mode_recently_changed',
      message: 'Goal mode changed recently. Hold targets during the current stabilization window.',
    })
  }

  if (
    settings.goalMode === 'lose' &&
    isInsideStabilizationWindow(
      settings.fatLossModeChangedAt,
      windowEnd,
      COACH_ENGINE_CONFIG.stabilizationDays.fatLossSubmodeSwitch,
    )
  ) {
    blockedReasons.push({
      code: 'fat_loss_mode_recently_changed',
      message: 'Fat-loss mode changed recently. Hold targets during the current stabilization window.',
    })
  }

  return blockedReasons
}

function pushBlockedReason(
  blockedReasons: CoachingBlockedReason[],
  blockedBy: string[],
  code: CoachingBlockedReason['code'],
  message: string,
): void {
  const normalizedCode =
    typeof code === 'string'
      ? normalizeBlockedReasonCode(code)
      : normalizeBlockedReasonCode(undefined)

  if (blockedReasons.some((reason) => reason.code === normalizedCode)) {
    return
  }
  blockedReasons.push({ code: normalizedCode, message })
  blockedBy.push(normalizedCode)
}

export function assessQualityV2(
  context: CoachingEngineInputContext,
  trend: TrendSummary,
): QualityAssessment {
  const summary = summarizeCoachingSeries(context)
  const intervention = summarizeInterventions(context)
  const dataQuality = assessDataQuality(context, summary, intervention)
  const runtimeAssessment = evaluateCoachRuntimeState(
    context.runtime,
    {
      goalMode: context.settings.goalMode,
      fatLossMode: context.settings.fatLossMode ?? 'standard_cut',
    },
    context.windowEnd,
  )
  const adherence = assessAdherenceV2(context, summary, runtimeAssessment)
  const confounders = buildConfoundersV2(context, summary, intervention.hasRecentChanges)
  const blockedReasons: CoachingBlockedReason[] = []
  const blockedBy: string[] = []
  const reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode> = []

  if (confounders.hasRecentImport) {
    pushBlockedReason(blockedReasons, blockedBy, 'recent_import', 'Recent imports are still inside the recommendation window.')
  }
  if (confounders.hasInterventionChange) {
    pushBlockedReason(blockedReasons, blockedBy, 'intervention_change', 'Recent intervention changes confound this recommendation window.')
  }
  if (confounders.hasRecoveryIssues) {
    pushBlockedReason(blockedReasons, blockedBy, 'recovery_issues', 'Resolve current recovery issues before changing targets automatically.')
  }
  if (confounders.hasTravel) {
    pushBlockedReason(blockedReasons, blockedBy, 'travel', 'Travel was marked inside the recommendation window.')
  }
  if (confounders.hasIllness) {
    pushBlockedReason(blockedReasons, blockedBy, 'illness', 'Illness or recovery disruption was marked inside the recommendation window.')
  }
  if (confounders.hasHighCalorieEvent) {
    pushBlockedReason(blockedReasons, blockedBy, 'high_calorie_event', 'High-calorie event markers were logged inside the recommendation window.')
  }
  for (const blockedReason of runtimeAssessment.phase.blockedReasons) {
    pushBlockedReason(blockedReasons, blockedBy, blockedReason.code, blockedReason.message)
  }
  for (const blockedReason of runtimeAssessment.recovery.blockedReasons) {
    pushBlockedReason(blockedReasons, blockedBy, blockedReason.code, blockedReason.message)
  }
  if (summary.eligibleDays < COACH_ENGINE_CONFIG.v2MinEligibleDays) {
    pushBlockedReason(blockedReasons, blockedBy, 'eligible_days_low', `Need at least ${COACH_ENGINE_CONFIG.v2MinEligibleDays} eligible days in the 21-day window.`)
  }
  if (summary.weighInDays < COACH_ENGINE_CONFIG.v2MinWeighIns) {
    pushBlockedReason(blockedReasons, blockedBy, 'weighins_low', `Need at least ${COACH_ENGINE_CONFIG.v2MinWeighIns} weigh-ins in the 21-day window.`)
  }
  if (summary.explicitEligibleDays < COACH_ENGINE_CONFIG.v2MinExplicitEligibleDays) {
    pushBlockedReason(blockedReasons, blockedBy, 'explicit_days_low', `Need at least ${COACH_ENGINE_CONFIG.v2MinExplicitEligibleDays} explicitly eligible days in the 21-day window.`)
  }
  if (summary.partialDays > COACH_ENGINE_CONFIG.v2MaxPartialDays) {
    pushBlockedReason(blockedReasons, blockedBy, 'partial_logging_high', 'Partial logging is still too high for a confident automatic adjustment.')
  }
  if (summary.unmarkedLoggedDays > COACH_ENGINE_CONFIG.v2MaxUnmarkedLoggedDays) {
    pushBlockedReason(blockedReasons, blockedBy, 'unmarked_logging_high', 'Too many logged days are still unmarked for a confident automatic adjustment.')
  }
  if (dataQuality.band === 'none' || dataQuality.band === 'low') {
    pushBlockedReason(blockedReasons, blockedBy, 'low_data_quality', 'Data quality is too low for a confident automatic adjustment.')
  }
  if (trend.estimatedTdee === null || trend.observedWeeklyRatePercent === null) {
    pushBlockedReason(blockedReasons, blockedBy, 'trend_unavailable', 'Trend weight is not stable enough to estimate expenditure yet.')
  }

  if (!adherence.isAdequate) {
    pushBlockedReason(blockedReasons, blockedBy, 'adherence_low', 'Adherence is below the minimum threshold for automatic calorie changes.')
    if (
      adherence.proteinHitRate !== null &&
      adherence.proteinHitRate <
        ((context.settings.fatLossMode ?? 'standard_cut') === 'psmf'
          ? COACH_ENGINE_CONFIG.adherence.psmfMinProteinHitRate
          : COACH_ENGINE_CONFIG.adherence.minProteinHitRate)
    ) {
      pushBlockedReason(blockedReasons, blockedBy, 'protein_low', 'Protein adherence is below the minimum threshold for this fat-loss mode.')
    }
    if (
      (context.settings.fatLossMode ?? 'standard_cut') !== 'psmf' &&
      typeof adherence.stepAdherencePercent === 'number' &&
      adherence.stepAdherencePercent < COACH_ENGINE_CONFIG.adherence.minStepAdherencePercent
    ) {
      pushBlockedReason(blockedReasons, blockedBy, 'step_adherence_low', 'Step adherence is below the minimum threshold for automatic calorie changes.')
    }
    if (
      (context.settings.fatLossMode ?? 'standard_cut') !== 'psmf' &&
      typeof adherence.cardioAdherencePercent === 'number' &&
      adherence.cardioAdherencePercent < COACH_ENGINE_CONFIG.adherence.minCardioAdherencePercent
    ) {
      pushBlockedReason(blockedReasons, blockedBy, 'cardio_adherence_low', 'Cardio adherence is below the minimum threshold for automatic calorie changes.')
    }
  }

  const adjustedConfidence = applyConfidenceShift(
    dataQuality.band,
    dataQuality.score,
    runtimeAssessment.recovery.confidenceBandShift,
    runtimeAssessment.recovery.confidenceScoreShift,
  )
  const confidenceScore = adjustedConfidence.score
  const confidenceBand = adjustedConfidence.band
  for (const reasonCode of runtimeAssessment.recovery.reasonCodes) {
    if (!reasonCodes.includes(reasonCode)) {
      reasonCodes.push(reasonCode)
    }
  }
  for (const reasonCode of runtimeAssessment.phase.reasonCodes) {
    if (!reasonCodes.includes(reasonCode)) {
      reasonCodes.push(reasonCode)
    }
  }
  const status =
    blockedReasons.length === 0
      ? 'actionable'
      : confounders.hasRecentImport ||
          confounders.hasInterventionChange ||
          confounders.hasRecoveryIssues ||
          confounders.hasTravel ||
          confounders.hasIllness ||
          confounders.hasHighCalorieEvent
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
    blockedBy,
    status,
    isActionable: blockedReasons.length === 0,
    adherenceTone,
    runtime: runtimeAssessment,
  }
}
