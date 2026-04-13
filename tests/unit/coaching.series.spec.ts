import { describe, expect, it } from 'vitest'
import {
  buildCoachingExplanationV1,
  buildCoachingInputV1,
  buildCoachingRecommendationV1,
  buildDailyCoachingSeriesV1,
  summarizeDailyCoachingSeriesV1,
} from '../../src/domain/coaching'
import type { DayMeta, FoodLogEntry, UserSettings } from '../../src/types'
import type { WindowEvaluation } from '../../src/domain/coaching/math'

const settings: UserSettings = {
  calorieTarget: 2200,
  proteinTarget: 180,
  carbTarget: 220,
  fatTarget: 60,
  weightUnit: 'lb',
  goalMode: 'lose',
  coachingEnabled: true,
  checkInWeekday: 1,
  targetWeeklyRatePercent: -0.5,
  askCoachEnabled: true,
  shareInterventionsWithCoach: true,
  coachCitationsExpanded: true,
  lastImportAt: '2026-04-03T08:00:00.000Z',
}

function logEntry(date: string, calories: number, protein: number): FoodLogEntry {
  return {
    id: `log-${date}`,
    date,
    meal: 'breakfast',
    servings: 1,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    snapshot: {
      name: 'Meal',
      servingSize: 1,
      servingUnit: 'serving',
      calories,
      protein,
      carbs: 150,
      fat: 50,
      source: 'custom',
    },
  }
}

describe('coaching series V1', () => {
  it('builds shared daily coaching series flags and averages from legacy logs/day meta', () => {
    const logsByDate: Record<string, FoodLogEntry[]> = {
      '2026-04-01': [logEntry('2026-04-01', 2000, 150)],
      '2026-04-03': [logEntry('2026-04-03', 1000, 80)],
      '2026-04-04': [logEntry('2026-04-04', 2200, 170)],
    }
    const dayMeta: DayMeta[] = [
      { date: '2026-04-01', status: 'complete', updatedAt: '2026-04-01T09:00:00.000Z' },
      { date: '2026-04-02', status: 'fasting', updatedAt: '2026-04-02T09:00:00.000Z' },
      { date: '2026-04-03', status: 'partial', updatedAt: '2026-04-03T09:00:00.000Z' },
    ]

    const series = buildDailyCoachingSeriesV1('2026-04-01', '2026-04-04', logsByDate, dayMeta)
    const summary = summarizeDailyCoachingSeriesV1(series)

    expect(series).toHaveLength(4)
    expect(series[1]?.fasting).toBe(true)
    expect(series[2]?.partial).toBe(true)
    expect(series[3]?.unmarkedLogged).toBe(true)
    expect(summary.intakeDays).toBe(4)
    expect(summary.eligibleDays).toBe(3)
    expect(summary.explicitEligibleDays).toBe(2)
    expect(summary.eatingDays).toBe(2)
    expect(summary.avgEligibleCalories).toBeCloseTo(1400, 5)
    expect(summary.avgEligibleProtein).toBeCloseTo(106.6666667, 5)
  })

  it('builds a coaching input contract from legacy logs without changing app settings types', () => {
    const input = buildCoachingInputV1({
      windowStart: '2026-04-01',
      windowEnd: '2026-04-07',
      settings,
      logsByDate: { '2026-04-01': [logEntry('2026-04-01', 2000, 150)] },
      dayMeta: [{ date: '2026-04-01', status: 'complete', updatedAt: '2026-04-01T09:00:00.000Z' }],
    })

    expect(input.goalMode).toBe('lose')
    expect(input.series).toHaveLength(7)
    expect(input.series[0]).toMatchObject({
      date: '2026-04-01',
      intakeState: 'complete',
      recentImport: true,
      calories: 2000,
      protein: 150,
    })
  })

  it('builds deterministic recommendation and explanation contracts from a window evaluation', () => {
    const window: WindowEvaluation = {
      windowStart: '2026-03-12',
      windowEnd: '2026-04-01',
      intakeDays: 18,
      weighInDays: 10,
      eligibleDays: 17,
      completeDays: 14,
      partialDays: 2,
      fastingDays: 1,
      unmarkedLoggedDays: 1,
      avgDailyCalories: 2050,
      avgDailyProtein: 185,
      estimatedTdee: 2550,
      allDayRecommendedCalories: 2050,
      eatingDayRecommendedCalories: 2180,
      recommendedCalories: 2050,
      confidenceScore: 78,
      confidenceBand: 'high',
      explanation: '17 eligible days. Recommendation ready.',
      reason: 'Recommendation ready',
      adherenceTone: 'onTrack',
      weightChangeLb: -1.2,
      confounders: ['Caffeine started recently.'],
      hasInterventionConfounder: true,
      recentlyImported: true,
      isActionable: true,
    }

    const recommendation = buildCoachingRecommendationV1(window, settings, 21)
    const explanation = buildCoachingExplanationV1(window)

    expect(recommendation.recommendedCalories).toBe(2050)
    expect(recommendation.blockedBy).toEqual(
      expect.arrayContaining(['partialDays', 'unmarkedLoggedDays', 'recentImport', 'interventionConfounder']),
    )
    expect(explanation.reasons).toEqual(
      expect.arrayContaining(['Recommendation ready', 'Recent import activity is capping coaching confidence.']),
    )
  })
})
