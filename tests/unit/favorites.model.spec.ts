import { describe, expect, it } from 'vitest'
import { isFavoriteFood, listActiveFavoriteFoodIds, toggleFavoriteFood } from '../../src/domain/favorites'

describe('favorite helpers', () => {
  it('creates and removes active favorites by toggling deletedAt', () => {
    const added = toggleFavoriteFood([], 'food-1', '2026-04-12T00:00:00.000Z')
    expect(isFavoriteFood(added, 'food-1')).toBe(true)

    const removed = toggleFavoriteFood(added, 'food-1', '2026-04-12T01:00:00.000Z')
    expect(isFavoriteFood(removed, 'food-1')).toBe(false)
    expect(listActiveFavoriteFoodIds(removed)).toEqual([])
  })
})
