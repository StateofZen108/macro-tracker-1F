import { describe, expect, it } from 'vitest'
import { buildCoachingEngineInput } from '../../src/domain/coaching/engine'
import { buildSettings, buildWindowData } from './coaching.engine.fixtures'

describe('coaching engine input', () => {
  it('builds a 21-day context with recent-import, activity, and weigh-in attachments', () => {
    const settings = buildSettings({
      lastImportAt: '2026-04-15T08:00:00.000Z',
      dailyStepTarget: 8000,
      weeklyCardioMinuteTarget: 150,
    })
    const window = buildWindowData({
      start: '2026-04-01',
      end: '2026-04-21',
      weightForIndex: (index) => 210 - index * 0.1,
      steps: 10000,
      cardioMinutes: 30,
    })

    const context = buildCoachingEngineInput({
      windowEnd: '2026-04-21',
      settings,
      logsByDate: window.logsByDate,
      dayMeta: window.dayMeta,
      weights: window.weights,
      activityLog: window.activityLog,
    })

    expect(context.windowStart).toBe('2026-04-01')
    expect(context.windowEnd).toBe('2026-04-21')
    expect(context.recentlyImported).toBe(true)
    expect(context.input.windowStart).toBe('2026-04-01')
    expect(context.input.windowEnd).toBe('2026-04-21')
    expect(context.input.dailyStepTarget).toBe(8000)
    expect(context.input.weeklyCardioMinuteTarget).toBe(150)
    expect(context.series).toHaveLength(21)
    expect(context.series[0]).toMatchObject({
      date: '2026-04-01',
      recentImport: true,
      steps: 10000,
      cardioMinutes: 30,
    })
    expect(context.series[0]?.weighIn?.unit).toBe('lb')
    expect(context.series[0]?.weighIn?.weight).toBeCloseTo(210, 5)
  })
})
