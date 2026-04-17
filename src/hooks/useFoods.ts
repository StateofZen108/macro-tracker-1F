import { useState, useSyncExternalStore } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { findDuplicateFoodMatch } from '../domain/foods/dedupe'
import {
  buildImportedFoodDraft,
  MAX_SEARCH_ALIASES,
  mergeImportedFood,
  normalizeRemoteReferences,
  normalizeSearchAlias,
  resolveFoodLibraryMatch,
} from '../domain/foods/personalLibrary'
import type { ActionResult, AppActionError, Food, FoodDraft } from '../types'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { isSyncEnabled } from '../utils/sync/core'
import { queueFoodReviewItem } from '../utils/storage/foodReviewQueue'
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
  const normalizedAliases = Array.isArray(draft.searchAliases)
    ? draft.searchAliases
        .map((alias) => normalizeSearchAlias(alias))
        .filter((alias): alias is string => Boolean(alias))
        .slice(-MAX_SEARCH_ALIASES)
    : undefined
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
    importTrust: draft.importTrust ?? undefined,
    searchAliases: normalizedAliases?.length ? normalizedAliases : undefined,
    remoteReferences: normalizeRemoteReferences(draft.remoteReferences),
  }
}

function matchesQuery(food: Food, query: string): boolean {
  const normalizedQuery = normalizeSearchAlias(query) ?? ''
  if (!normalizedQuery) {
    return true
  }

  const aliases = food.searchAliases ?? []
  return `${food.name} ${food.brand ?? ''} ${food.barcode ?? ''}`.toLowerCase().includes(normalizedQuery)
    || aliases.some((alias) => alias.includes(normalizedQuery))
}

function isActiveFood(food: Food): boolean {
  return !food.archivedAt
}

function buildReviewQueueSource(draft: FoodDraft): 'barcode' | 'ocr' | 'catalog_import' {
  if (draft.labelNutrition) {
    return 'ocr'
  }

  if (draft.barcode) {
    return 'barcode'
  }

  return 'catalog_import'
}

function maybeQueueImportedFoodReview(food: Food, draft: FoodDraft): void {
  if (!FEATURE_FLAGS.foodTruthV2) {
    return
  }

  const trustLevel = draft.importTrust?.level
  if (trustLevel !== 'exact_review' && trustLevel !== 'blocked') {
    return
  }

  const result = queueFoodReviewItem({
    source: buildReviewQueueSource(draft),
    title: food.name,
    reason:
      trustLevel === 'blocked'
        ? 'This imported food is blocked from trusted autolog until you confirm its serving basis and macro truth.'
        : 'This imported food needs manual review before it should be treated as trusted food truth.',
    linkedFoodId: food.id,
    barcode: food.barcode,
    trustLevel,
  })

  void recordDiagnosticsEvent({
    eventType: result.ok
      ? 'food_truth_v2_review_item_created'
      : 'food_truth_v2_review_item_creation_failed',
    severity: result.ok ? 'info' : 'warning',
    scope: 'diagnostics',
    recordKey: food.id,
    message: result.ok
      ? `${food.name} was added to the persistent food review queue.`
      : `Unable to add ${food.name} to the persistent food review queue.`,
    payload: {
      source: buildReviewQueueSource(draft),
      trustLevel,
    },
  })
}

export function isFoodEditable(food: Food): boolean {
  return food.source !== 'seed'
}

function buildSearchRank(food: Food, query: string): [number, number, number, string, number, string] {
  const normalizedQuery = normalizeSearchAlias(query) ?? ''
  const name = food.name.trim().toLowerCase()
  const brand = (food.brand ?? '').trim().toLowerCase()
  const barcode = (food.barcode ?? '').trim().toLowerCase()
  const aliases = food.searchAliases ?? []
  const hasExactAliasOrNameMatch =
    normalizedQuery &&
    (name === normalizedQuery ||
      [brand, name].filter(Boolean).join(' ') === normalizedQuery ||
      aliases.includes(normalizedQuery))
      ? 1
      : 0
  const hasNamePrefix = normalizedQuery && (name.startsWith(normalizedQuery) || brand.startsWith(normalizedQuery)) ? 1 : 0
  const hasBarcodeMatch = normalizedQuery && barcode.includes(normalizedQuery) ? 1 : 0
  const lastUsed = food.lastUsedAt ?? ''

  return [hasBarcodeMatch, hasExactAliasOrNameMatch, hasNamePrefix, lastUsed, food.usageCount, name]
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
          importTrust: normalizedDraft.importTrust ?? food.importTrust,
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
      const [leftBarcode, leftExact, leftPrefix, leftLastUsed, leftUsage, leftName] = buildSearchRank(left, query)
      const [rightBarcode, rightExact, rightPrefix, rightLastUsed, rightUsage, rightName] = buildSearchRank(right, query)

      if (leftBarcode !== rightBarcode) {
        return rightBarcode - leftBarcode
      }

      if (leftExact !== rightExact) {
        return rightExact - leftExact
      }

      if (leftPrefix !== rightPrefix) {
        return rightPrefix - leftPrefix
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

  function importFood(draft: FoodDraft, options?: { acceptedQuery?: string }): ActionResult<Food> {
    const normalizedDraft = buildImportedFoodDraft({
      draft: normalizeDraft(draft),
      acceptedQuery: options?.acceptedQuery,
    })
    const match = resolveFoodLibraryMatch(loadFoods(), normalizedDraft)

    if (
      match.kind === 'archivedBarcodeMatch' ||
      match.kind === 'archivedRemoteReferenceMatch' ||
      match.kind === 'archivedIdentityMatch'
    ) {
      const result: ActionResult<Food> = {
        ok: false,
        error: {
          code: 'archivedFoodExists',
          message: `${match.food.name} already exists in your archived foods. Restore it instead of importing a duplicate.`,
        },
      }
      setLastError(result.error)
      return result
    }

    if (
      match.kind === 'activeBarcodeMatch' ||
      match.kind === 'activeRemoteReferenceMatch' ||
      match.kind === 'activeIdentityMatch'
    ) {
      const { food: mergedFood, aliasesTrimmed } = mergeImportedFood({
        existingFood: match.food,
        draft: normalizedDraft,
        acceptedQuery: options?.acceptedQuery,
      })
      const nextFoods = sortFoodsByName(
        loadFoods().map((food) => (food.id === match.food.id ? mergedFood : food)),
      )
      const saveResult = saveFoods(nextFoods)
      if (!saveResult.ok) {
        setLastError(saveResult.error)
        return {
          ok: false,
          error: saveResult.error,
        }
      }

      if (aliasesTrimmed) {
        void recordDiagnosticsEvent({
          eventType: 'food_alias_trimmed',
          severity: 'info',
          scope: 'diagnostics',
          message: `${mergedFood.name} reached the search alias cap and older aliases were trimmed.`,
          recordKey: mergedFood.id,
        })
      }

      setLastError(null)
      maybeQueueImportedFoodReview(mergedFood, normalizedDraft)
      return ok(mergedFood)
    }

    const result = createFood(normalizedDraft)
    if (!result.ok) {
      return result
    }

    if ((normalizedDraft.searchAliases?.length ?? 0) >= MAX_SEARCH_ALIASES) {
      void recordDiagnosticsEvent({
        eventType: 'food_alias_trimmed',
        severity: 'info',
        scope: 'diagnostics',
        message: `${result.data.name} reached the search alias cap and older aliases were trimmed.`,
        recordKey: result.data.id,
      })
    }

    maybeQueueImportedFoodReview(result.data, normalizedDraft)

    return result
  }

  return {
    foods,
    createFood,
    updateFood,
    archiveFood,
    restoreFood,
    purgeFood,
    incrementUsage,
    importFood,
    searchFoods,
    getQuickFoods,
    findDuplicateFood: (draft: FoodDraft, excludeFoodId?: string) =>
      findDuplicateFoodMatch(loadFoods(), normalizeDraft(draft), excludeFoodId),
    resolveFoodMatch: (draft: FoodDraft, excludeFoodId?: string) =>
      resolveFoodLibraryMatch(loadFoods(), normalizeDraft(draft), excludeFoodId),
    getFoodReferenceCount,
    lastError,
    clearError,
  }
}
