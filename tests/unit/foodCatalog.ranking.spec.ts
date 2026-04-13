import { describe, expect, it } from 'vitest'
import { rankUnifiedFoodSearchResults } from '../../src/domain/foodCatalog'
import type { UnifiedFoodSearchResult } from '../../src/domain/foodCatalog'

function buildResult(overrides: Partial<UnifiedFoodSearchResult> = {}): UnifiedFoodSearchResult {
  return {
    source: overrides.source ?? 'local_food',
    matchKind: overrides.matchKind ?? 'fuzzy',
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'Chicken Breast',
    ...overrides,
  }
}

describe('rankUnifiedFoodSearchResults', () => {
  it('orders by match quality before favorites and recency', () => {
    const results = rankUnifiedFoodSearchResults(
      [
        buildResult({ id: 'favorite-prefix', matchKind: 'prefix', isFavorite: true }),
        buildResult({ id: 'exact-local', matchKind: 'exact' }),
        buildResult({ id: 'barcode-remote', source: 'off_remote', matchKind: 'barcode' }),
      ],
      { query: 'chicken' },
    )

    expect(results.map((result) => result.id)).toEqual([
      'barcode-remote',
      'exact-local',
      'favorite-prefix',
    ])
  })

  it('prefers favorites, recent use, meal relevance, and cached remote before fresh remote', () => {
    const results = rankUnifiedFoodSearchResults(
      [
        buildResult({
          id: 'remote-fresh',
          source: 'off_remote',
          matchKind: 'prefix',
        }),
        buildResult({
          id: 'remote-cached',
          source: 'off_cached',
          matchKind: 'prefix',
        }),
        buildResult({
          id: 'favorite-local',
          source: 'local_food',
          matchKind: 'prefix',
          isFavorite: true,
        }),
        buildResult({
          id: 'recent-meal',
          source: 'saved_meal',
          matchKind: 'prefix',
          lastUsedAt: '2026-04-12T00:00:00.000Z',
          defaultMeal: 'breakfast',
        }),
      ],
      { query: 'ban', preferredMeal: 'breakfast' },
    )

    expect(results.map((result) => result.id)).toEqual([
      'favorite-local',
      'recent-meal',
      'remote-cached',
      'remote-fresh',
    ])
  })

  it('prefers higher-confidence branded catalog matches for common UK and US searches', () => {
    const results = rankUnifiedFoodSearchResults(
      [
        buildResult({
          id: 'uk-direct',
          source: 'off_remote',
          matchKind: 'prefix',
          brand: 'Tesco',
          importConfidence: 'direct_match',
          sourceQuality: 'high',
          barcode: '5012345678901',
        }),
        buildResult({
          id: 'us-direct',
          source: 'off_remote',
          matchKind: 'prefix',
          brand: 'Trader Joe',
          importConfidence: 'direct_match',
          sourceQuality: 'high',
          barcode: '0098765432109',
        }),
        buildResult({
          id: 'weak-generic',
          source: 'off_remote',
          matchKind: 'prefix',
          importConfidence: 'manual_review_required',
          sourceQuality: 'low',
        }),
      ],
      { query: 'greek yogurt' },
    )

    expect(results[0]?.id).not.toBe('weak-generic')
    expect(results[2]?.id).toBe('weak-generic')
  })
})
