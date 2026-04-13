import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, Food, Recipe } from '../types'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { isSyncEnabled } from '../utils/sync/core'
import { filterVisibleRecipes, findInvalidRecipeReferences } from '../utils/sync/integrity'
import {
  loadSyncIntegrityState,
  subscribeToSyncIntegrityState,
} from '../utils/sync/integrityState'
import { loadRecipes, saveRecipes, subscribeToRecipes } from '../utils/storage/recipes'
import { buildRecipeTotals } from '../domain/recipes/math'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function normalizeRecipeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function useRecipes(foods: Food[]) {
  const recipes = useSyncExternalStore(subscribeToRecipes, loadRecipes, loadRecipes)
  const integrityState = useSyncExternalStore(
    subscribeToSyncIntegrityState,
    loadSyncIntegrityState,
    loadSyncIntegrityState,
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)
  const invalidSignatureRef = useRef('')

  const invalidRecipeIds = new Set(
    integrityState.updatedAt === new Date(0).toISOString()
      ? findInvalidRecipeReferences(recipes, foods).map((entry) => entry.recipe.id)
      : integrityState.invalidRecipeIds,
  )
  const visibleRecipes = filterVisibleRecipes(recipes, foods).filter(
    (recipe) => !invalidRecipeIds.has(recipe.id),
  )

  useEffect(() => {
    const invalidRecipes =
      integrityState.updatedAt === new Date(0).toISOString()
        ? findInvalidRecipeReferences(recipes, foods)
        : recipes
            .filter((recipe) => integrityState.invalidRecipeIds.includes(recipe.id))
            .map((recipe) => ({
              recipe,
              missingFoodIds: integrityState.invalidRecipeMissingFoodIds[recipe.id] ?? [],
            }))
    const nextSignature = invalidRecipes
      .map((entry) => `${entry.recipe.id}:${entry.missingFoodIds.join(',')}`)
      .sort()
      .join('|')

    if (!nextSignature || nextSignature === invalidSignatureRef.current) {
      invalidSignatureRef.current = nextSignature
      return
    }

    invalidSignatureRef.current = nextSignature
    for (const entry of invalidRecipes) {
      void recordDiagnosticsEvent({
        eventType: 'recipe_rollup_failed',
        severity: 'warning',
        scope: 'recipes',
        recordKey: entry.recipe.id,
        message: `${entry.recipe.name} is hidden because one or more ingredient foods are unavailable.`,
        payload: {
          reason: 'missing_food_reference',
          recipeId: entry.recipe.id,
          missingFoodIds: entry.missingFoodIds,
        },
      })
    }
  }, [
    foods,
    integrityState.invalidRecipeIds,
    integrityState.invalidRecipeMissingFoodIds,
    integrityState.updatedAt,
    recipes,
  ])

  function persistRecipes(nextRecipes: Recipe[]): ActionResult<void> {
    const result = saveRecipes(nextRecipes)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function findNameCollision(name: string, excludeRecipeId?: string): Recipe | null {
    const normalizedName = normalizeRecipeName(name)
    if (!normalizedName) {
      return null
    }

    return (
      loadRecipes().find(
        (recipe) =>
          !recipe.deletedAt &&
          recipe.id !== excludeRecipeId &&
          normalizeRecipeName(recipe.name) === normalizedName,
      ) ?? null
    )
  }

  function createRecipe(input: {
    name: string
    foods: Array<{ food: Food; servings: number }>
    yieldServings: number
    yieldLabel?: string
    notes?: string
  }): ActionResult<Recipe> {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      const error = { code: 'recipeName', message: 'Recipe name is required.' }
      setLastError(error)
      return { ok: false, error }
    }

    const collision = findNameCollision(trimmedName)
    if (collision) {
      const error = {
        code: 'recipeNameTaken',
        message: `${collision.name} already exists. Rename this recipe before saving it.`,
      }
      setLastError(error)
      return { ok: false, error }
    }

    if (input.yieldServings <= 0) {
      const error = { code: 'recipeYield', message: 'Recipe yield must be greater than zero.' }
      setLastError(error)
      return { ok: false, error }
    }

    const missingFood = input.foods.find(({ food }) => !food.id)
    if (missingFood) {
      const error = {
        code: 'recipeMissingFood',
        message: 'Recipes can only use saved local foods.',
      }
      setLastError(error)
      return { ok: false, error }
    }

    if (!input.foods.length) {
      const error = { code: 'recipeIngredients', message: 'Add at least one food to create a recipe.' }
      setLastError(error)
      return { ok: false, error }
    }

    const now = new Date().toISOString()
    const createdRecipe: Recipe = {
      id: crypto.randomUUID(),
      name: trimmedName,
      yieldServings: input.yieldServings,
      yieldLabel: input.yieldLabel?.trim() || undefined,
      ingredients: input.foods.map(({ food, servings }, index) => ({
        id: crypto.randomUUID(),
        foodId: food.id,
        snapshot: {
          name: food.name,
          brand: food.brand,
          servingSize: food.servingSize,
          servingUnit: food.servingUnit,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          fiber: food.fiber,
          source: food.source,
          barcode: food.barcode,
          nutrients: food.nutrients,
        },
        servings,
        createdAt: new Date(Date.now() + index).toISOString(),
      })),
      usageCount: 0,
      nutrients: buildRecipeTotals(
        input.foods.map(({ food, servings }) => ({
          snapshot: {
            name: food.name,
            brand: food.brand,
            servingSize: food.servingSize,
            servingUnit: food.servingUnit,
            calories: food.calories,
            protein: food.protein,
            carbs: food.carbs,
            fat: food.fat,
            fiber: food.fiber,
            source: food.source,
            barcode: food.barcode,
            nutrients: food.nutrients,
          },
          servings,
        })),
        input.yieldServings,
      ),
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }

    const result = persistRecipes([...loadRecipes(), createdRecipe])
    if (!result.ok) {
      setLastError(result.error)
      return result as ActionResult<Recipe>
    }

    setLastError(null)
    return ok(createdRecipe)
  }

  function incrementRecipeUsage(recipeId: string): ActionResult<void> {
    const nextRecipes = loadRecipes().map((recipe) =>
      recipe.id === recipeId
        ? {
            ...recipe,
            usageCount: recipe.usageCount + 1,
            lastUsedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : recipe,
    )

    return persistRecipes(nextRecipes)
  }

  function renameRecipe(recipeId: string, name: string): ActionResult<Recipe> {
    const currentRecipe = loadRecipes().find((recipe) => recipe.id === recipeId)
    if (!currentRecipe) {
      const error = { code: 'recipeNotFound', message: 'That recipe no longer exists.' }
      setLastError(error)
      return { ok: false, error }
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      const error = { code: 'recipeName', message: 'Recipe name is required.' }
      setLastError(error)
      return { ok: false, error }
    }

    const collision = findNameCollision(trimmedName, recipeId)
    if (collision) {
      const error = {
        code: 'recipeNameTaken',
        message: `${collision.name} already exists. Rename this recipe before saving it.`,
      }
      setLastError(error)
      return { ok: false, error }
    }

    const updatedRecipe = {
      ...currentRecipe,
      name: trimmedName,
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
    }
    const result = persistRecipes(
      loadRecipes().map((recipe) => (recipe.id === recipeId ? updatedRecipe : recipe)),
    )
    if (!result.ok) {
      return result as ActionResult<Recipe>
    }

    return ok(updatedRecipe)
  }

  function archiveRecipe(recipeId: string): ActionResult<Recipe> {
    const currentRecipe = loadRecipes().find((recipe) => recipe.id === recipeId)
    if (!currentRecipe) {
      const error = { code: 'recipeNotFound', message: 'That recipe no longer exists.' }
      setLastError(error)
      return { ok: false, error }
    }

    const updatedRecipe = {
      ...currentRecipe,
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const result = persistRecipes(
      loadRecipes().map((recipe) => (recipe.id === recipeId ? updatedRecipe : recipe)),
    )
    if (!result.ok) {
      return result as ActionResult<Recipe>
    }

    return ok(updatedRecipe)
  }

  function restoreRecipe(recipeId: string): ActionResult<Recipe> {
    const currentRecipe = loadRecipes().find((recipe) => recipe.id === recipeId)
    if (!currentRecipe) {
      const error = { code: 'recipeNotFound', message: 'That recipe no longer exists.' }
      setLastError(error)
      return { ok: false, error }
    }

    const updatedRecipe = {
      ...currentRecipe,
      archivedAt: undefined,
      deletedAt: undefined,
      updatedAt: new Date().toISOString(),
    }
    const result = persistRecipes(
      loadRecipes().map((recipe) => (recipe.id === recipeId ? updatedRecipe : recipe)),
    )
    if (!result.ok) {
      return result as ActionResult<Recipe>
    }

    return ok(updatedRecipe)
  }

  function deleteRecipe(recipeId: string): ActionResult<void> {
    const existingRecipes = loadRecipes()
    if (!isSyncEnabled()) {
      return persistRecipes(existingRecipes.filter((recipe) => recipe.id !== recipeId))
    }

    const deletedAt = new Date().toISOString()
    return persistRecipes(
      existingRecipes.map((recipe) =>
        recipe.id === recipeId
          ? {
              ...recipe,
              deletedAt,
              updatedAt: deletedAt,
            }
          : recipe,
      ),
    )
  }

  return {
    recipes: visibleRecipes,
    allRecipes: recipes,
    createRecipe,
    incrementRecipeUsage,
    renameRecipe,
    archiveRecipe,
    restoreRecipe,
    deleteRecipe,
    findNameCollision,
    lastError,
  }
}
