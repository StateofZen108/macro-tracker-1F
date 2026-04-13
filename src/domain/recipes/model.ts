import type { FoodLogEntry } from '../../types'
import type { Recipe, RecipeIngredient } from './types'

export interface RecipeNutritionTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildRecipeFromEntries(input: {
  name: string
  defaultServings: number
  entries: FoodLogEntry[]
  servingsLabel?: string
  notes?: string
  now?: string
}): Recipe {
  const now = input.now ?? new Date().toISOString()
  const ingredients: RecipeIngredient[] = input.entries.map((entry, index) => ({
    id: crypto.randomUUID(),
    foodId: entry.foodId,
    snapshot: entry.snapshot,
    servings: entry.servings,
    createdAt: new Date(Date.parse(now) + index).toISOString(),
  }))

  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    defaultServings: input.defaultServings,
    servingsLabel: input.servingsLabel?.trim() || undefined,
    ingredients,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }
}

export function matchesRecipeQuery(recipe: Recipe, query: string): boolean {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) {
    return true
  }

  return [
    recipe.name,
    recipe.notes ?? '',
    ...recipe.ingredients.map((ingredient) => ingredient.snapshot.name),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery)
}

export function rollupRecipeNutrition(
  recipe: Recipe,
  servings = recipe.defaultServings,
): RecipeNutritionTotals {
  const total = recipe.ingredients.reduce<RecipeNutritionTotals>(
    (totals, ingredient) => ({
      calories: totals.calories + ingredient.snapshot.calories * ingredient.servings,
      protein: totals.protein + ingredient.snapshot.protein * ingredient.servings,
      carbs: totals.carbs + ingredient.snapshot.carbs * ingredient.servings,
      fat: totals.fat + ingredient.snapshot.fat * ingredient.servings,
      fiber: totals.fiber + (ingredient.snapshot.fiber ?? 0) * ingredient.servings,
    }),
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    },
  )

  if (servings <= 0 || servings === recipe.defaultServings) {
    return total
  }

  const multiplier = servings / recipe.defaultServings
  return {
    calories: total.calories * multiplier,
    protein: total.protein * multiplier,
    carbs: total.carbs * multiplier,
    fat: total.fat * multiplier,
    fiber: total.fiber * multiplier,
  }
}
