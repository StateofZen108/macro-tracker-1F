import { useState, useSyncExternalStore } from 'react'
import { findDuplicateFoodMatch } from '../domain/foods/dedupe'
import type { ActionResult, AppActionError, Food, FoodDraft } from '../types'
import { isSyncEnabled } from '../utils/sync/core'
import {
  getFoodReferenceCount,
  loadFoods,
  saveFoods,
  validateFoodPurge,
} from '../utils/storage/foods'
import { subscribeToStorage } from '../utils/storage/core'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sortFoodsByName(foods: Food[]): Food[] {
  return [...foods].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name)
    if (nameComparison !== 0) {
      return nameComparison
    }

    return (left.brand ?? '').localeCompare(right.brand ?? '')
  })
}

function sortQuickFoods(foods: Food[]): Food[] {
  return [...foods].sort((left, right) => {
    const leftLastUsed = left.lastUsedAt ?? ''
    const rightLastUsed = right.lastUsedAt ?? ''
    if (leftLastUsed !== rightLastUsed) {
      return rightLastUsed.localeCompare(leftLastUsed)
    }

    if (left.usageCount !== right.usageCount) {
      return right.usageCount - left.usageCount
    }

    return right.createdAt.localeCompare(left.createdAt)
  })
}

function normalizeDraft(draft: FoodDraft): FoodDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    brand: draft.brand?.trim() || undefined,
    servingUnit: draft.servingUnit.trim(),
    barcode: draft.barcode?.trim() || undefined,
    fiber: draft.fiber ?? undefined,
    sugars: draft.sugars ?? undefined,
    salt: draft.salt ?? undefined,
    sodium: draft.sodium ?? undefined,
    labelNutrition: draft.labelNutrition ?? undefined,
    provider: draft.provider ?? undefined,
    importConfidence: draft.importConfidence ?? undefined,
    sourceQuality: draft.sourceQuality ?? undefined,
    sourceQualityNote: draft.sourceQualityNote?.trim() || undefined,
  }
}

function matchesQuery(food: Food, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return `${food.name} ${food.brand ?? ''} ${food.barcode ?? ''}`.toLowerCase().includes(normalizedQuery)
}

function isActiveFood(food: Food): boolean {
  return !food.archivedAt
}

export function isFoodEditable(food: Food): boolean {
  return food.source !== 'seed'
}

function buildSearchRank(food: Food, query: string): [number, number, string, number, string] {
  const normalizedQuery = query.trim().toLowerCase()
  const name = food.name.toLowerCase()
  const brand = (food.brand ?? '').toLowerCase()
  const barcode = (food.barcode ?? '').toLowerCase()
  const hasNamePrefix = name.startsWith(normalizedQuery) || brand.startsWith(normalizedQuery) ? 1 : 0
  const hasBarcodeMatch = normalizedQuery && barcode.includes(normalizedQuery) ? 1 : 0
  const lastUsed = food.lastUsedAt ?? ''

  return [hasNamePrefix, hasBarcodeMatch, lastUsed, food.usageCount, name]
}

export function useFoods() {
  const foods = useSyncExternalStore(subscribeToStorage, loadFoods, loadFoods)
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function createFood(draft: FoodDraft): ActionResult<Food> {
    const normalizedDraft = normalizeDraft(draft)
    const duplicateFood = findDuplicateFoodMatch(loadFoods(), normalizedDraft)
    if (duplicateFood) {
      const result: ActionResult<Food> = {
        ok: false,
        error: {
          code: 'duplicateFood',
          message: `${duplicateFood.name} already exists in your food list. Use the existing food instead of creating a duplicate.`,
        },
      }
      setLastError(result.error)
      return result
    }

    const now = new Date().toISOString()
    const createdFood: Food = {
      id: crypto.randomUUID(),
      ...normalizedDraft,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    const nextFoods = sortFoodsByName([...loadFoods(), createdFood])
    const saveResult = saveFoods(nextFoods)
    const result: ActionResult<Food> = saveResult.ok ? ok(createdFood) : saveResult

    if (!result.ok) {
      setLastError(result.error)
    } else {
      setLastError(null)
    }

    return result
  }

  function updateFood(foodId: string, draft: FoodDraft): ActionResult<void> {
    const normalizedDraft = normalizeDraft(draft)
    const duplicateFood = findDuplicateFoodMatch(loadFoods(), normalizedDraft, foodId)
    if (duplicateFood) {
      const result: ActionResult<void> = {
        ok: false,
        error: {
          code: 'duplicateFood',
          message: `${duplicateFood.name} already exists in your food list. Update that food instead of creating a duplicate.`,
        },
      }
      setLastError(result.error)
      return result
    }

    const now = new Date().toISOString()
    const nextFoods = sortFoodsByName(
      loadFoods().map((food) => {
        if (food.id !== foodId || food.source === 'seed') {
          return food
        }

        return {
          ...food,
          ...normalizedDraft,
          provider: normalizedDraft.provider ?? food.provider,
          importConfidence: normalizedDraft.importConfidence ?? food.importConfidence,
          sourceQuality: normalizedDraft.sourceQuality ?? food.sourceQuality,
          sourceQualityNote: normalizedDraft.sourceQualityNote ?? food.sourceQualityNote,
          sugars: normalizedDraft.sugars ?? food.sugars,
          salt: normalizedDraft.salt ?? food.salt,
          sodium: normalizedDraft.sodium ?? food.sodium,
          labelNutrition: normalizedDraft.labelNutrition ?? food.labelNutrition,
          updatedAt: now,
        }
      }),
    )

    const result = saveFoods(nextFoods)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function archiveFood(foodId: string): ActionResult<void> {
    const now = new Date().toISOString()
    const nextFoods = loadFoods().map((food) =>
      food.id === foodId && food.source !== 'seed'
        ? {
            ...food,
            archivedAt: food.archivedAt ?? now,
            updatedAt: now,
          }
        : food,
    )

    const result = saveFoods(nextFoods)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function restoreFood(foodId: string): ActionResult<void> {
    const now = new Date().toISOString()
    const nextFoods = loadFoods().map((food) =>
      food.id === foodId
        ? {
            ...food,
            archivedAt: undefined,
            updatedAt: now,
          }
        : food,
    )

    const result = saveFoods(nextFoods)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function purgeFood(foodId: string): ActionResult<void> {
    if (isSyncEnabled()) {
      const result: ActionResult<void> = {
        ok: false,
        error: {
          code: 'syncFoodPurgeDisabled',
          message: 'Permanent food purge is disabled while cross-device sync is enabled. Archive the food instead.',
        },
      }
      setLastError(result.error)
      return result
    }

    const referenceCheck = validateFoodPurge(foodId)
    if (!referenceCheck.ok) {
      setLastError(referenceCheck.error)
      return referenceCheck
    }

    if (referenceCheck.data > 0) {
      const result: ActionResult<void> = {
        ok: false,
        error: {
          code: 'foodInUse',
          message: 'Archive this food instead. It is still referenced by existing log entries.',
        },
      }

      setLastError(result.error)
      return result
    }

    const nextFoods = loadFoods().filter((food) => food.id !== foodId || food.source === 'seed')
    const result = saveFoods(nextFoods)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function incrementUsage(foodId: string): ActionResult<void> {
    const nextFoods = loadFoods().map((food) => {
      if (food.id !== foodId) {
        return food
      }

      return {
        ...food,
        usageCount: food.usageCount + 1,
      }
    })

    const result = saveFoods(nextFoods)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function searchFoods(query: string): Food[] {
    const filteredFoods = foods.filter((food) => isActiveFood(food) && matchesQuery(food, query))

    if (!query.trim()) {
      return sortQuickFoods(filteredFoods)
    }

    return [...filteredFoods].sort((left, right) => {
      const [leftPrefix, leftBarcode, leftLastUsed, leftUsage, leftName] = buildSearchRank(left, query)
      const [rightPrefix, rightBarcode, rightLastUsed, rightUsage, rightName] = buildSearchRank(right, query)

      if (leftPrefix !== rightPrefix) {
        return rightPrefix - leftPrefix
      }

      if (leftBarcode !== rightBarcode) {
        return rightBarcode - leftBarcode
      }

      if (leftLastUsed !== rightLastUsed) {
        return rightLastUsed.localeCompare(leftLastUsed)
      }

      if (leftUsage !== rightUsage) {
        return rightUsage - leftUsage
      }

      return leftName.localeCompare(rightName)
    })
  }

  function getQuickFoods(limit = 6): Food[] {
    return sortQuickFoods(foods.filter(isActiveFood)).slice(0, limit)
  }

  function clearError(): void {
    setLastError(null)
  }

  return {
    foods,
    createFood,
    updateFood,
    archiveFood,
    restoreFood,
    purgeFood,
    incrementUsage,
    searchFoods,
    getQuickFoods,
    findDuplicateFood: (draft: FoodDraft, excludeFoodId?: string) =>
      findDuplicateFoodMatch(loadFoods(), normalizeDraft(draft), excludeFoodId),
    getFoodReferenceCount,
    lastError,
    clearError,
  }
}
