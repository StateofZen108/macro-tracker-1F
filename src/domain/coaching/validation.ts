import type {
  CoachingBlockedReason,
  CoachingDecisionType,
  CoachingRecommendationV1,
} from '../../types'
import {
  evaluateCoachEngineV1,
  type CoachingEngineBuildParams,
  type CoachingEngineEvaluation,
} from './engine'

export interface CoachingReplayScenario {
  id: string
  params: CoachingEngineBuildParams
  expectedDecisionType: CoachingDecisionType
  expectedBlockedReasonCodes?: string[]
}

export interface CoachingReplayResult {
  scenarioId: string
  evaluation: CoachingEngineEvaluation
  matchedDecisionType: boolean
  matchedBlockedReasons: boolean
}

export interface CoachingShadowComparison {
  decisionChanged: boolean
  confidenceChanged: boolean
  blockedReasonCodesChanged: boolean
  currentDecisionType: CoachingDecisionType
  nextDecisionType: CoachingDecisionType
  currentBlockedReasonCodes: string[]
  nextBlockedReasonCodes: string[]
}

function normalizeBlockedReasonCodes(
  reasons: ReadonlyArray<CoachingBlockedReason> | undefined,
): string[] {
  return [...new Set((reasons ?? []).map((reason) => reason.code))].sort((left, right) =>
    left.localeCompare(right),
  )
}

export function runCoachingReplayScenario(
  scenario: CoachingReplayScenario,
): CoachingReplayResult {
  const evaluation = evaluateCoachEngineV1(scenario.params)
  const actualBlockedReasonCodes = normalizeBlockedReasonCodes(
    evaluation.recommendation.blockedReasons,
  )
  const expectedBlockedReasonCodes = [...(scenario.expectedBlockedReasonCodes ?? [])].sort(
    (left, right) => left.localeCompare(right),
  )

  return {
    scenarioId: scenario.id,
    evaluation,
    matchedDecisionType:
      evaluation.recommendation.decisionType === scenario.expectedDecisionType,
    matchedBlockedReasons:
      expectedBlockedReasonCodes.length === 0
        ? true
        : JSON.stringify(actualBlockedReasonCodes) ===
          JSON.stringify(expectedBlockedReasonCodes),
  }
}

export function compareCoachingShadowMode(
  currentRecommendation: CoachingRecommendationV1,
  nextRecommendation: CoachingRecommendationV1,
): CoachingShadowComparison {
  const currentBlockedReasonCodes = normalizeBlockedReasonCodes(currentRecommendation.blockedReasons)
  const nextBlockedReasonCodes = normalizeBlockedReasonCodes(nextRecommendation.blockedReasons)

  return {
    decisionChanged: currentRecommendation.decisionType !== nextRecommendation.decisionType,
    confidenceChanged:
      currentRecommendation.confidenceBand !== nextRecommendation.confidenceBand ||
      currentRecommendation.confidenceScore !== nextRecommendation.confidenceScore,
    blockedReasonCodesChanged:
      JSON.stringify(currentBlockedReasonCodes) !== JSON.stringify(nextBlockedReasonCodes),
    currentDecisionType: currentRecommendation.decisionType,
    nextDecisionType: nextRecommendation.decisionType,
    currentBlockedReasonCodes,
    nextBlockedReasonCodes,
  }
}
