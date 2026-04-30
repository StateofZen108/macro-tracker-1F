import type { FavoriteFood, Food, Recipe } from '../../types.js'

export interface SyncIntegrityDataset {
  foods: Food[]
  favorites: FavoriteFood[]
  recipes: Recipe[]
}

function buildActiveFoodIdSet(foods: Food[]): Set<string> {
  return new Set(foods.filter((food) => !food.archivedAt).map((food) => food.id))
}

export function findOrphanedFavorites(favorites: FavoriteFood[], foods: Food[]): FavoriteFood[] {
  const activeFoodIds = buildActiveFoodIdSet(foods)
  return favorites.filter((favorite) => !favorite.deletedAt && !activeFoodIds.has(favorite.foodId))
}

export function findOrphanedFavoriteIds(dataset: SyncIntegrityDataset): string[] {
  return [...new Set(findOrphanedFavorites(dataset.favorites, dataset.foods).map((favorite) => favorite.foodId))].sort()
}

export function filterVisibleFavorites(favorites: FavoriteFood[], foods: Food[]): FavoriteFood[] {
  const activeFoodIds = buildActiveFoodIdSet(foods)
  return favorites.filter((favorite) => !favorite.deletedAt && activeFoodIds.has(favorite.foodId))
}

export interface InvalidRecipeReference {
  recipe: Recipe
  missingFoodIds: string[]
}

export function findInvalidRecipeReferences(recipes: Recipe[], foods: Food[]): InvalidRecipeReference[] {
  const activeFoodIds = buildActiveFoodIdSet(foods)
  return recipes
    .filter((recipe) => !recipe.deletedAt && !recipe.archivedAt)
    .map((recipe) => ({
      recipe,
      missingFoodIds: [...new Set(recipe.ingredients.map((ingredient) => ingredient.foodId).filter((foodId) => !activeFoodIds.has(foodId)))],
    }))
    .filter((entry) => entry.missingFoodIds.length > 0)
}

export function findInvalidRecipeReferencesFromDataset(
  dataset: SyncIntegrityDataset,
): InvalidRecipeReference[] {
  return findInvalidRecipeReferences(dataset.recipes, dataset.foods)
}

export interface SyncIntegrityReport {
  orphanedFavoriteIds: string[]
  orphanedFavorites: FavoriteFood[]
  invalidRecipeReferences: InvalidRecipeReference[]
}

export function computeSyncIntegrityReport(dataset: SyncIntegrityDataset): SyncIntegrityReport {
  const orphanedFavorites = findOrphanedFavorites(dataset.favorites, dataset.foods)
  return {
    orphanedFavoriteIds: [...new Set(orphanedFavorites.map((favorite) => favorite.foodId))].sort(),
    orphanedFavorites,
    invalidRecipeReferences: findInvalidRecipeReferencesFromDataset(dataset),
  }
}

export function filterVisibleRecipes(recipes: Recipe[], foods: Food[]): Recipe[] {
  const invalidRecipeIds = new Set(findInvalidRecipeReferences(recipes, foods).map((entry) => entry.recipe.id))
  return recipes.filter((recipe) => !recipe.deletedAt && !recipe.archivedAt && !invalidRecipeIds.has(recipe.id))
}
