import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateCoachEngineV1, evaluateCoachEngineV2 } from '../../src/domain/coaching/engine'
import {
  runCoachingReplaySuite,
  type CoachingReplayMetrics,
  type CoachingReplayResult,
} from '../../src/domain/coaching/validation'
import {
  WAVE1_BASELINE_PATH,
  WAVE1_REPLAY_FIXTURES,
  type Wave1ReplayFixture,
} from './coaching.wave1.fixtures'

interface CoachingReplayBaselineArtifact {
  overallDecisionMatchRate: number
  overallBlockedReasonMatchRate: number
  overallFalseAdjustmentRate: number
  fatLossDecisionMatchRate: number
  fatLossFalseAdjustmentRate: number
  maintenanceMismatchCount: number
  gainMismatchCount: number
}

function countDecisionMismatches(results: CoachingReplayResult[]): number {
  return results.filter((result) => !result.matchedDecisionType).length
}

function summarizeMetrics(results: CoachingReplayResult[]): CoachingReplayMetrics {
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

function filterByCohort(
  fixtures: Wave1ReplayFixture[],
  results: CoachingReplayResult[],
  cohort: Wave1ReplayFixture['cohort'],
): CoachingReplayResult[] {
  const ids = new Set(fixtures.filter((fixture) => fixture.cohort === cohort).map((fixture) => fixture.id))
  return results.filter((result) => ids.has(result.fixtureId))
}

function filterByTag(
  fixtures: Wave1ReplayFixture[],
  results: CoachingReplayResult[],
  tag: NonNullable<Wave1ReplayFixture['tags']>[number],
): CoachingReplayResult[] {
  const ids = new Set(
    fixtures.filter((fixture) => fixture.tags?.includes(tag)).map((fixture) => fixture.id),
  )
  return results.filter((result) => ids.has(result.fixtureId))
}

function buildBaselineArtifact(results: CoachingReplayResult[]): CoachingReplayBaselineArtifact {
  const overall = summarizeMetrics(results)
  const fatLossResults = filterByCohort(WAVE1_REPLAY_FIXTURES, results, 'fat_loss')
  const fatLoss = summarizeMetrics(fatLossResults)
  const maintenanceResults = filterByCohort(WAVE1_REPLAY_FIXTURES, results, 'maintenance')
  const gainResults = filterByCohort(WAVE1_REPLAY_FIXTURES, results, 'gain')

  return {
    overallDecisionMatchRate: overall.decisionMatchRate,
    overallBlockedReasonMatchRate: overall.blockedReasonMatchRate,
    overallFalseAdjustmentRate: overall.falseAdjustmentRate,
    fatLossDecisionMatchRate: fatLoss.decisionMatchRate,
    fatLossFalseAdjustmentRate: fatLoss.falseAdjustmentRate,
    maintenanceMismatchCount: countDecisionMismatches(maintenanceResults),
    gainMismatchCount: countDecisionMismatches(gainResults),
  }
}

function readBaselineArtifact(): CoachingReplayBaselineArtifact {
  return JSON.parse(readFileSync(WAVE1_BASELINE_PATH, 'utf8')) as CoachingReplayBaselineArtifact
}

function writeBaselineArtifact(path: string, baseline: CoachingReplayBaselineArtifact): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
}

describe('coach wave 1 replay gates', () => {
  it('meets replay thresholds and protects maintain/gain against regression', () => {
    if (process.env.COACH_BASELINE_UPDATE === '1') {
      expect(true).toBe(true)
      return
    }

    const { results, metrics } = runCoachingReplaySuite(WAVE1_REPLAY_FIXTURES, evaluateCoachEngineV2)
    const baseline = readBaselineArtifact()
    const fatLossResults = filterByCohort(WAVE1_REPLAY_FIXTURES, results, 'fat_loss')
    const fatLossMetrics = summarizeMetrics(fatLossResults)
    const maintenanceResults = filterByCohort(WAVE1_REPLAY_FIXTURES, results, 'maintenance')
    const gainResults = filterByCohort(WAVE1_REPLAY_FIXTURES, results, 'gain')
    const underLoggingResults = filterByTag(WAVE1_REPLAY_FIXTURES, results, 'under_logging')
    const confoundedResults = filterByTag(WAVE1_REPLAY_FIXTURES, results, 'confounded')
    const psmfNoFurtherDecreaseResults = filterByTag(
      WAVE1_REPLAY_FIXTURES,
      results,
      'psmf_no_further_decrease',
    )
    const fatLossModeSwitchResults = filterByTag(
      WAVE1_REPLAY_FIXTURES,
      results,
      'recent_fat_loss_mode_switch',
    )
    const goalModeSwitchResults = filterByTag(
      WAVE1_REPLAY_FIXTURES,
      results,
      'recent_goal_mode_switch',
    )

    if (process.env.COACH_REPLAY_DEBUG === '1') {
      console.log(
        results
          .filter(
            (result) =>
              !result.matchedDecisionType ||
              !result.matchedBlockedReasons ||
              !result.matchedReasonCodes,
          )
          .map((result) => ({
            fixtureId: result.fixtureId,
            decision: result.evaluation.recommendation.decisionType,
            blockedReasons: result.actualBlockedReasonCodes,
            reasonCodes: result.actualReasonCodes,
            matchedDecisionType: result.matchedDecisionType,
            matchedBlockedReasons: result.matchedBlockedReasons,
            matchedReasonCodes: result.matchedReasonCodes,
          })),
      )
    }

    expect(results).toHaveLength(28)
    expect(metrics.decisionMatchRate).toBeGreaterThanOrEqual(90)
    expect(fatLossMetrics.decisionMatchRate).toBeGreaterThanOrEqual(94)
    expect(metrics.blockedReasonMatchRate).toBeGreaterThanOrEqual(85)
    expect(metrics.falseAdjustmentRate).toBeLessThanOrEqual(8)
    expect(fatLossMetrics.falseAdjustmentRate).toBeLessThanOrEqual(4)

    expect(underLoggingResults.every((result) => !result.isFalseAdjustment)).toBe(true)
    expect(confoundedResults.every((result) => !result.isFalseAdjustment)).toBe(true)
    expect(psmfNoFurtherDecreaseResults.every((result) => !result.isFalseAdjustment)).toBe(true)
    expect(fatLossModeSwitchResults.every((result) => !result.isFalseAdjustment)).toBe(true)
    expect(goalModeSwitchResults.every((result) => !result.isFalseAdjustment)).toBe(true)

    expect(countDecisionMismatches(maintenanceResults)).toBeLessThanOrEqual(
      baseline.maintenanceMismatchCount + 1,
    )
    expect(countDecisionMismatches(gainResults)).toBeLessThanOrEqual(
      baseline.gainMismatchCount + 1,
    )
  })

  it('can regenerate the committed baseline artifact from the v1 engine when explicitly enabled', () => {
    if (process.env.COACH_BASELINE_UPDATE !== '1') {
      expect(true).toBe(true)
      return
    }

    const { results } = runCoachingReplaySuite(WAVE1_REPLAY_FIXTURES, evaluateCoachEngineV1)
    const baseline = buildBaselineArtifact(results)

    writeBaselineArtifact(WAVE1_BASELINE_PATH, baseline)

    expect(readBaselineArtifact()).toEqual(baseline)
  })

  it('can emit a temporary v1 baseline artifact for the guard script', () => {
    if (!process.env.COACH_BASELINE_TEMP_PATH) {
      expect(true).toBe(true)
      return
    }

    const { results } = runCoachingReplaySuite(WAVE1_REPLAY_FIXTURES, evaluateCoachEngineV1)
    const baseline = buildBaselineArtifact(results)
    writeBaselineArtifact(process.env.COACH_BASELINE_TEMP_PATH, baseline)

    expect(
      JSON.parse(readFileSync(process.env.COACH_BASELINE_TEMP_PATH, 'utf8')) as CoachingReplayBaselineArtifact,
    ).toEqual(baseline)
  })
})
