import type {
  CatalogFood,
  FavoriteFood,
  Food,
  FoodIdentityMatch,
  Recipe,
  SavedMeal,
  UnifiedFoodSearchMatchKind,
  UnifiedFoodSearchResult,
  UnifiedFoodSearchResultSource,
} from '../../types.js'
import { getFoodIdentityKey, normalizeFoodIdentity } from '../foods/dedupe.js'

const MATCH_BASE: Record<UnifiedFoodSearchMatchKind, number> = {
  barcode: 1000,
  exact: 900,
  prefix: 760,
  fuzzy: 500,
}

const SOURCE_BONUS: Record<UnifiedFoodSearchResultSource, number> = {
  favorite: 120,
  local_food: 80,
  saved_meal: 70,
  recipe: 60,
  off_cached: 20,
  off_remote: 0,
}

export function normalizeFoodSearchText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
}

function deriveTarget(foodLike: {
  name: string
  brand?: string
  barcode?: string
}): { name: string; full: string; barcode: string } {
  const name = normalizeFoodSearchText(foodLike.name)
  const brand = normalizeFoodSearchText(foodLike.brand ?? '')
  const full = [brand, name].filter(Boolean).join(' ')
  return {
    name,
    full,
    barcode: normalizeFoodIdentity(foodLike.barcode ?? ''),
  }
}

export function deriveSearchMatchKind(
  query: string,
  target: { name: string; brand?: string; barcode?: string },
): UnifiedFoodSearchMatchKind | null {
  const normalizedQuery = normalizeFoodSearchText(query)
  if (!normalizedQuery) {
    return null
  }

  const normalizedTarget = deriveTarget(target)
  if (/^\d{8,}$/.test(normalizedQuery) && normalizedTarget.barcode === normalizedQuery) {
    return 'barcode'
  }

  if (
    normalizedTarget.name === normalizedQuery ||
    normalizedTarget.full === normalizedQuery
  ) {
    return 'exact'
  }

  if (
    normalizedTarget.name.startsWith(normalizedQuery) ||
    normalizedTarget.full.startsWith(normalizedQuery)
  ) {
    return 'prefix'
  }

  if (
    normalizedTarget.name.includes(normalizedQuery) ||
    normalizedTarget.full.includes(normalizedQuery) ||
    normalizedTarget.barcode.includes(normalizedQuery)
  ) {
    return 'fuzzy'
  }

  return null
}

export function buildFoodSearchScore(input: {
  matchKind: UnifiedFoodSearchMatchKind
  source: UnifiedFoodSearchResultSource
  importConfidence?: UnifiedFoodSearchResult['importConfidence']
  sourceQuality?: UnifiedFoodSearchResult['sourceQuality']
  brand?: string
  barcode?: string
  lastUsedAt?: string
  updatedAt?: string
  usageCount?: number
  targetMeal?: string
  resultMeal?: string
  stale?: boolean
}): number {
  let score = MATCH_BASE[input.matchKind] + SOURCE_BONUS[input.source]
  const now = Date.now()
  const lastUsedAt = input.lastUsedAt ? Date.parse(input.lastUsedAt) : NaN
  const daysSinceLastUse = Number.isFinite(lastUsedAt)
    ? Math.floor((now - lastUsedAt) / (24 * 60 * 60 * 1000))
    : Number.POSITIVE_INFINITY

  if (daysSinceLastUse <= 7) {
    score += 40
  } else if (daysSinceLastUse <= 30) {
    score += 20
  }

  score += Math.min(input.usageCount ?? 0, 20) * 2

  if (input.importConfidence === 'direct_match') {
    score += 30
  } else if (input.importConfidence === 'weak_match') {
    score += 5
  } else if (input.importConfidence === 'manual_review_required') {
    score -= 40
  }

  if (input.sourceQuality === 'high') {
    score += 35
  } else if (input.sourceQuality === 'medium') {
    score += 10
  } else if (input.sourceQuality === 'low') {
    score -= 20
  }

  if (input.brand?.trim()) {
    score += 10
  }

  if (input.barcode?.trim()) {
    score += 10
  }

  if (input.targetMeal && input.resultMeal && input.targetMeal === input.resultMeal) {
    score += 25
  }

  if (input.stale) {
    score -= 120
  }

  return score
}

export function isStrongLocalHit(result: UnifiedFoodSearchResult): boolean {
  return (
    ['local_food', 'favorite', 'saved_meal', 'recipe'].includes(result.source) &&
    result.score >= 760
  )
}

export function buildUnifiedSearchResults(input: {
  query: string
  foods: Food[]
  savedMeals: SavedMeal[]
  recipes: Recipe[]
  favorites: FavoriteFood[]
  cachedRemote: CatalogFood[]
  targetMeal?: string
}): UnifiedFoodSearchResult[] {
  const results: UnifiedFoodSearchResult[] = []
  const favoriteSet = new Set(
    input.favorites.filter((favorite) => !favorite.deletedAt).map((favorite) => favorite.foodId),
  )

  for (const food of input.foods) {
    if (food.archivedAt) {
      continue
    }

    const matchKind = deriveSearchMatchKind(input.query, food)
    if (!matchKind) {
      continue
    }

    const favoriteBoost = favoriteSet.has(food.id)
    results.push({
      source: favoriteBoost ? 'favorite' : 'local_food',
      matchKind,
      id: food.id,
      name: food.name,
      brand: food.brand,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      score: buildFoodSearchScore({
        matchKind,
        source: favoriteBoost ? 'favorite' : 'local_food',
        lastUsedAt: food.lastUsedAt,
        updatedAt: food.updatedAt,
        usageCount: food.usageCount,
        importConfidence: food.importConfidence,
        sourceQuality: food.sourceQuality,
        brand: food.brand,
        barcode: food.barcode,
        targetMeal: input.targetMeal,
      }),
      provider: food.provider,
      importConfidence: food.importConfidence,
      sourceQuality: food.sourceQuality,
      sourceQualityNote: food.sourceQualityNote,
      importTrust: food.importTrust,
      lastUsedAt: food.lastUsedAt,
      updatedAt: food.updatedAt,
      record: favoriteBoost
        ? input.favorites.find((favorite) => favorite.foodId === food.id) ?? {
            foodId: food.id,
            createdAt: food.createdAt,
            updatedAt: food.updatedAt ?? food.createdAt,
          }
        : food,
    })
  }

  for (const savedMeal of input.savedMeals) {
    if (savedMeal.deletedAt || savedMeal.archivedAt) {
      continue
    }

    const matchKind = deriveSearchMatchKind(input.query, { name: savedMeal.name })
    if (!matchKind) {
      continue
    }

    results.push({
      source: 'saved_meal',
      matchKind,
      id: savedMeal.id,
      name: savedMeal.name,
      calories: savedMeal.entries.reduce((sum, entry) => sum + entry.snapshot.calories * entry.servings, 0),
      protein: savedMeal.entries.reduce((sum, entry) => sum + entry.snapshot.protein * entry.servings, 0),
      carbs: savedMeal.entries.reduce((sum, entry) => sum + entry.snapshot.carbs * entry.servings, 0),
      fat: savedMeal.entries.reduce((sum, entry) => sum + entry.snapshot.fat * entry.servings, 0),
      score: buildFoodSearchScore({
        matchKind,
        source: 'saved_meal',
        lastUsedAt: savedMeal.lastUsedAt,
        updatedAt: savedMeal.updatedAt,
        usageCount: savedMeal.usageCount,
        targetMeal: input.targetMeal,
        resultMeal: savedMeal.defaultMeal,
      }),
      lastUsedAt: savedMeal.lastUsedAt,
      updatedAt: savedMeal.updatedAt,
      record: savedMeal,
    })
  }

  for (const recipe of input.recipes) {
    if (recipe.deletedAt || recipe.archivedAt) {
      continue
    }

    const matchKind = deriveSearchMatchKind(input.query, { name: recipe.name })
    if (!matchKind) {
      continue
    }

    const divisor = recipe.yieldServings > 0 ? recipe.yieldServings : 1
    results.push({
      source: 'recipe',
      matchKind,
      id: recipe.id,
      name: recipe.name,
      servingSize: 1,
      servingUnit: recipe.yieldLabel ?? 'recipe serving',
      calories:
        recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.calories * ingredient.servings, 0) /
        divisor,
      protein:
        recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.protein * ingredient.servings, 0) /
        divisor,
      carbs:
        recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.carbs * ingredient.servings, 0) /
        divisor,
      fat:
        recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.fat * ingredient.servings, 0) /
        divisor,
      score: buildFoodSearchScore({
        matchKind,
        source: 'recipe',
        lastUsedAt: recipe.lastUsedAt,
        updatedAt: recipe.updatedAt,
        usageCount: recipe.usageCount,
      }),
      lastUsedAt: recipe.lastUsedAt,
      updatedAt: recipe.updatedAt,
      record: recipe,
    })
  }

  for (const cachedFood of input.cachedRemote) {
    const matchKind = deriveSearchMatchKind(input.query, cachedFood)
    if (!matchKind) {
      continue
    }

    results.push({
      source: 'off_cached',
      matchKind,
      id: cachedFood.id,
      name: cachedFood.name,
      brand: cachedFood.brand,
      servingSize: cachedFood.servingSize,
      servingUnit: cachedFood.servingUnit,
      calories: cachedFood.calories,
      protein: cachedFood.protein,
      carbs: cachedFood.carbs,
      fat: cachedFood.fat,
      score: buildFoodSearchScore({
        matchKind,
        source: 'off_cached',
        lastUsedAt: cachedFood.lastUsedAt,
        updatedAt: cachedFood.updatedAt,
        importConfidence: cachedFood.importConfidence,
        sourceQuality: cachedFood.sourceQuality,
        brand: cachedFood.brand,
        barcode: cachedFood.barcode,
        stale: Date.parse(cachedFood.staleAt) <= Date.now(),
      }),
      provider: cachedFood.provider,
      importConfidence: cachedFood.importConfidence,
      sourceQuality: cachedFood.sourceQuality,
      sourceQualityNote: cachedFood.sourceQualityNote,
      importTrust: cachedFood.importTrust,
      lastUsedAt: cachedFood.lastUsedAt,
      updatedAt: cachedFood.updatedAt,
      stale: Date.parse(cachedFood.staleAt) <= Date.now(),
      record: cachedFood,
    })
  }

  return results.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score
    }

    if ((left.lastUsedAt ?? '') !== (right.lastUsedAt ?? '')) {
      return (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '')
    }

    if ((left.updatedAt ?? '') !== (right.updatedAt ?? '')) {
      return (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')
    }

    return left.name.localeCompare(right.name)
  })
}

export function resolveFoodIdentityMatch(input: {
  foods: Food[]
  remoteKey?: string
  barcode?: string
  name: string
  brand?: string
  servingSize?: number
  servingUnit?: string
}): FoodIdentityMatch | null {
  const activeFoods = input.foods.filter((food) => !food.archivedAt)
  const barcode = normalizeFoodIdentity(input.barcode)
  if (barcode) {
    const barcodeMatch = activeFoods.find((food) => normalizeFoodIdentity(food.barcode) === barcode)
    if (barcodeMatch) {
      return {
        strategy: 'barcode',
        localFoodId: barcodeMatch.id,
        remoteKey: input.remoteKey,
      }
    }
  }

  if (input.remoteKey) {
    const remoteKeyMatch = activeFoods.find((food) => normalizeFoodIdentity(food.barcode) === normalizeFoodIdentity(input.remoteKey))
    if (remoteKeyMatch) {
      return {
        strategy: 'remoteKey',
        localFoodId: remoteKeyMatch.id,
        remoteKey: input.remoteKey,
      }
    }
  }

  if (
    typeof input.servingSize === 'number' &&
    input.servingUnit &&
    input.name.trim()
  ) {
    const draftKey = getFoodIdentityKey({
      name: input.name,
      brand: input.brand,
      servingSize: input.servingSize,
      servingUnit: input.servingUnit,
    })
    const normalizedMatch = activeFoods.find((food) => getFoodIdentityKey(food) === draftKey)
    if (normalizedMatch) {
      return {
        strategy: 'normalized',
        localFoodId: normalizedMatch.id,
        remoteKey: input.remoteKey,
      }
    }
  }

  return null
}
