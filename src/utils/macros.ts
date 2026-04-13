import type {
  Food,
  FoodLogEntry,
  FoodSnapshot,
  MacroProgress,
  MealType,
  NutritionTotals,
  ResolvedFoodLogEntry,
  WeightChartPoint,
  WeightEntry,
  WeightRange,
  WeightUnit,
} from '../types'
import { MEAL_TYPES } from '../types'
import {
  enumerateDateKeys,
  formatShortDate,
  getRangeCutoff,
  sortDatesAscending,
} from './dates'

type MacroSource = Pick<Food | FoodSnapshot, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>

const POUNDS_PER_KILOGRAM = 2.2046226218

function roundTo(value: number, digits = 1): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

export function emptyNutrition(): NutritionTotals {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  }
}

export function sumNutrition(items: NutritionTotals[]): NutritionTotals {
  return items.reduce(
    (totals, item) => ({
      calories: roundTo(totals.calories + item.calories),
      protein: roundTo(totals.protein + item.protein),
      carbs: roundTo(totals.carbs + item.carbs),
      fat: roundTo(totals.fat + item.fat),
      fiber: roundTo(totals.fiber + item.fiber),
    }),
    emptyNutrition(),
  )
}

export function calculateFoodNutrition(source: MacroSource, servings: number): NutritionTotals {
  return {
    calories: roundTo(source.calories * servings),
    protein: roundTo(source.protein * servings),
    carbs: roundTo(source.carbs * servings),
    fat: roundTo(source.fat * servings),
    fiber: roundTo((source.fiber ?? 0) * servings),
  }
}

export function resolveLogEntries(entries: FoodLogEntry[], foods: Food[]): ResolvedFoodLogEntry[] {
  const foodIndex = new Map(foods.map((food) => [food.id, food]))

  return [...entries]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((entry) => ({
      ...entry,
      sourceFood: entry.foodId ? foodIndex.get(entry.foodId) ?? null : null,
      nutrition: calculateFoodNutrition(entry.snapshot, entry.servings),
    }))
}

export function groupEntriesByMeal(entries: ResolvedFoodLogEntry[]): Record<MealType, ResolvedFoodLogEntry[]> {
  return MEAL_TYPES.reduce(
    (groups, meal) => ({
      ...groups,
      [meal]: entries.filter((entry) => entry.meal === meal),
    }),
    {} as Record<MealType, ResolvedFoodLogEntry[]>,
  )
}

export function buildMealTotals(groups: Record<MealType, ResolvedFoodLogEntry[]>): Record<MealType, NutritionTotals> {
  return MEAL_TYPES.reduce(
    (totals, meal) => ({
      ...totals,
      [meal]: sumNutrition(groups[meal].map((entry) => entry.nutrition)),
    }),
    {} as Record<MealType, NutritionTotals>,
  )
}

export function calculateMacroProgress(total: number, target: number): MacroProgress {
  if (target <= 0) {
    return {
      percent: 0,
      tone: 'under',
      remaining: 0,
    }
  }

  const ratio = total / target

  return {
    percent: Math.min(ratio * 100, 100),
    tone: ratio > 1 ? 'over' : ratio >= 0.85 ? 'near' : 'under',
    remaining: roundTo(target - total),
  }
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  return roundTo(total / values.length, 2)
}

export function convertWeight(weight: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (fromUnit === toUnit) {
    return roundTo(weight, 2)
  }

  if (fromUnit === 'lb') {
    return roundTo(weight / POUNDS_PER_KILOGRAM, 2)
  }

  return roundTo(weight * POUNDS_PER_KILOGRAM, 2)
}

export function buildWeightChartPoints(
  weights: WeightEntry[],
  range: WeightRange,
  displayUnit: WeightUnit,
): WeightChartPoint[] {
  const ascendingWeights = sortDatesAscending(weights)
  if (!ascendingWeights.length) {
    return []
  }

  const firstDate = ascendingWeights[0]?.date
  const lastDate = ascendingWeights[ascendingWeights.length - 1]?.date

  if (!firstDate || !lastDate) {
    return []
  }

  const cutoff = range === 'all' ? firstDate : getRangeCutoff(range === '30' ? 30 : 90)
  const startDate = cutoff > firstDate ? cutoff : firstDate
  const relevantDates = enumerateDateKeys(startDate, lastDate)
  const weightIndex = new Map(
    ascendingWeights.map((entry) => [entry.date, convertWeight(entry.weight, entry.unit, displayUnit)]),
  )

  return relevantDates.map((date, index) => {
    const currentWeight = weightIndex.get(date) ?? null
    const windowDates = relevantDates.slice(Math.max(0, index - 6), index + 1)
    const trendValues = windowDates
      .map((windowDate) => weightIndex.get(windowDate))
      .filter((value): value is number => value !== undefined)

    return {
      date,
      label: formatShortDate(date),
      weight: currentWeight,
      trend: trendValues.length >= 3 ? average(trendValues) : null,
    }
  })
}
