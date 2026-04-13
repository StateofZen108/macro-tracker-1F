import type {
  CoachingExplanationV1,
  CoachingRecommendationV1,
  UserSettings,
} from '../../types'
import type { WindowEvaluation } from './math'
import type { CoachingRecommendationStatusV1 } from './types'

function getRecommendationStatus(window: WindowEvaluation): CoachingRecommendationStatusV1 {
  if (window.isActionable) {
    return 'actionable'
  }

  if (window.confidenceBand === 'medium' || window.confidenceBand === 'low') {
    return 'trendOnly'
  }

  return 'notEnoughData'
}

export function buildCoachingRecommendationV1(
  window: WindowEvaluation,
  settings: Pick<UserSettings, 'calorieTarget' | 'proteinTarget' | 'carbTarget' | 'fatTarget'>,
  windowDays: number,
): CoachingRecommendationV1 {
  const recommendedMacros =
    window.recommendedCalories !== null
      ? {
          protein: settings.proteinTarget,
          carbs: settings.carbTarget,
          fat: settings.fatTarget,
        }
      : undefined
  const decisionType =
    window.recommendedCalories === null
      ? 'hold_for_more_data'
      : window.recommendedCalories > settings.calorieTarget
        ? 'increase_calories'
        : window.recommendedCalories < settings.calorieTarget
          ? 'decrease_calories'
          : 'keep_targets'
  const reasonCodes = [window.reason.toLowerCase().replace(/\s+/g, '_')]

  return {
    decisionType,
    recommendedCalories: window.recommendedCalories,
    recommendedMacros,
    confidenceScore: window.confidenceScore,
    confidenceBand: window.confidenceBand,
    estimatedTdee: window.estimatedTdee,
    windowSummary: {
      days: windowDays,
      intakeDays: window.intakeDays,
      weighInDays: window.weighInDays,
      completeDays: window.completeDays,
      partialDays: window.partialDays,
      fastingDays: window.fastingDays,
      eligibleDays: window.eligibleDays,
    },
    previousTargets: {
      calorieTarget: settings.calorieTarget,
      proteinTarget: settings.proteinTarget,
      carbTarget: settings.carbTarget,
      fatTarget: settings.fatTarget,
    },
    proposedTargets:
      window.recommendedCalories !== null
        ? {
            calorieTarget: window.recommendedCalories,
            proteinTarget: settings.proteinTarget,
            carbTarget: settings.carbTarget,
            fatTarget: settings.fatTarget,
          }
        : undefined,
    effectiveDate: window.windowEnd,
    reasonCodes,
    blockedReasons: [],
    dataQuality: {
      score: window.confidenceScore ?? 0,
      band: window.confidenceBand,
      eligibleDays: window.eligibleDays,
      weighInDays: window.weighInDays,
      explicitEligibleDays: window.completeDays + window.fastingDays,
      completeDays: window.completeDays,
      partialDays: window.partialDays,
      fastingDays: window.fastingDays,
      unmarkedLoggedDays: window.unmarkedLoggedDays,
      markedConfounderDays: 0,
      recentlyImported: window.recentlyImported,
      recoveryIssueCount: 0,
    },
    adherence: {
      isAdequate: window.isActionable,
      calorieDeviationPercent: null,
      proteinHitRate: null,
      reasons: [],
    },
    confounders: {
      reasons: [...window.confounders],
      explicitMarkers: [],
      hasRecentImport: window.recentlyImported,
      hasInterventionChange: window.hasInterventionConfounder,
      hasRecoveryIssues: false,
      hasPartialLogging: window.partialDays > 0,
      hasMissingWeighIns: window.weighInDays < windowDays / 2,
      hasTravel: false,
      hasIllness: false,
      hasHighCalorieEvent: false,
      highCalorieEventDays: 0,
    },
    blockedBy: [
      ...(window.partialDays > 0 ? ['partialDays'] : []),
      ...(window.unmarkedLoggedDays > 0 ? ['unmarkedLoggedDays'] : []),
      ...(window.recentlyImported ? ['recentImport'] : []),
      ...(window.hasInterventionConfounder ? ['interventionConfounder'] : []),
      ...(window.isActionable ? [] : [getRecommendationStatus(window)]),
    ],
  }
}

export function buildCoachingExplanationV1(window: WindowEvaluation): CoachingExplanationV1 {
  const status = getRecommendationStatus(window)
  const reasons = [
    window.reason,
    `${window.eligibleDays} eligible day(s) in the analysis window.`,
    `${window.weighInDays} weigh-in day(s) in the analysis window.`,
    ...(window.partialDays > 0
      ? [`${window.partialDays} partial day(s) were excluded from recommendation math.`]
      : []),
    ...(window.unmarkedLoggedDays > 0
      ? [`${window.unmarkedLoggedDays} logged day(s) are still unmarked.`]
      : []),
    ...(window.recentlyImported ? ['Recent import activity is capping coaching confidence.'] : []),
    ...window.confounders,
  ]

  return {
    reason: window.reason,
    explanation: `${status}: ${window.explanation}`,
    reasons,
    reasonCodes: [window.reason.toLowerCase().replace(/\s+/g, '_')],
    confounders: [...window.confounders],
  }
}
