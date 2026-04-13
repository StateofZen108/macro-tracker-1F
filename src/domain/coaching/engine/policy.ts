import type { CoachingTargetSet } from '../../../types'
import { COACH_ENGINE_CONFIG } from './_constants'
import type { CoachingEngineInputContext, PolicyDecision, QualityAssessment, TrendSummary } from './_types'

function buildPreviousTargets(context: CoachingEngineInputContext): CoachingTargetSet {
  return {
    calorieTarget: context.input.calorieTarget,
    proteinTarget: context.input.proteinTarget,
    carbTarget: context.input.carbTarget,
    fatTarget: context.input.fatTarget,
  }
}

function getKeepBand(goalMode: CoachingEngineInputContext['settings']['goalMode']): number {
  return goalMode === 'maintain'
    ? COACH_ENGINE_CONFIG.maintainKeepBandPercentPerWeek
    : COACH_ENGINE_CONFIG.keepBandPercentPerWeek
}

function realizeCarbLedTargets(
  previousTargets: CoachingTargetSet,
  requestedDelta: number,
): { proposedTargets: CoachingTargetSet; realizedCalorieDelta: number; floorApplied: boolean } {
  let proposedCalorieTarget = previousTargets.calorieTarget + requestedDelta
  let floorApplied = false
  if (proposedCalorieTarget < COACH_ENGINE_CONFIG.calorieFloor) {
    proposedCalorieTarget = COACH_ENGINE_CONFIG.calorieFloor
    floorApplied = true
  }

  const realizedCalorieDelta = proposedCalorieTarget - previousTargets.calorieTarget
  const proposedCarbTarget = Math.max(0, Math.round(previousTargets.carbTarget + realizedCalorieDelta / 4))
  const realizedMacroCalorieDelta = (proposedCarbTarget - previousTargets.carbTarget) * 4

  return {
    proposedTargets: {
      calorieTarget: previousTargets.calorieTarget + realizedMacroCalorieDelta,
      proteinTarget: previousTargets.proteinTarget,
      carbTarget: proposedCarbTarget,
      fatTarget: previousTargets.fatTarget,
    },
    realizedCalorieDelta: realizedMacroCalorieDelta,
    floorApplied,
  }
}

export function evaluatePolicy(
  context: CoachingEngineInputContext,
  trend: TrendSummary,
  quality: QualityAssessment,
): PolicyDecision {
  const previousTargets = buildPreviousTargets(context)

  if (
    quality.confounders.hasRecentImport ||
    quality.confounders.hasInterventionChange ||
    quality.confounders.hasRecoveryIssues ||
    quality.confounders.hasTravel ||
    quality.confounders.hasIllness ||
    quality.confounders.highCalorieEventDays >= 2
  ) {
    return {
      decisionType: 'ignore_period_due_to_confounders',
      recommendedCalories: null,
      previousTargets,
      calorieDelta: null,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Ignore this period because confounders materially reduce recommendation trust.',
      reasonCodes: quality.reasonCodes,
      effectiveDate: context.windowEnd,
    }
  }

  if (
    quality.dataQuality.eligibleDays < COACH_ENGINE_CONFIG.minEligibleDays ||
    quality.dataQuality.weighInDays < COACH_ENGINE_CONFIG.minWeighIns ||
    quality.dataQuality.band === 'none' ||
    quality.dataQuality.band === 'low' ||
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
      reasonCodes: quality.reasonCodes,
      effectiveDate: context.windowEnd,
    }
  }

  if (!quality.adherence.isAdequate) {
    return {
      decisionType: 'hold_for_more_data',
      recommendedCalories: null,
      previousTargets,
      calorieDelta: null,
      allDayTargetFromTdee: trend.estimatedTdee,
      eatingDayTargetFromTdee: null,
      estimatedTdee: trend.estimatedTdee,
      reason: 'Hold current targets and improve adherence before the next automatic adjustment.',
      reasonCodes: [...quality.reasonCodes, 'adherence_low'],
      effectiveDate: context.windowEnd,
    }
  }

  const actualRate = trend.observedWeeklyRatePercent
  const targetRate = context.input.targetWeeklyRatePercent
  const keepBand = getKeepBand(context.settings.goalMode)

  if (context.settings.goalMode === 'maintain') {
    if (Math.abs(actualRate) <= keepBand) {
      return {
        decisionType: 'keep_targets',
        recommendedCalories: previousTargets.calorieTarget,
        previousTargets,
        calorieDelta: 0,
        allDayTargetFromTdee: trend.estimatedTdee,
        eatingDayTargetFromTdee: null,
        estimatedTdee: trend.estimatedTdee,
        reason: 'Weight stayed inside the maintenance band. Keep current targets.',
        reasonCodes: ['maintenance_on_target'],
        effectiveDate: context.windowEnd,
      }
    }

    const requestedDelta =
      actualRate > 0 ? -COACH_ENGINE_CONFIG.lightAdjustmentCalories : COACH_ENGINE_CONFIG.lightAdjustmentCalories
    const realized = realizeCarbLedTargets(previousTargets, requestedDelta)
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
          ? 'Weight drifted below maintenance. Increase calories slightly.'
          : 'Weight drifted above maintenance. Reduce calories slightly.',
      reasonCodes: [
        requestedDelta > 0 ? 'maintenance_weight_down' : 'maintenance_weight_up',
        ...(realized.floorApplied ? ['calorieFloorApplied'] : []),
      ],
      effectiveDate: context.windowEnd,
    }
  }

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
      reasonCodes: ['rate_on_target'],
      effectiveDate: context.windowEnd,
    }
  }

  const adjustment =
    Math.abs(deltaFromTarget) <= COACH_ENGINE_CONFIG.mediumAdjustmentThreshold
      ? COACH_ENGINE_CONFIG.lightAdjustmentCalories
      : COACH_ENGINE_CONFIG.heavyAdjustmentCalories

  if (context.settings.goalMode === 'lose') {
    const requestedDelta = actualRate > targetRate ? -adjustment : adjustment
    const realized = realizeCarbLedTargets(previousTargets, requestedDelta)
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
      reasonCodes: [
        requestedDelta > 0 ? 'loss_faster_than_target' : 'loss_slower_than_target',
        ...(realized.floorApplied ? ['calorieFloorApplied'] : []),
      ],
      effectiveDate: context.windowEnd,
    }
  }

  const requestedDelta = actualRate < targetRate ? adjustment : -adjustment
  const realized = realizeCarbLedTargets(previousTargets, requestedDelta)
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
        ? `Rate of gain was slower than target. Increase calories by ${adjustment} per day.`
        : `Rate of gain was faster than target. Reduce calories by ${adjustment} per day.`,
    reasonCodes: [
      requestedDelta > 0 ? 'gain_slower_than_target' : 'gain_faster_than_target',
      ...(realized.floorApplied ? ['calorieFloorApplied'] : []),
    ],
    effectiveDate: context.windowEnd,
  }
}

export const decideCoachingPolicy = evaluatePolicy
