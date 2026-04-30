import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, Food, FoodLogEntry, FoodSnapshot, MealType } from '../types'
import { isSyncEnabled } from '../utils/sync/core'
import {
  loadFoodLog,
  saveFoodLog,
  saveFoodLogWithUsage,
  saveFoodLogWithUsages,
} from '../utils/storage/logs'
import { dismissFoodReviewItem, resolveFoodReviewItem } from '../utils/storage/foodReviewQueue'
import { classifyFoodTrustEvidence } from '../domain/foodTrust'
import { upsertFoodTrustEvidence } from '../utils/storage/foodTrustEvidence'
import { buildEntrySnapshot } from '../utils/storage/foods'
import { subscribeToStorage } from '../utils/storage/core'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sortEntries(entries: FoodLogEntry[]): FoodLogEntry[] {
  return [...entries].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function useFoodLog(date: string) {
  const storedEntries = useSyncExternalStore(
    subscribeToStorage,
    () => loadFoodLog(date),
    () => loadFoodLog(date),
  )
  const entries = useMemo(
    () => sortEntries(storedEntries.filter((entry) => !entry.deletedAt)),
    [storedEntries],
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function updateDateEntries(
    targetDate: string,
    updater: (currentEntries: FoodLogEntry[]) => FoodLogEntry[],
  ): ActionResult<void> {
    const currentDateEntries = sortEntries(loadFoodLog(targetDate))
    const nextEntries = sortEntries(updater(currentDateEntries).map((entry) => ({
      ...entry,
      deletedAt: entry.deletedAt ?? undefined,
    })))
    const result = saveFoodLog(targetDate, nextEntries)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function addEntry(meal: MealType, food: Food, servings: number): ActionResult<FoodLogEntry> {
    const now = new Date().toISOString()
    const trustEvidence = food.trustEvidence ?? classifyFoodTrustEvidence({ food })
    void upsertFoodTrustEvidence(trustEvidence)
    const newEntry: FoodLogEntry = {
      id: crypto.randomUUID(),
      foodId: food.id,
      snapshot: {
        ...buildEntrySnapshot(food),
        trustEvidence,
      },
      date,
      meal,
      servings,
      createdAt: now,
      updatedAt: now,
      needsReview: trustEvidence.status !== 'trusted' || undefined,
    }

    const currentEntries = sortEntries(loadFoodLog(date))
    const result = saveFoodLogWithUsage(date, sortEntries([...currentEntries, newEntry]), food.id, servings)
    if (!result.ok) {
      setLastError(result.error)
      return result
    }

    setLastError(null)
    return ok(newEntry)
  }

  function addSnapshotEntry(
    meal: MealType,
    snapshot: FoodSnapshot,
    servings: number,
  ): ActionResult<FoodLogEntry> {
    const now = new Date().toISOString()
    const trustEvidence = snapshot.trustEvidence ?? classifyFoodTrustEvidence({ snapshot })
    void upsertFoodTrustEvidence(trustEvidence)
    const newEntry: FoodLogEntry = {
      id: crypto.randomUUID(),
      snapshot: {
        ...snapshot,
        trustEvidence,
      },
      date,
      meal,
      servings,
      createdAt: now,
      updatedAt: now,
      needsReview: trustEvidence.status !== 'trusted' || undefined,
    }

    const result = updateDateEntries(date, (currentEntries) => [...currentEntries, newEntry])
    if (!result.ok) {
      return result
    }

    return ok(newEntry)
  }

  function updateEntryServings(entryId: string, servings: number): ActionResult<void> {
    return updateDateEntries(date, (currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              servings,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      ),
    )
  }

  function replaceEntryFood(entryId: string, food: Food): ActionResult<void> {
    const currentEntries = sortEntries(loadFoodLog(date))
    const currentEntry = currentEntries.find((entry) => entry.id === entryId)
    const trustEvidence = food.trustEvidence ?? classifyFoodTrustEvidence({ food, reviewedAt: new Date().toISOString() })
    void upsertFoodTrustEvidence(trustEvidence)
    const nextEntries = currentEntries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            foodId: food.id,
            snapshot: {
              ...buildEntrySnapshot(food),
              trustEvidence,
            },
            updatedAt: new Date().toISOString(),
            needsReview: trustEvidence.status !== 'trusted' || undefined,
            reviewItemId: undefined,
          }
        : entry,
    )
    const replacedEntry = nextEntries.find((entry) => entry.id === entryId)
    const result = saveFoodLogWithUsage(
      date,
      sortEntries(nextEntries),
      food.id,
      replacedEntry?.servings ?? 1,
    )
    setLastError(result.ok ? null : result.error)
    if (result.ok && currentEntry?.reviewItemId) {
      void resolveFoodReviewItem(currentEntry.reviewItemId, food.id)
    }
    return result
  }

  function deleteEntry(entryId: string): ActionResult<void> {
    const currentEntry = loadFoodLog(date).find((entry) => entry.id === entryId)
    const result = updateDateEntries(date, (currentEntries) =>
      isSyncEnabled()
        ? currentEntries.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  updatedAt: new Date().toISOString(),
                  deletedAt: new Date().toISOString(),
                }
              : entry,
          )
        : currentEntries.filter((entry) => entry.id !== entryId),
    )
    if (result.ok && currentEntry?.reviewItemId) {
      void dismissFoodReviewItem(currentEntry.reviewItemId)
    }
    return result
  }

  function restoreEntry(entry: FoodLogEntry): ActionResult<void> {
    return updateDateEntries(entry.date, (currentEntries) => {
      const nextEntries = currentEntries.filter((currentEntry) => currentEntry.id !== entry.id)
      nextEntries.push({
        ...entry,
        deletedAt: undefined,
        updatedAt: new Date().toISOString(),
      })
      return nextEntries
    })
  }

  function appendEntries(appendedEntries: FoodLogEntry[]): ActionResult<void> {
    const currentEntries = sortEntries(loadFoodLog(date))
    const nextEntries = sortEntries([...currentEntries, ...appendedEntries])
    return saveEntries(nextEntries, appendedEntries)
  }

  function saveEntries(
    nextEntries: FoodLogEntry[],
    usageSourceEntries: FoodLogEntry[] = nextEntries,
  ): ActionResult<void> {
    const tombstonedEntries = sortEntries(loadFoodLog(date).filter((entry) => entry.deletedAt))
    const persistedEntries = sortEntries([...nextEntries, ...tombstonedEntries])
    const usageUpdates = usageSourceEntries.flatMap((entry) =>
      entry.foodId
        ? [
            {
              foodId: entry.foodId,
              servings: entry.servings,
              meal: entry.meal,
            },
          ]
        : [],
    )

    const result =
      usageUpdates.length > 0
        ? saveFoodLogWithUsages(date, persistedEntries, usageUpdates)
        : saveFoodLog(date, persistedEntries)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function clearError(): void {
    setLastError(null)
  }

  return {
    entries,
    addEntry,
    addSnapshotEntry,
    appendEntries,
    saveEntries,
    updateEntryServings,
    replaceEntryFood,
    deleteEntry,
    restoreEntry,
    lastError,
    clearError,
  }
}
