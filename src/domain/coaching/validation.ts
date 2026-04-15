import type {
  CoachingBlockedReason,
  CoachingBlockedReasonCode,
  CoachingDecisionType,
  CoachingReasonCode,
  CoachingRecommendationV1,
} from '../../types'
import {
  evaluateCoachEngineV1,
  evaluateCoachEngineV2,
  type CoachingEngineBuildParams,
  type CoachingEngineEvaluation,
} from './engine'

export interface CoachingReplayExpectation {
  decisionType: CoachingDecisionType
  blockedReasonCodes?: CoachingBlockedReasonCode[]
  reasonCodes?: CoachingReasonCode[]
}

export interface CoachingReplayFixture {
  id: string
  cohort?: 'fat_loss' | 'maintenance' | 'gain'
  params: CoachingEngineBuildParams
  expected: CoachingReplayExpectation
}

type LegacyReplayFixture = {
  id: string
  cohort?: CoachingReplayFixture['cohort']
  params: CoachingEngineBuildParams
  expectedDecisionType: CoachingDecisionType
  expectedBlockedReasonCodes?: CoachingBlockedReasonCode[]
}

export interface CoachingReplayResult {
  fixtureId: string
  cohort?: CoachingReplayFixture['cohort']
  evaluation: CoachingEngineEvaluation
  matchedDecisionType: boolean
  matchedBlockedReasons: boolean
  matchedReasonCodes: boolean
  isFalseAdjustment: boolean
  actualBlockedReasonCodes: string[]
  actualReasonCodes: string[]
}

export interface CoachingReplayMetrics {
  decisionMatchRate: number
  blockedReasonMatchRate: number
  falseAdjustmentRate: number
}

export interface CoachingShadowComparison {
  decisionChanged: boolean
  confidenceChanged: boolean
  blockedReasonCodesChanged: boolean
  currentDecisionType: CoachingDecisionType
  nextDecisionType: CoachingDecisionType
  currentBlockedReasonCodes: string[]
  nextBlockedReasonCodes: string[]
  isFalseAdjustment: boolean
}

function normalizeCodes(values: ReadonlyArray<string> | undefined): string[] {
  return [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right))
}

function normalizeBlockedReasonCodes(
  reasons: ReadonlyArray<CoachingBlockedReason> | undefined,
): string[] {
  return normalizeCodes((reasons ?? []).map((reason) => reason.code))
}

function isActionDecision(decisionType: CoachingDecisionType): boolean {
  return decisionType === 'increase_calories' || decisionType === 'decrease_calories'
}

export function runCoachingReplayScenario(
  fixture: CoachingReplayFixture | LegacyReplayFixture,
  evaluator?: (params: CoachingEngineBuildParams) => CoachingEngineEvaluation,
): CoachingReplayResult {
  const defaultEvaluator =
    evaluator ??
    ('expected' in fixture ? evaluateCoachEngineV2 : evaluateCoachEngineV1)
  const normalizedFixture: CoachingReplayFixture =
    'expected' in fixture
      ? fixture
      : {
          id: fixture.id,
          cohort: fixture.cohort,
          params: fixture.params,
          expected: {
            decisionType: fixture.expectedDecisionType,
            blockedReasonCodes: fixture.expectedBlockedReasonCodes,
          },
        }
  const evaluation = defaultEvaluator(fixture.params)
  const actualBlockedReasonCodes = normalizeBlockedReasonCodes(evaluation.recommendation.blockedReasons)
  const expectedBlockedReasonCodes = normalizeCodes(normalizedFixture.expected.blockedReasonCodes)
  const actualReasonCodes = normalizeCodes(evaluation.recommendation.reasonCodes)
  const expectedReasonCodes = normalizeCodes(normalizedFixture.expected.reasonCodes)

  return {
    fixtureId: normalizedFixture.id,
    cohort: normalizedFixture.cohort,
    evaluation,
    matchedDecisionType:
      evaluation.recommendation.decisionType === normalizedFixture.expected.decisionType,
    matchedBlockedReasons:
      expectedBlockedReasonCodes.length === 0
        ? true
        : JSON.stringify(actualBlockedReasonCodes) === JSON.stringify(expectedBlockedReasonCodes),
    matchedReasonCodes:
      expectedReasonCodes.length === 0
        ? true
        : JSON.stringify(actualReasonCodes) === JSON.stringify(expectedReasonCodes),
    isFalseAdjustment:
      !isActionDecision(normalizedFixture.expected.decisionType) &&
      isActionDecision(evaluation.recommendation.decisionType),
    actualBlockedReasonCodes,
    actualReasonCodes,
  }
}

export function summarizeReplayMetrics(results: CoachingReplayResult[]): CoachingReplayMetrics {
  if (results.length === 0) {
    return {
      decisionMatchRate: 100,
      blockedReasonMatchRate: 100,
      falseAdjustmentRate: 0,
    }
  }

  const decisionMatches = results.filter((result) => result.matchedDecisionType).length
  const blockedMatches = results.filter((result) => result.matchedBlockedReasons).length
  const falseAdjustments = results.filter((result) => result.isFalseAdjustment).length

  return {
    decisionMatchRate: (decisionMatches / results.length) * 100,
    blockedReasonMatchRate: (blockedMatches / results.length) * 100,
    falseAdjustmentRate: (falseAdjustments / results.length) * 100,
  }
}

export function runCoachingReplaySuite(
  fixtures: CoachingReplayFixture[],
  evaluator: (params: CoachingEngineBuildParams) => CoachingEngineEvaluation = evaluateCoachEngineV2,
): { results: CoachingReplayResult[]; metrics: CoachingReplayMetrics } {
  const results = fixtures.map((fixture) => runCoachingReplayScenario(fixture, evaluator))
  return {
    results,
    metrics: summarizeReplayMetrics(results),
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
    isFalseAdjustment:
      !isActionDecision(currentRecommendation.decisionType) &&
      isActionDecision(nextRecommendation.decisionType),
  }
}

export { evaluateCoachEngineV1, evaluateCoachEngineV2 }
