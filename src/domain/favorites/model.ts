import type { FavoriteFood } from './types'

export function isFavoriteFood(favorites: FavoriteFood[], foodId: string): boolean {
  return favorites.some((favorite) => favorite.foodId === foodId && !favorite.deletedAt)
}

export function toggleFavoriteFood(
  favorites: FavoriteFood[],
  foodId: string,
  now = new Date().toISOString(),
): FavoriteFood[] {
  const existingFavorite = favorites.find((favorite) => favorite.foodId === foodId)
  if (!existingFavorite) {
    return favorites.concat({
      id: crypto.randomUUID(),
      foodId,
      createdAt: now,
      updatedAt: now,
    })
  }

  return favorites.map((favorite) =>
    favorite.foodId === foodId
      ? {
          ...favorite,
          updatedAt: now,
          deletedAt: favorite.deletedAt ? undefined : now,
        }
      : favorite,
  )
}

export function listActiveFavoriteFoodIds(favorites: FavoriteFood[]): string[] {
  return favorites.filter((favorite) => !favorite.deletedAt).map((favorite) => favorite.foodId)
}
