import type { CoachingExplanationV1, CoachingRecommendationV1 } from '../../../types'
import type { CoachingEngineInputContext, PolicyDecision, QualityAssessment, TrendSummary } from './_types'

export function buildCoachingEngineRecommendation(
  context: CoachingEngineInputContext,
  trend: TrendSummary,
  quality: QualityAssessment,
  policy: PolicyDecision,
): CoachingRecommendationV1 {
  return {
    decisionType: policy.decisionType,
    recommendedCalories: policy.recommendedCalories,
    recommendedMacros: policy.recommendedMacros,
    confidenceScore: quality.confidenceScore,
    confidenceBand: quality.confidenceBand,
    estimatedTdee: trend.estimatedTdee,
    windowSummary: {
      days: context.series.length,
      intakeDays: quality.summary.intakeDays,
      weighInDays: quality.summary.weighInDays,
      completeDays: quality.summary.completeDays,
      partialDays: quality.summary.partialDays,
      fastingDays: quality.summary.fastingDays,
      eligibleDays: quality.summary.eligibleDays,
    },
    previousTargets: policy.previousTargets,
    proposedTargets: policy.proposedTargets,
    effectiveDate: policy.effectiveDate,
    reasonCodes: policy.reasonCodes,
    blockedReasons: quality.blockedReasons,
    dataQuality: quality.dataQuality,
    adherence: quality.adherence,
    confounders: quality.confounders,
    blockedBy: quality.blockedBy,
  }
}

export function buildCoachingExplanation(
  context: CoachingEngineInputContext,
  trend: TrendSummary,
  quality: QualityAssessment,
  policy: PolicyDecision,
): CoachingExplanationV1 {
  const reasons = [
    `${quality.summary.eligibleDays} eligible days in the ${context.series.length}-day window.`,
    `${quality.summary.weighInDays} weigh-ins in the same window.`,
    trend.observedWeeklyRatePercent === null
      ? 'Observed weekly rate is unavailable.'
      : `Observed rate ${trend.observedWeeklyRatePercent.toFixed(2)}%/week vs target ${context.input.targetWeeklyRatePercent.toFixed(2)}%/week.`,
    ...quality.blockedReasons.map((reason) => reason.message),
    ...quality.adherence.reasons,
    ...quality.confounders.reasons,
  ]

  return {
    reason: policy.reason,
    explanation: `${policy.reason} Confidence ${quality.confidenceBand}${quality.confidenceScore !== null ? ` (${quality.confidenceScore}/100)` : ''}.`,
    reasons,
    reasonCodes: policy.reasonCodes,
    confounders: quality.confounders.reasons,
  }
}

export const buildCoachingEngineExplanation = buildCoachingExplanation
