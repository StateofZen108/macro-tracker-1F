import type {
  ActivityEntry,
  DayMeta,
  FoodLogEntry,
  InterventionEntry,
  UserSettings,
  WeightEntry,
} from '../../src/types'
import { enumerateDateKeys } from '../../src/utils/dates'

export function buildSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    calorieTarget: 2200,
    proteinTarget: 180,
    carbTarget: 220,
    fatTarget: 60,
    weightUnit: 'lb',
    goalMode: 'lose',
    fatLossMode: 'standard_cut',
    coachingEnabled: true,
    checkInWeekday: 1,
    targetWeeklyRatePercent: -0.5,
    askCoachEnabled: true,
    shareInterventionsWithCoach: true,
    coachCitationsExpanded: true,
    ...overrides,
  }
}

export function buildLogEntry(date: string, calories: number, protein = 180): FoodLogEntry {
  return {
    id: `log:${date}`,
    date,
    meal: 'lunch',
    servings: 1,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    snapshot: {
      name: 'Coach meal',
      servingSize: 1,
      servingUnit: 'plate',
      calories,
      protein,
      carbs: 220,
      fat: 60,
      source: 'custom',
    },
  }
}

interface BuildWindowOptions {
  start: string
  end: string
  calories?: number
  protein?: number
  statuses?: Partial<Record<string, DayMeta['status']>>
  markers?: Partial<Record<string, NonNullable<DayMeta['markers']>>>
  skippedLogDates?: string[]
  skippedWeightDates?: string[]
  weightForIndex?: (index: number, date: string) => number
  steps?: number
  cardioMinutes?: number
}

export function buildWindowData(options: BuildWindowOptions): {
  logsByDate: Record<string, FoodLogEntry[]>
  dayMeta: DayMeta[]
  weights: WeightEntry[]
  activityLog: ActivityEntry[]
} {
  const logsByDate: Record<string, FoodLogEntry[]> = {}
  const dayMeta: DayMeta[] = []
  const weights: WeightEntry[] = []
  const activityLog: ActivityEntry[] = []
  const skippedLogDates = new Set(options.skippedLogDates ?? [])
  const skippedWeightDates = new Set(options.skippedWeightDates ?? [])
  const dates = enumerateDateKeys(options.start, options.end)

  dates.forEach((date, index) => {
    if (!skippedLogDates.has(date)) {
      logsByDate[date] = [buildLogEntry(date, options.calories ?? 2000, options.protein ?? 180)]
    }

    dayMeta.push({
      date,
      status: options.statuses?.[date] ?? 'complete',
      markers: options.markers?.[date],
      updatedAt: `${date}T09:00:00.000Z`,
    })

    if (!skippedWeightDates.has(date)) {
      weights.push({
        id: `weight:${date}`,
        date,
        weight: options.weightForIndex?.(index, date) ?? 200 - index * 0.125,
        unit: 'lb',
        createdAt: `${date}T07:00:00.000Z`,
      })
    }

    activityLog.push({
      date,
      steps: options.steps ?? 9000,
      cardioMinutes: options.cardioMinutes ?? 25,
      cardioType: 'walk',
      updatedAt: `${date}T19:00:00.000Z`,
    })
  })

  return {
    logsByDate,
    dayMeta,
    weights,
    activityLog,
  }
}

export function buildIntervention(date: string, dose = 200): InterventionEntry {
  return {
    id: `intervention:${date}`,
    date,
    name: 'Caffeine',
    category: 'stimulant',
    dose,
    unit: 'mg',
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}
