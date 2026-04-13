import type {
  CoachingInputV1,
  DailyCoachingSeriesV1,
  DayMeta,
  FoodLogEntry,
  UserSettings,
} from '../../types'
import { enumerateDateKeys } from '../../utils/dates'
import {
  buildNutrientProfileFromLegacyNutrition,
  getNutrientAmountV1,
  sumNutrientProfilesV1,
} from '../nutrition'
import type {
  DailyCoachingPointV1,
  DailyCoachingSeriesSummaryV1,
} from './types'

function buildDayMetaMap(dayMeta: DayMeta[]): Map<string, DayMeta['status']> {
  return new Map(dayMeta.map((entry) => [entry.date, entry.status]))
}

function buildDayMetaEntryMap(dayMeta: DayMeta[]): Map<string, DayMeta> {
  return new Map(dayMeta.map((entry) => [entry.date, entry]))
}

export function buildDailyCoachingSeriesV1(
  windowStart: string,
  windowEnd: string,
  logsByDate: Record<string, FoodLogEntry[]>,
  dayMeta: DayMeta[],
): DailyCoachingPointV1[] {
  const dates = enumerateDateKeys(windowStart, windowEnd)
  const dayMetaMap = buildDayMetaMap(dayMeta)
  const dayMetaEntryMap = buildDayMetaEntryMap(dayMeta)

  return dates.map((date) => {
    const entries = logsByDate[date] ?? []
    const status = dayMetaMap.get(date) ?? 'unmarked'
    const metaEntry = dayMetaEntryMap.get(date)
    const hasEntries = entries.length > 0
    const fasting = status === 'fasting'
    const partial = status === 'partial'
    const complete = status === 'complete'
    const unmarkedLogged = status === 'unmarked' && hasEntries
    const countsTowardEligibility = fasting || (!partial && hasEntries)
    const countsTowardExplicitEligibility = fasting || (complete && hasEntries)
    const countsAsEatingDay = hasEntries && !partial && !fasting
    const countsTowardIntake = hasEntries || fasting
    const nutrients = sumNutrientProfilesV1(
      entries.map((entry) => buildNutrientProfileFromLegacyNutrition(entry.snapshot, entry.servings)),
    )
    const series: DailyCoachingSeriesV1 = {
      date,
      intakeState: partial ? 'partial' : fasting ? 'fasting' : hasEntries ? 'complete' : 'untracked',
      explicitDayState: status !== 'unmarked',
      calories: getNutrientAmountV1(nutrients, 'calories') ?? 0,
      protein: getNutrientAmountV1(nutrients, 'protein') ?? 0,
      carbs: getNutrientAmountV1(nutrients, 'carbs') ?? 0,
      fat: getNutrientAmountV1(nutrients, 'fat') ?? 0,
      fiber: getNutrientAmountV1(nutrients, 'fiber') ?? 0,
      recentImport: false,
      confounders: [...(metaEntry?.markers ?? [])],
    }

    return {
      series,
      date,
      status,
      hasEntries,
      entryCount: entries.length,
      nutrients,
      countsTowardIntake,
      countsTowardEligibility,
      countsTowardExplicitEligibility,
      countsAsEatingDay,
      fasting,
      partial,
      complete,
      unmarkedLogged,
    }
  })
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarizeDailyCoachingSeriesV1(
  series: ReadonlyArray<DailyCoachingPointV1>,
): DailyCoachingSeriesSummaryV1 {
  const eligibleCalories: number[] = []
  const eligibleProtein: number[] = []

  for (const day of series) {
    if (!day.countsTowardEligibility) {
      continue
    }

    if (day.fasting) {
      eligibleCalories.push(0)
      eligibleProtein.push(0)
      continue
    }

    eligibleCalories.push(getNutrientAmountV1(day.nutrients, 'calories') ?? 0)
    eligibleProtein.push(getNutrientAmountV1(day.nutrients, 'protein') ?? 0)
  }

  return {
    intakeDays: series.filter((day) => day.countsTowardIntake).length,
    eligibleDays: series.filter((day) => day.countsTowardEligibility).length,
    explicitEligibleDays: series.filter((day) => day.countsTowardExplicitEligibility).length,
    completeDays: series.filter((day) => day.complete).length,
    partialDays: series.filter((day) => day.partial).length,
    fastingDays: series.filter((day) => day.fasting).length,
    unmarkedLoggedDays: series.filter((day) => day.unmarkedLogged).length,
    eatingDays: series.filter((day) => day.countsAsEatingDay).length,
    avgEligibleCalories: average(eligibleCalories),
    avgEligibleProtein: average(eligibleProtein),
  }
}

interface BuildCoachingInputParams {
  windowStart: string
  windowEnd: string
  settings: UserSettings
  logsByDate: Record<string, FoodLogEntry[]>
  dayMeta: DayMeta[]
}

export function buildCoachingInputV1({
  windowStart,
  windowEnd,
  settings,
  logsByDate,
  dayMeta,
}: BuildCoachingInputParams): CoachingInputV1 {
  const recentImportCutoff = new Date(`${windowEnd}T00:00:00.000Z`)
  recentImportCutoff.setUTCDate(recentImportCutoff.getUTCDate() - 6)
  const recentlyImported =
    typeof settings.lastImportAt === 'string' &&
    settings.lastImportAt.slice(0, 10) >= recentImportCutoff.toISOString().slice(0, 10)

  return {
    windowStart,
    windowEnd,
    goalMode: settings.goalMode,
    calorieTarget: settings.calorieTarget,
    proteinTarget: settings.proteinTarget,
    carbTarget: settings.carbTarget,
    fatTarget: settings.fatTarget,
    targetWeeklyRatePercent: settings.targetWeeklyRatePercent,
    series: buildDailyCoachingSeriesV1(windowStart, windowEnd, logsByDate, dayMeta).map((day) => ({
      ...day.series,
      recentImport: recentlyImported,
    })),
  }
}
