import { describe, expect, it } from 'vitest'
import { evaluateCoachingWindow } from '../../src/domain/coaching/math'
import type { DayMeta, FoodLogEntry, InterventionEntry, UserSettings, WeightEntry } from '../../src/types'

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
}

function logEntry(date: string, calories: number): FoodLogEntry {
  return {
    id: `log-${date}`,
    date,
    meal: 'breakfast',
    servings: 1,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    snapshot: {
      name: 'Coaching meal',
      servingSize: 1,
      servingUnit: 'entry',
      calories,
      protein: 180,
      carbs: 200,
      fat: 60,
      source: 'custom',
    },
  }
}

describe('coaching math', () => {
  it('produces actionable all-day and eating-day targets when fasting days exist', () => {
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const weights: WeightEntry[] = []

    for (let day = 0; day < 21; day += 1) {
      const date = `2026-03-${`${11 + day}`.padStart(2, '0')}`
      if (day < 18) {
        logsByDate[date] = [logEntry(date, 2000)]
      }
      dayMeta.push({
        date,
        status: day < 3 ? 'fasting' : 'complete',
        updatedAt: `${date}T09:00:00.000Z`,
      })
      weights.push({
        id: `weight-${day}`,
        date,
        weight: 200 - day * 0.1,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    }

    const result = evaluateCoachingWindow('2026-03-31', settings, logsByDate, weights, dayMeta, [], 0)
    expect(result.confidenceBand === 'medium' || result.confidenceBand === 'high').toBe(true)
    expect(result.fastingDays).toBe(3)
    expect(result.allDayRecommendedCalories).not.toBeNull()
    expect(result.eatingDayRecommendedCalories).not.toBeNull()
  })

  it('adds intervention confounders and caps confidence on recent changes', () => {
    const logsByDate: Record<string, FoodLogEntry[]> = {}
    const dayMeta: DayMeta[] = []
    const weights: WeightEntry[] = []
    const interventions: InterventionEntry[] = [
      {
        id: 'int-1',
        date: '2026-03-30',
        name: 'Caffeine',
        category: 'stimulant',
        dose: 200,
        unit: 'mg',
        createdAt: '2026-03-30T08:00:00.000Z',
        updatedAt: '2026-03-30T08:00:00.000Z',
      },
    ]

    for (let day = 0; day < 21; day += 1) {
      const date = `2026-03-${`${11 + day}`.padStart(2, '0')}`
      logsByDate[date] = [logEntry(date, 2000)]
      dayMeta.push({ date, status: 'complete', updatedAt: `${date}T09:00:00.000Z` })
      weights.push({
        id: `weight-${day}`,
        date,
        weight: 200 - day * 0.1,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    }

    const result = evaluateCoachingWindow('2026-03-31', settings, logsByDate, weights, dayMeta, interventions, 0)
    expect(result.confounders.length).toBeGreaterThan(0)
    expect(result.confidenceScore).toBeLessThanOrEqual(74)
  })
})
