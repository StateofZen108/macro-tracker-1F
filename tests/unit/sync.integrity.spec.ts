import { describe, expect, it } from 'vitest'
import type { FavoriteFood, Food, Recipe, SyncScope } from '../../src/types'
import {
  computeSyncIntegrityReport,
  filterVisibleFavorites,
  filterVisibleRecipes,
  findInvalidRecipeReferences,
  findOrphanedFavoriteIds,
} from '../../src/utils/sync/integrity'
import { sortSyncRecordsForApply } from '../../src/utils/sync/shared'

const ACTIVE_FOOD: Food = {
  id: 'food-active',
  name: 'Chicken Breast',
  servingSize: 100,
  servingUnit: 'g',
  calories: 165,
  protein: 31,
  carbs: 0,
  fat: 3.6,
  source: 'custom',
  usageCount: 0,
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
}

function buildFavorite(foodId: string, deletedAt?: string): FavoriteFood {
  return {
    foodId,
    createdAt: '2026-04-12T10:00:00.000Z',
    updatedAt: '2026-04-12T10:00:00.000Z',
    deletedAt,
  }
}

function buildRecipe(foodId: string): Recipe {
  return {
    id: `recipe-${foodId}`,
    name: `Recipe ${foodId}`,
    yieldServings: 2,
    ingredients: [
      {
        id: `ingredient-${foodId}`,
        foodId,
        servings: 1,
        createdAt: '2026-04-12T10:00:00.000Z',
        snapshot: {
          name: 'Chicken Breast',
          servingSize: 100,
          servingUnit: 'g',
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 3.6,
          source: 'custom',
        },
      },
    ],
    usageCount: 0,
    createdAt: '2026-04-12T10:00:00.000Z',
    updatedAt: '2026-04-12T10:00:00.000Z',
  }
}

describe('sync integrity helpers', () => {
  it('hides orphaned favorites while keeping valid active favorites visible', () => {
    const visibleFavorites = filterVisibleFavorites(
      [
        buildFavorite('food-active'),
        buildFavorite('food-missing'),
        buildFavorite('food-active', '2026-04-12T10:05:00.000Z'),
      ],
      [ACTIVE_FOOD],
    )

    expect(visibleFavorites).toEqual([buildFavorite('food-active')])
  })

  it('quarantines recipes with missing food references', () => {
    const validRecipe = buildRecipe('food-active')
    const invalidRecipe = buildRecipe('food-missing')

    expect(filterVisibleRecipes([validRecipe, invalidRecipe], [ACTIVE_FOOD])).toEqual([validRecipe])
    expect(findInvalidRecipeReferences([validRecipe, invalidRecipe], [ACTIVE_FOOD])).toEqual([
      {
        recipe: invalidRecipe,
        missingFoodIds: ['food-missing'],
      },
    ])
  })

  it('builds a dataset-level integrity report for orchestrator integration', () => {
    const validRecipe = buildRecipe('food-active')
    const invalidRecipe = buildRecipe('food-missing')
    const report = computeSyncIntegrityReport({
      foods: [ACTIVE_FOOD],
      favorites: [
        buildFavorite('food-active'),
        buildFavorite('food-missing'),
        buildFavorite('food-missing'),
      ],
      recipes: [validRecipe, invalidRecipe],
    })

    expect(findOrphanedFavoriteIds({
      foods: [ACTIVE_FOOD],
      favorites: [buildFavorite('food-active'), buildFavorite('food-missing')],
      recipes: [],
    })).toEqual(['food-missing'])
    expect(report.orphanedFavoriteIds).toEqual(['food-missing'])
    expect(report.orphanedFavorites).toEqual([
      buildFavorite('food-missing'),
      buildFavorite('food-missing'),
    ])
    expect(report.invalidRecipeReferences).toEqual([
      {
        recipe: invalidRecipe,
        missingFoodIds: ['food-missing'],
      },
    ])
  })

  it('sorts sync records by the explicit apply order before server version', () => {
    const records: Array<{ scope: SyncScope; serverVersion: number }> = [
      { scope: 'recipes', serverVersion: 3 },
      { scope: 'foods', serverVersion: 2 },
      { scope: 'favorite_foods', serverVersion: 5 },
      { scope: 'foods', serverVersion: 1 },
      { scope: 'meal_templates', serverVersion: 4 },
    ]

    expect(sortSyncRecordsForApply(records)).toEqual([
      { scope: 'foods', serverVersion: 1 },
      { scope: 'foods', serverVersion: 2 },
      { scope: 'favorite_foods', serverVersion: 5 },
      { scope: 'meal_templates', serverVersion: 4 },
      { scope: 'recipes', serverVersion: 3 },
    ])
  })
})
