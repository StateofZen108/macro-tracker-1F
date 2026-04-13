import type { ActionResult, Recipe, RecipeIngredient } from '../../types'
import { createExtraCollectionStore } from './extraStore'
import { queueRecipeSyncMutations } from '../sync/storageQueue'

const STORAGE_KEY = 'mt_recipes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeIngredient(rawValue: unknown, index: number): RecipeIngredient | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const foodId = readString(rawValue.foodId)
  const snapshot = isRecord(rawValue.snapshot)
    ? (rawValue.snapshot as unknown as RecipeIngredient['snapshot'])
    : null
  const servings = readNumber(rawValue.servings)
  if (!foodId || !snapshot || !servings || servings <= 0) {
    return null
  }

  return {
    id: readString(rawValue.id) ?? `recipe-ingredient-${index}-${Date.now()}`,
    foodId,
    snapshot,
    servings,
    createdAt: readString(rawValue.createdAt) ?? new Date().toISOString(),
  }
}

function normalizeRecipe(rawValue: unknown): Recipe | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const name = readString(rawValue.name)
  const yieldServings = readNumber(rawValue.yieldServings)
  const createdAt = readString(rawValue.createdAt)
  const updatedAt = readString(rawValue.updatedAt)
  const ingredients = Array.isArray(rawValue.ingredients)
    ? rawValue.ingredients
        .map((ingredient, index) => normalizeIngredient(ingredient, index))
        .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null)
    : []

  if (!name || !yieldServings || yieldServings <= 0 || !createdAt || !updatedAt || ingredients.length === 0) {
    return null
  }

  return {
    id: readString(rawValue.id) ?? crypto.randomUUID(),
    name,
    yieldServings,
    yieldLabel: readString(rawValue.yieldLabel),
    ingredients,
    usageCount: readNumber(rawValue.usageCount) ?? 0,
    lastUsedAt: readString(rawValue.lastUsedAt),
    nutrients: isRecord(rawValue.nutrients)
      ? (rawValue.nutrients as unknown as Recipe['nutrients'])
      : undefined,
    notes: readString(rawValue.notes),
    archivedAt: readString(rawValue.archivedAt),
    createdAt,
    updatedAt,
    deletedAt: readString(rawValue.deletedAt),
  }
}

const store = createExtraCollectionStore<Recipe>({
  key: STORAGE_KEY,
  parse: (value) =>
    Array.isArray(value)
      ? value.map((item) => normalizeRecipe(item)).filter((item): item is Recipe => item !== null)
      : [],
  sort: (recipes) =>
    [...recipes].sort((left, right) => {
      if ((left.lastUsedAt ?? '') !== (right.lastUsedAt ?? '')) {
        return (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '')
      }

      if (left.usageCount !== right.usageCount) {
        return right.usageCount - left.usageCount
      }

      return right.updatedAt.localeCompare(left.updatedAt)
    }),
})

export function loadRecipes(): Recipe[] {
  return store.load()
}

export function saveRecipes(recipes: Recipe[]): ActionResult<void> {
  const previousRecipes = loadRecipes()
  const result = store.save(recipes)
  if (result.ok) {
    queueRecipeSyncMutations(previousRecipes, loadRecipes())
  }
  return result
}

export function subscribeToRecipes(listener: () => void): () => void {
  return store.subscribe(listener)
}
