import { describe, expect, it } from 'vitest'
import {
  assessCoachingQuality,
  buildCoachingEngineInput,
  buildCoachingHistoryEntry,
  evaluateCoachingEngineV1,
  evaluateCoachingTrend,
  upsertCoachingHistoryEntry,
} from '../../src/domain/coaching/engine'
import {
  compareCoachingShadowMode,
  runCoachingReplayScenario,
} from '../../src/domain/coaching/validation'
import { buildIntervention, buildSettings, buildWindowData } from './coaching.engine.fixtures'

describe('coaching engine quality and history', () => {
  it('caps confidence for recent import, intervention confounders, and noisy logging', () => {
    const settings = buildSettings({
      lastImportAt: '2026-04-18T08:00:00.000Z',
    })
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      statuses: {
        '2026-04-01': 'partial',
        '2026-04-02': 'partial',
        '2026-04-03': 'partial',
        '2026-04-04': 'partial',
        '2026-04-05': 'partial',
        '2026-04-06': 'unmarked',
        '2026-04-07': 'unmarked',
        '2026-04-08': 'unmarked',
        '2026-04-09': 'unmarked',
      },
    })
    const context = buildCoachingEngineInput({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
      interventions: [buildIntervention('2026-04-20')],
    })

    const quality = assessCoachingQuality(context, evaluateCoachingTrend(context, 2000))

    expect(quality.confidenceScore).toBeLessThanOrEqual(40)
    expect(quality.isActionable).toBe(false)
    expect(quality.blockedBy).toEqual(
      expect.arrayContaining(['recent_import', 'intervention_change', 'low_data_quality']),
    )
  })

  it('builds and upserts stable history entries from engine evaluations', () => {
    const settings = buildSettings()
    const firstWindow = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.125,
    })
    const secondWindow = buildWindowData({
      start: '2026-04-02',
      end: '2026-04-22',
      weightForIndex: (index) => 199.9 - index * 0.1,
    })

    const firstEvaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: firstWindow.logsByDate,
      dayMeta: firstWindow.dayMeta,
      weights: firstWindow.weights,
      activityLog: firstWindow.activityLog,
    })
    const secondEvaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-22',
      settings,
      logsByDate: secondWindow.logsByDate,
      dayMeta: secondWindow.dayMeta,
      weights: secondWindow.weights,
      activityLog: secondWindow.activityLog,
    })

    const firstEntry = buildCoachingHistoryEntry(firstEvaluation, '2026-04-21T12:00:00.000Z')
    const updatedFirstEntry = buildCoachingHistoryEntry(firstEvaluation, '2026-04-21T13:00:00.000Z')
    const secondEntry = buildCoachingHistoryEntry(secondEvaluation, '2026-04-22T12:00:00.000Z')

    const merged = upsertCoachingHistoryEntry(
      upsertCoachingHistoryEntry([firstEntry], updatedFirstEntry),
      secondEntry,
    )

    expect(merged).toHaveLength(2)
    expect(merged[0]?.windowEnd).toBe('2026-04-22')
    expect(merged[1]?.generatedAt).toBe('2026-04-21T13:00:00.000Z')
  })

  it('treats travel markers as explicit confounders and surfaces them in replay checks', () => {
    const settings = buildSettings()
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      markers: {
        '2026-04-17': ['travel'],
      },
    })

    const replay = runCoachingReplayScenario({
      id: 'travel-window',
      expectedDecisionType: 'ignore_period_due_to_confounders',
      expectedBlockedReasonCodes: ['explicit_day_confounder'],
      params: {
        windowEnd: '2026-04-21',
        settings,
        logsByDate: window.logsByDate,
        dayMeta: window.dayMeta,
        weights: window.weights,
        activityLog: window.activityLog,
      },
    })

    expect(replay.matchedDecisionType).toBe(true)
    expect(replay.matchedBlockedReasons).toBe(true)
    expect(replay.evaluation.quality.confounders.hasTravel).toBe(true)
  })

  it('reports decision and confidence drift in shadow comparisons', () => {
    const settings = buildSettings()
    const baselineWindow = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.125,
    })
    const confoundedWindow = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      markers: {
        '2026-04-19': ['illness'],
      },
      weightForIndex: (index) => 200 - index * 0.125,
    })

    const baseline = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: baselineWindow.logsByDate,
      dayMeta: baselineWindow.dayMeta,
      weights: baselineWindow.weights,
      activityLog: baselineWindow.activityLog,
    })
    const confounded = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: confoundedWindow.logsByDate,
      dayMeta: confoundedWindow.dayMeta,
      weights: confoundedWindow.weights,
      activityLog: confoundedWindow.activityLog,
    })

    const comparison = compareCoachingShadowMode(
      baseline.recommendation,
      confounded.recommendation,
    )

    expect(comparison.decisionChanged).toBe(true)
    expect(comparison.blockedReasonCodesChanged).toBe(true)
  })
})
