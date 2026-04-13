import type { BulkApplyPreview, FoodLogEntry, MealType } from '../../types'
import { calculateFoodNutrition, sumNutrition } from '../../utils/macros'

function getBulkOverlapKey(entry: FoodLogEntry): string {
  return (entry.foodId ?? entry.snapshot.name).trim().toLowerCase()
}

export function buildBulkApplyPreview(
  targetDate: string,
  incomingEntries: FoodLogEntry[],
  targetEntries: FoodLogEntry[],
  targetMeal?: MealType,
): BulkApplyPreview {
  const existingCalories = sumNutrition(
    targetEntries.map((entry) => calculateFoodNutrition(entry.snapshot, entry.servings)),
  ).calories
  const incomingCalories = sumNutrition(
    incomingEntries.map((entry) => calculateFoodNutrition(entry.snapshot, entry.servings)),
  ).calories
  const existingKeys = new Set(targetEntries.map(getBulkOverlapKey))
  const possibleOverlapCount = incomingEntries.filter((entry) => existingKeys.has(getBulkOverlapKey(entry)))
    .length

  return {
    targetDate,
    targetMeal,
    existingEntryCount: targetEntries.length,
    incomingEntryCount: incomingEntries.length,
    existingCalories,
    incomingCalories,
    possibleOverlapCount,
    modeRecommendation:
      possibleOverlapCount > 0 || targetEntries.length > 0 ? 'replaceTarget' : 'append',
  }
}
