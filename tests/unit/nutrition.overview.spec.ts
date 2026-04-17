import { describe, expect, it } from 'vitest'
import { buildNutritionOverview, emptyNutrientProfileV1, setNutrientAmountV1 } from '../../src/domain/nutrition'
import type { DayMeta, FoodLogEntry, NutrientProfileV1, UserSettings } from '../../src/types'

function buildProfile(values: Record<string, number>): NutrientProfileV1 {
  return Object.entries(values).reduce((profile, [key, value]) => {
    if (typeof value !== 'number') {
      return profile
    }

    return setNutrientAmountV1(profile, key as Parameters<typeof setNutrientAmountV1>[1], value)
  }, emptyNutrientProfileV1('serving'))
}

function makeLog(date: string, calories: number, nutrients?: NutrientProfileV1): FoodLogEntry {
  return {
    id: `log-${date}-${calories}`,
    date,
    meal: 'breakfast',
    servings: 1,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    snapshot: {
      name: 'Tracked meal',
      servingSize: 1,
      servingUnit: 'entry',
      calories,
      protein: 80,
      carbs: 40,
      fat: 20,
      source: 'custom',
      nutrients,
    },
  }
}

describe('buildNutritionOverview', () => {
  it('builds daily and 7-day sufficiency windows from logged nutrients', () => {
    const today = '2026-04-16'
    const logsByDate: Record<string, FoodLogEntry[]> = {
      [today]: [
        makeLog(
          today,
          1200,
          buildProfile({
            fiber: 30,
            sodium: 1800,
            potassium: 5000,
            calcium: 1400,
            magnesium: 450,
            iron: 12,
            vitaminC: 110,
            vitaminD: 20,
            vitaminB12: 3.2,
          }),
        ),
      ],
      '2026-04-15': [
        makeLog(
          '2026-04-15',
          1000,
          buildProfile({
            fiber: 26,
            sodium: 1700,
            potassium: 4700,
            calcium: 1300,
            magnesium: 420,
            iron: 10,
            vitaminC: 90,
            vitaminD: 18,
            vitaminB12: 2.6,
          }),
        ),
      ],
    }
    const dayMeta: DayMeta[] = [
      { date: today, status: 'complete', updatedAt: `${today}T09:00:00.000Z` },
      { date: '2026-04-15', status: 'complete', updatedAt: '2026-04-15T09:00:00.000Z' },
      { date: '2026-04-14', status: 'fasting', updatedAt: '2026-04-14T09:00:00.000Z' },
    ]

    const overview = buildNutritionOverview({
      today,
      logsByDate,
      dayMeta,
      foods: [],
      includeV2: true,
    })

    expect(overview.today.trackedDays).toBe(1)
    expect(overview.trailingWeek.trackedDays).toBe(3)
    expect(overview.trailingMonth?.trackedDays).toBe(3)
    expect(overview.today.metrics.find((metric) => metric.key === 'fiber')?.status).toBe('adequate')
    expect(overview.today.metrics.find((metric) => metric.key === 'potassium')?.status).toBe('adequate')
    expect(overview.today.metrics.find((metric) => metric.key === 'vitaminB12')?.status).toBe('adequate')
    expect(overview.today.contributors[0]?.name).toBe('Tracked meal')
    expect(overview.trailingWeek.completenessPercent).toBeGreaterThan(0)
    expect(overview.supportedNutrients.length).toBeGreaterThanOrEqual(50)
  })

  it('marks nutrients as limited when most calories lack micronutrient coverage', () => {
    const today = '2026-04-16'
    const logsByDate: Record<string, FoodLogEntry[]> = {
      [today]: [
        makeLog(today, 900),
        makeLog(
          today,
          300,
          buildProfile({
            fiber: 12,
            vitaminC: 40,
          }),
        ),
      ],
    }

    const overview = buildNutritionOverview({
      today,
      logsByDate,
      dayMeta: [{ date: today, status: 'complete', updatedAt: `${today}T09:00:00.000Z` }],
      foods: [],
      includeV2: true,
    })

    expect(overview.today.metrics.find((metric) => metric.key === 'fiber')?.status).toBe('limited')
    expect(overview.today.metrics.find((metric) => metric.key === 'fiber')?.coveragePercent).toBe(25)
    expect(overview.today.deficiencyAlerts.some((alert) => alert.nutrientKey === 'fiber')).toBe(true)
  })

  it('adds contributor records and deficiency alerts for long windows', () => {
    const today = '2026-04-16'
    const logsByDate: Record<string, FoodLogEntry[]> = {
      [today]: [
        {
          ...makeLog(
            today,
            700,
            buildProfile({
              fiber: 5,
              calcium: 150,
              vitaminD: 2,
            }),
          ),
          foodId: 'lean-fish',
          snapshot: {
            ...makeLog(
              today,
              700,
              buildProfile({
                fiber: 5,
                calcium: 150,
                vitaminD: 2,
              }),
            ).snapshot,
            name: 'Lean Fish',
            brand: 'Test Catch',
          },
        },
        {
          ...makeLog(
            today,
            300,
            buildProfile({
              fiber: 2,
              vitaminC: 15,
            }),
          ),
          foodId: 'greens',
          snapshot: {
            ...makeLog(
              today,
              300,
              buildProfile({
                fiber: 2,
                vitaminC: 15,
              }),
            ).snapshot,
            name: 'Greens',
            brand: 'Garden Test',
          },
        },
      ],
    }

    const overview = buildNutritionOverview({
      today,
      logsByDate,
      dayMeta: [{ date: today, status: 'complete', updatedAt: `${today}T09:00:00.000Z` }],
      foods: [],
      includeV2: true,
    })

    expect(overview.trailingMonth?.contributors[0]?.name).toBe('Lean Fish')
    expect(overview.trailingMonth?.contributors[0]?.sharePercent).toBe(70)
    expect((overview.trailingMonth?.deficiencyAlerts.length ?? 0) > 0).toBe(true)
  })

  it('applies custom nutrient goals, none mode, and pinned nutrient preferences', () => {
    const today = '2026-04-16'
    const settings: UserSettings = {
      calorieTarget: 1800,
      proteinTarget: 180,
      carbTarget: 120,
      fatTarget: 50,
      weightUnit: 'lb',
      goalMode: 'lose',
      coachingEnabled: true,
      checkInWeekday: 1,
      targetWeeklyRatePercent: -0.5,
      nutrientGoals: {
        fiber: { mode: 'custom', floor: 20, target: 35, ceiling: 45 },
        vitaminD: { mode: 'none' },
      },
      pinnedNutrients: [
        { key: 'fiber', order: 0 },
        { key: 'potassium', order: 1 },
      ],
    }

    const overview = buildNutritionOverview({
      today,
      logsByDate: {
        [today]: [
          makeLog(
            today,
            1000,
            buildProfile({
              fiber: 28,
              potassium: 4200,
              vitaminD: 20,
            }),
          ),
        ],
      },
      dayMeta: [{ date: today, status: 'complete', updatedAt: `${today}T09:00:00.000Z` }],
      foods: [],
      includeV2: true,
      settings,
    })

    const fiberMetric = overview.today.metrics.find((metric) => metric.key === 'fiber')
    expect(fiberMetric?.goalMode).toBe('custom')
    expect(fiberMetric?.target).toBe(35)
    expect(fiberMetric?.floor).toBe(20)
    expect(fiberMetric?.ceiling).toBe(45)
    expect(overview.today.metrics.some((metric) => metric.key === 'vitaminD')).toBe(false)
    expect(overview.pinnedMetrics.map((metric) => metric.key)).toEqual(['fiber', 'potassium'])
    expect(overview.focusedNutrientKey).toBe('fiber')
    expect(overview.drilldowns.find((entry) => entry.key === 'fiber')?.points.length).toBeGreaterThan(0)
  })
})
