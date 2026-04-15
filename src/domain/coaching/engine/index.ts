import type { CoachingBlockedReason, CoachingRecommendationV1 } from '../../../types'
import { normalizeReasonCode } from '../codes'
import { COACH_ENGINE_CONFIG } from './_constants'
import { buildCoachingEngineRecommendation, buildCoachingExplanation } from './explanation'
import { buildCoachingEngineInput } from './input'
import { decideCoachingPolicy, evaluatePolicy } from './policy'
import { evaluatePolicyV2 } from './policyV2'
import {
  assessCoachingQuality,
  assessQuality,
  summarizeCoachingSeries,
  summarizeInterventions,
} from './quality'
import { assessQualityV2, collectRecentStabilizationBlockedReasons } from './qualityV2'
import { evaluateCoachingTrend } from './trend'
import type { CoachingEngineBuildParams, CoachingEngineEvaluation } from './_types'

function applyStabilizationHold(
  evaluation: CoachingEngineEvaluation,
  stabilizationBlockedReasons: CoachingBlockedReason[],
): CoachingEngineEvaluation {
  if (stabilizationBlockedReasons.length === 0) {
    return evaluation
  }

  const existingCodes = new Set(
    evaluation.quality.reasonCodes.map((code) => code.toString()),
  )
  const mergedBlockedReasons = [...evaluation.quality.blockedReasons]
  const mergedReasonCodes = [...evaluation.quality.reasonCodes]
  const mergedBlockedBy = [...evaluation.quality.blockedBy]

  for (const blockedReason of stabilizationBlockedReasons) {
    if (!mergedBlockedReasons.some((reason) => reason.code === blockedReason.code)) {
      mergedBlockedReasons.push(blockedReason)
    }
    if (typeof blockedReason.code === 'string' && !blockedReason.code.startsWith('legacy:')) {
      const normalizedReasonCode = normalizeReasonCode(blockedReason.code)
      if (
        normalizedReasonCode === blockedReason.code &&
        !existingCodes.has(normalizedReasonCode)
      ) {
        mergedReasonCodes.push(normalizedReasonCode)
        existingCodes.add(normalizedReasonCode)
      }
    }
    if (!mergedBlockedBy.includes(blockedReason.code)) {
      mergedBlockedBy.push(blockedReason.code)
    }
  }

  const quality = {
    ...evaluation.quality,
    blockedReasons: mergedBlockedReasons,
    reasonCodes: mergedReasonCodes,
    blockedBy: mergedBlockedBy,
    status: 'notEnoughData' as const,
    isActionable: false,
  }
  const policy = {
    ...evaluation.policy,
    decisionType: 'hold_for_more_data' as const,
    recommendedCalories: null,
    recommendedMacros: undefined,
    proposedTargets: undefined,
    calorieDelta: null,
    reason:
      'Hold current targets during the stabilization window after a recent goal change.',
    reasonCodes: mergedReasonCodes,
  }
  const recommendation: CoachingRecommendationV1 = buildCoachingEngineRecommendation(
    evaluation.context,
    evaluation.trend,
    quality,
    policy,
  )
  const explanation = buildCoachingExplanation(
    evaluation.context,
    evaluation.trend,
    quality,
    policy,
  )

  return {
    ...evaluation,
    quality,
    policy,
    recommendation,
    explanation,
  }
}

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

export function evaluateCoachEngineV2(params: CoachingEngineBuildParams): CoachingEngineEvaluation {
  const evaluation =
    params.settings.goalMode !== 'lose'
      ? evaluateCoachEngineV1(params)
      : (() => {
          const context = buildCoachingEngineInput(params)
          const summary = summarizeCoachingSeries(context)
          const intervention = summarizeInterventions(context)
          const trend = evaluateCoachingTrend(context, summary.avgEligibleCalories)
          const quality = assessQualityV2(context, trend)
          const policy = evaluatePolicyV2(context, trend, quality)

          const recommendation: CoachingRecommendationV1 = buildCoachingEngineRecommendation(
            context,
            trend,
            quality,
            policy,
          )
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
        })()

  return applyStabilizationHold(
    evaluation,
    collectRecentStabilizationBlockedReasons(evaluation.context.settings, evaluation.context.windowEnd),
  )
}

export const evaluateCoachingEngineV2 = evaluateCoachEngineV2

export {
  assessCoachingQuality,
  buildCoachingEngineInput,
  buildCoachingEngineRecommendation,
  buildCoachingExplanation as buildCoachingEngineExplanation,
  decideCoachingPolicy,
  evaluateCoachingTrend,
  evaluatePolicyV2,
  assessQualityV2,
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
