import type { CoachingReasonCode, LegacyCoachingCode } from '../../../types'
import { COACH_ENGINE_CONFIG } from './_constants'
import { buildPreviousTargets, realizeCarbLedTargets } from './policy'
import type { CoachingEngineInputContext, PolicyDecision, QualityAssessment, TrendSummary } from './_types'

function usesConfounderHold(quality: QualityAssessment): boolean {
  return quality.blockedReasons.some((reason) =>
    reason.code === 'recent_import' ||
    reason.code === 'intervention_change' ||
    reason.code === 'recovery_issues' ||
    reason.code === 'travel' ||
    reason.code === 'illness' ||
      reason.code === 'high_calorie_event',
  )
}

function buildHoldReasonCodes(
  quality: QualityAssessment,
): Array<CoachingReasonCode | LegacyCoachingCode> {
  return quality.reasonCodes
}

function realizeTargetsWithPersonalFloor(
  context: CoachingEngineInputContext,
  requestedDelta: number,
): ReturnType<typeof realizeCarbLedTargets> {
  const previousTargets = buildPreviousTargets(context)
  const personalFloor = context.settings.coachingMinCalories

  if (
    requestedDelta >= 0 ||
    typeof personalFloor !== 'number' ||
    !Number.isFinite(personalFloor)
  ) {
    return realizeCarbLedTargets(previousTargets, requestedDelta, Number.NEGATIVE_INFINITY)
  }

  if (previousTargets.calorieTarget <= personalFloor) {
    return {
      proposedTargets: previousTargets,
      realizedCalorieDelta: 0,
      floorApplied: true,
    }
  }

  return realizeCarbLedTargets(previousTargets, requestedDelta, personalFloor)
}

export function evaluatePolicyV2(
  context: CoachingEngineInputContext,
  trend: TrendSummary,
  quality: QualityAssessment,
): PolicyDecision {
  const previousTargets = buildPreviousTargets(context)
  const runtimeAssessment =
    quality.runtime ??
    ({
      phase: {
        hasRuntime: false,
        activePhase: null,
        requiresPsmfPhase: false,
        phaseExpired: false,
        hasDietBreakActive: false,
        hasPlannedRefeed: false,
        blockedReasons: [],
        reasonCodes: [],
      },
      recovery: {
        hasRuntime: false,
        latestSeverity: null,
        dailyAssessments: [],
        yellowDaysLast7: 0,
        redDaysLast3: 0,
        confidenceBandShift: 0,
        confidenceScoreShift: 0,
        blockedReasons: [],
        reasonCodes: [],
      },
    } as const)
  const phaseAssessment = runtimeAssessment.phase
  const runtimeReasonCodes = [
    ...runtimeAssessment.phase.reasonCodes,
    ...runtimeAssessment.recovery.reasonCodes,
  ]

  function mergeRuntimeReasonCodes(
    codes: Array<CoachingReasonCode | LegacyCoachingCode>,
  ): Array<CoachingReasonCode | LegacyCoachingCode> {
    return [...new Set([...codes, ...runtimeReasonCodes])]
  }

  if (phaseAssessment.hasDietBreakActive) {
    return {
      decisionType: 'keep_targets',
      recommendedCalories: previousTargets.calorieTarget,
      previousTargets,
      calorieDelta: 0,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Diet break is active. Keep current targets until the break ends.',
      reasonCodes: mergeRuntimeReasonCodes([]),
      effectiveDate: context.windowEnd,
    }
  }

  if (
    phaseAssessment.requiresPsmfPhase ||
    phaseAssessment.phaseExpired ||
    quality.blockedReasons.some((reason) => reason.code === 'recovery_hold')
  ) {
    return {
      decisionType: 'hold_for_more_data',
      recommendedCalories: null,
      previousTargets,
      calorieDelta: null,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Hold current targets until the phase is active and recovery is stable enough to act on.',
      reasonCodes: buildHoldReasonCodes(quality),
      effectiveDate: context.windowEnd,
    }
  }

  if (usesConfounderHold(quality)) {
    return {
      decisionType: 'ignore_period_due_to_confounders',
      recommendedCalories: null,
      previousTargets,
      calorieDelta: null,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Ignore this period because confounders materially reduce recommendation trust.',
      reasonCodes: buildHoldReasonCodes(quality),
      effectiveDate: context.windowEnd,
    }
  }

  if (
    quality.blockedReasons.length > 0 ||
    trend.estimatedTdee === null ||
    trend.observedWeeklyRatePercent === null
  ) {
    return {
      decisionType: 'hold_for_more_data',
      recommendedCalories: null,
      previousTargets,
      calorieDelta: null,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Hold current targets until the data window is strong enough to act on.',
      reasonCodes: buildHoldReasonCodes(quality),
      effectiveDate: context.windowEnd,
    }
  }

  const actualRate = trend.observedWeeklyRatePercent
  const targetRate = context.input.targetWeeklyRatePercent
  const keepBand = COACH_ENGINE_CONFIG.keepBandPercentPerWeek
  const deltaFromTarget = actualRate - targetRate

  if (Math.abs(deltaFromTarget) <= keepBand) {
    return {
      decisionType: 'keep_targets',
      recommendedCalories: previousTargets.calorieTarget,
      previousTargets,
      calorieDelta: 0,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Observed rate stayed inside the target band. Keep current targets.',
      reasonCodes: mergeRuntimeReasonCodes(['rate_on_target']),
      effectiveDate: context.windowEnd,
    }
  }

  const fatLossMode = context.settings.fatLossMode ?? 'standard_cut'
  if (fatLossMode === 'psmf') {
    if (actualRate > targetRate) {
      const reasonCodes: PolicyDecision['reasonCodes'] = [
        'psmf_no_further_decrease',
        ...(phaseAssessment.hasPlannedRefeed ? (['refeed_scheduled'] as const) : []),
      ]
      return {
        decisionType: 'keep_targets',
        recommendedCalories: previousTargets.calorieTarget,
        previousTargets,
        calorieDelta: 0,
        allDayTargetFromTdee: trend.estimatedTdee,
        eatingDayTargetFromTdee: null,
        estimatedTdee: trend.estimatedTdee,
        reason: 'PSMF mode stays conservative on slower-than-target weeks and does not auto-decrease calories further.',
        reasonCodes: mergeRuntimeReasonCodes(reasonCodes),
        effectiveDate: context.windowEnd,
      }
    }

    const adjustment =
      Math.abs(deltaFromTarget) <= COACH_ENGINE_CONFIG.mediumAdjustmentThreshold
        ? COACH_ENGINE_CONFIG.psmfLightReliefCalories
        : COACH_ENGINE_CONFIG.psmfHeavyReliefCalories
    const realized = realizeCarbLedTargets(previousTargets, adjustment, Number.NEGATIVE_INFINITY)
    return {
      decisionType: 'increase_calories',
      recommendedCalories: realized.proposedTargets.calorieTarget,
      recommendedMacros: {
        protein: realized.proposedTargets.proteinTarget,
        carbs: realized.proposedTargets.carbTarget,
        fat: realized.proposedTargets.fatTarget,
      },
      previousTargets,
      proposedTargets: realized.proposedTargets,
      calorieDelta: realized.realizedCalorieDelta,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: `Rate of loss was faster than target. Increase calories by ${adjustment} per day.`,
      reasonCodes: mergeRuntimeReasonCodes(['loss_faster_than_target']),
      effectiveDate: context.windowEnd,
    }
  }

  const adjustment =
    Math.abs(deltaFromTarget) <= COACH_ENGINE_CONFIG.mediumAdjustmentThreshold
      ? COACH_ENGINE_CONFIG.v2LightAdjustmentCalories
      : COACH_ENGINE_CONFIG.v2HeavyAdjustmentCalories
  const requestedDelta = actualRate > targetRate ? -adjustment : adjustment
  const realized = realizeTargetsWithPersonalFloor(context, requestedDelta)

  return {
    decisionType: requestedDelta > 0 ? 'increase_calories' : 'decrease_calories',
    recommendedCalories: realized.proposedTargets.calorieTarget,
    recommendedMacros: {
      protein: realized.proposedTargets.proteinTarget,
      carbs: realized.proposedTargets.carbTarget,
      fat: realized.proposedTargets.fatTarget,
    },
    previousTargets,
    proposedTargets: realized.proposedTargets,
    calorieDelta: realized.realizedCalorieDelta,
    allDayTargetFromTdee: trend.estimatedTdee,
    eatingDayTargetFromTdee: null,
    estimatedTdee: trend.estimatedTdee,
    reason:
      requestedDelta > 0
        ? `Rate of loss was faster than target. Increase calories by ${adjustment} per day.`
        : `Rate of loss was slower than target. Reduce calories by ${adjustment} per day.`,
    reasonCodes: mergeRuntimeReasonCodes([
      requestedDelta > 0 ? 'loss_faster_than_target' : 'loss_slower_than_target',
      ...(realized.floorApplied ? (['personal_floor_applied'] as const) : []),
    ]),
    effectiveDate: context.windowEnd,
  }
}
