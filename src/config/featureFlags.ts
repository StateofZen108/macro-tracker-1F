export interface FeatureFlags {
  foodCatalogSearch: boolean
  recipes: boolean
  savedMeals: boolean
  favoriteFoods: boolean
  coachEngineV1: boolean
  weeklyDecisionCard: boolean
}

export function resolveFeatureFlag(
  value: string | boolean | undefined,
  mode: string,
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return true
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'off') {
      return false
    }
  }

  return mode !== 'production'
}

export function buildFeatureFlags(env: Record<string, string | boolean | undefined>): FeatureFlags {
  const mode = typeof env.MODE === 'string' && env.MODE.trim() ? env.MODE : 'development'

  return {
    foodCatalogSearch: resolveFeatureFlag(env.VITE_FF_FOOD_CATALOG_SEARCH, mode),
    recipes: resolveFeatureFlag(env.VITE_FF_RECIPES, mode),
    savedMeals: resolveFeatureFlag(env.VITE_FF_SAVED_MEALS, mode),
    favoriteFoods: resolveFeatureFlag(env.VITE_FF_FAVORITE_FOODS, mode),
    coachEngineV1: resolveFeatureFlag(env.VITE_FF_COACH_ENGINE_V1, mode),
    weeklyDecisionCard: resolveFeatureFlag(env.VITE_FF_WEEKLY_DECISION_CARD, mode),
  }
}

export const FEATURE_FLAGS = buildFeatureFlags(import.meta.env as Record<string, string | boolean | undefined>)
