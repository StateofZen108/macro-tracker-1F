import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, FavoriteFood, Food } from '../types'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { filterVisibleFavorites, findOrphanedFavorites } from '../utils/sync/integrity'
import {
  loadSyncIntegrityState,
  subscribeToSyncIntegrityState,
} from '../utils/sync/integrityState'
import { loadFavoriteFoods, saveFavoriteFoods, subscribeToFavoriteFoods } from '../utils/storage/favorites'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function useFavoriteFoods(foods: Food[]) {
  const favorites = useSyncExternalStore(
    subscribeToFavoriteFoods,
    loadFavoriteFoods,
    loadFavoriteFoods,
  )
  const integrityState = useSyncExternalStore(
    subscribeToSyncIntegrityState,
    loadSyncIntegrityState,
    loadSyncIntegrityState,
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)
  const orphanedSignatureRef = useRef('')

  const fallbackOrphanedFavorites = useMemo(
    () =>
      integrityState.updatedAt === new Date(0).toISOString()
        ? findOrphanedFavorites(favorites, foods)
        : [],
    [favorites, foods, integrityState.updatedAt],
  )
  const hiddenFavoriteIds = useMemo(
    () =>
      new Set([
        ...integrityState.orphanedFavoriteFoodIds,
        ...fallbackOrphanedFavorites.map((favorite) => favorite.foodId),
      ]),
    [fallbackOrphanedFavorites, integrityState.orphanedFavoriteFoodIds],
  )
  const hiddenFavoriteSignature = useMemo(
    () => [...hiddenFavoriteIds].sort().join('|'),
    [hiddenFavoriteIds],
  )
  const visibleFavorites = filterVisibleFavorites(favorites, foods).filter(
    (favorite) => !hiddenFavoriteIds.has(favorite.foodId),
  )

  useEffect(() => {
    const orphanedFavorites =
      integrityState.updatedAt === new Date(0).toISOString()
        ? findOrphanedFavorites(favorites, foods)
        : favorites.filter((favorite) => hiddenFavoriteIds.has(favorite.foodId))
    const nextSignature = orphanedFavorites
      .map((favorite) => favorite.foodId)
      .sort()
      .join('|')

    if (!nextSignature || nextSignature === orphanedSignatureRef.current) {
      orphanedSignatureRef.current = nextSignature
      return
    }

    orphanedSignatureRef.current = nextSignature
    for (const favorite of orphanedFavorites) {
      void recordDiagnosticsEvent({
        eventType: 'food_identity_conflict',
        severity: 'warning',
        scope: 'favorite_foods',
        recordKey: favorite.foodId,
        message: `Favorite food ${favorite.foodId} is hidden because its source food is unavailable.`,
        payload: {
          reason: 'orphaned_favorite',
          foodId: favorite.foodId,
        },
      })
    }
  }, [favorites, foods, hiddenFavoriteSignature, hiddenFavoriteIds, integrityState.updatedAt])

  function toggleFavorite(foodId: string): ActionResult<FavoriteFood> {
    const currentFavorites = loadFavoriteFoods()
    const existingFavorite = currentFavorites.find(
      (favorite) => favorite.foodId === foodId && !favorite.deletedAt,
    )
    const now = new Date().toISOString()

    const nextFavorites = existingFavorite
      ? currentFavorites.map((favorite) =>
          favorite.foodId === foodId
            ? {
                ...favorite,
                deletedAt: now,
                updatedAt: now,
              }
            : favorite,
        )
      : [
          ...currentFavorites.filter((favorite) => favorite.foodId !== foodId),
          {
            foodId,
            createdAt: now,
            updatedAt: now,
          },
        ]

    const result = saveFavoriteFoods(nextFavorites)
    if (!result.ok) {
      setLastError(result.error)
      return result as ActionResult<FavoriteFood>
    }

    const persistedFavorite =
      nextFavorites.find((favorite) => favorite.foodId === foodId) ??
      ({
        foodId,
        createdAt: now,
        updatedAt: now,
      } as FavoriteFood)
    setLastError(null)
    return ok(persistedFavorite)
  }

  return {
    favorites: visibleFavorites,
    allFavorites: favorites,
    toggleFavorite,
    lastError,
  }
}
