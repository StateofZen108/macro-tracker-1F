import type { CoachingRecommendationV1 } from '../../../types'
import { COACH_ENGINE_CONFIG } from './_constants'
import { buildCoachingEngineRecommendation, buildCoachingExplanation } from './explanation'
import { buildCoachingEngineInput } from './input'
import { decideCoachingPolicy, evaluatePolicy } from './policy'
import {
  assessCoachingQuality,
  assessQuality,
  summarizeCoachingSeries,
  summarizeInterventions,
} from './quality'
import { evaluateCoachingTrend } from './trend'
import type { CoachingEngineBuildParams, CoachingEngineEvaluation } from './_types'

export function evaluateCoachEngineV1(params: CoachingEngineBuildParams): CoachingEngineEvaluation {
  const context = buildCoachingEngineInput(params)
  const summary = summarizeCoachingSeries(context)
  const intervention = summarizeInterventions(context)
  const trend = evaluateCoachingTrend(context, summary.avgEligibleCalories)
  const quality = assessQuality(
    context,
    summary,
    intervention,
    trend.estimatedTdee !== null && trend.observedWeeklyRatePercent !== null,
  )
  const policy = evaluatePolicy(context, trend, quality)

  const recommendation: CoachingRecommendationV1 = {
    decisionType: policy.decisionType,
    recommendedCalories: policy.recommendedCalories,
    recommendedMacros: policy.recommendedMacros,
    confidenceScore: quality.confidenceScore,
    confidenceBand: quality.confidenceBand,
    estimatedTdee: trend.estimatedTdee,
    windowSummary: {
      days: COACH_ENGINE_CONFIG.windowDays,
      intakeDays: summary.intakeDays,
      weighInDays: summary.weighInDays,
      completeDays: summary.completeDays,
      partialDays: summary.partialDays,
      fastingDays: summary.fastingDays,
      eligibleDays: summary.eligibleDays,
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
  const explanation = buildCoachingExplanation(context, trend, quality, policy)

  return {
    context,
    summary,
    trend,
    intervention,
    quality,
    policy,
    recommendation,
    explanation,
  }
}

export const evaluateCoachingEngineV1 = evaluateCoachEngineV1

export {
  assessCoachingQuality,
  buildCoachingEngineInput,
  buildCoachingEngineRecommendation,
  buildCoachingExplanation as buildCoachingEngineExplanation,
  decideCoachingPolicy,
  evaluateCoachingTrend,
}

export {
  buildCoachingHistoryEntry,
  buildCoachingDecisionId,
  buildCoachingDecisionRecord,
  buildManualOverrideDecisionRecord,
  upsertCoachingHistoryEntry,
  updateCoachingDecisionRecordStatus,
  upsertCoachingDecisionRecord,
} from './history'

export type { CoachingEngineBuildParams, CoachingEngineEvaluation } from './_types'
