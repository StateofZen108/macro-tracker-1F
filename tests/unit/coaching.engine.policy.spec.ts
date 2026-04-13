import { describe, expect, it } from 'vitest'
import { evaluateCoachingEngineV1 } from '../../src/domain/coaching/engine'
import { buildSettings, buildWindowData } from './coaching.engine.fixtures'

describe('coaching engine policy', () => {
  it('keeps targets when observed rate stays within the 0.15 BW/week band', () => {
    const settings = buildSettings()
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.125,
    })

    const evaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.quality.isActionable).toBe(true)
    expect(evaluation.policy.decisionType).toBe('keep_targets')
    expect(evaluation.policy.recommendedCalories).toBe(settings.calorieTarget)
    expect(evaluation.policy.proposedTargets).toBeUndefined()
  })

  it('reduces calories by 100 via carbs when loss is slower than target by a moderate margin', () => {
    const settings = buildSettings()
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 200 - index * 0.05,
    })

    const evaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('decrease_calories')
    expect(evaluation.policy.calorieDelta).toBe(-100)
    expect(evaluation.policy.recommendedCalories).toBe(2100)
    expect(evaluation.policy.recommendedMacros?.carbs).toBe(195)
  })

  it('applies the 1200 calorie floor after a larger reduction', () => {
    const settings = buildSettings({
      calorieTarget: 1250,
      carbTarget: 110,
      targetWeeklyRatePercent: -0.8,
    })
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      calories: 1250,
      weightForIndex: () => 200,
    })

    const evaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('decrease_calories')
    expect(evaluation.policy.recommendedCalories).toBeGreaterThanOrEqual(1200)
    expect(evaluation.policy.reasonCodes).toContain('calorieFloorApplied')
    expect(evaluation.policy.proposedTargets?.calorieTarget).toBe(evaluation.policy.recommendedCalories)
  })

  it('holds for more data when adherence is below the minimum threshold', () => {
    const settings = buildSettings({
      calorieTarget: 2200,
      proteinTarget: 180,
      dailyStepTarget: 10000,
    })
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      calories: 2600,
      protein: 120,
      steps: 7000,
      weightForIndex: (index) => 200 - index * 0.11,
    })

    const evaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('hold_for_more_data')
    expect(evaluation.quality.blockedBy).toContain('adherence_low')
    expect(evaluation.quality.adherence.isAdequate).toBe(false)
  })

  it('ignores the period when explicit confounders make the window non-representative', () => {
    const settings = buildSettings()
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      markers: {
        '2026-04-17': ['travel'],
        '2026-04-18': ['travel'],
      },
    })

    const evaluation = evaluateCoachingEngineV1({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(evaluation.policy.decisionType).toBe('ignore_period_due_to_confounders')
    expect(evaluation.quality.blockedBy).toContain('explicit_day_confounder')
    expect(evaluation.recommendation.blockedBy).toContain('explicit_day_confounder')
  })
})
