import type { ActionResult, FavoriteFood } from '../../types'
import { createExtraCollectionStore } from './extraStore'
import { queueFavoriteFoodSyncMutations } from '../sync/storageQueue'

const STORAGE_KEY = 'mt_favorite_foods'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeFavoriteFood(rawValue: unknown): FavoriteFood | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const foodId = readString(rawValue.foodId)
  const createdAt = readString(rawValue.createdAt)
  const updatedAt = readString(rawValue.updatedAt)
  if (!foodId || !createdAt || !updatedAt) {
    return null
  }

  return {
    foodId,
    createdAt,
    updatedAt,
    deletedAt: readString(rawValue.deletedAt),
  }
}

const store = createExtraCollectionStore<FavoriteFood>({
  key: STORAGE_KEY,
  parse: (value) =>
    Array.isArray(value)
      ? value
          .map((item) => normalizeFavoriteFood(item))
          .filter((item): item is FavoriteFood => item !== null)
      : [],
  sort: (favorites) => [...favorites].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
})

export function loadFavoriteFoods(): FavoriteFood[] {
  return store.load()
}

export function saveFavoriteFoods(favorites: FavoriteFood[]): ActionResult<void> {
  const previousFavorites = loadFavoriteFoods()
  const result = store.save(favorites)
  if (result.ok) {
    queueFavoriteFoodSyncMutations(previousFavorites, loadFavoriteFoods())
  }
  return result
}

export function subscribeToFavoriteFoods(listener: () => void): () => void {
  return store.subscribe(listener)
}
