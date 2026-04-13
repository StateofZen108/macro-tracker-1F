import { describe, expect, it } from 'vitest'
import { resolveFoodIdentityMatch } from '../../src/domain/foodCatalog'
import type { CatalogFoodRecord, RemoteCatalogHit } from '../../src/domain/foodCatalog'
import type { Food, FoodDraft } from '../../src/types'

function buildFood(overrides: Partial<Food> = {}): Food {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'Chicken Breast',
    servingSize: overrides.servingSize ?? 100,
    servingUnit: overrides.servingUnit ?? 'g',
    calories: overrides.calories ?? 165,
    protein: overrides.protein ?? 31,
    carbs: overrides.carbs ?? 0,
    fat: overrides.fat ?? 3.6,
    source: overrides.source ?? 'custom',
    usageCount: overrides.usageCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-04-12T00:00:00.000Z',
    ...overrides,
  }
}

function buildDraft(overrides: Partial<FoodDraft> = {}): FoodDraft {
  return {
    name: overrides.name ?? 'Chicken Breast',
    servingSize: overrides.servingSize ?? 100,
    servingUnit: overrides.servingUnit ?? 'g',
    calories: overrides.calories ?? 165,
    protein: overrides.protein ?? 31,
    carbs: overrides.carbs ?? 0,
    fat: overrides.fat ?? 3.6,
    source: overrides.source ?? 'custom',
    ...overrides,
  }
}

function buildRemoteHit(overrides: Partial<RemoteCatalogHit> = {}): RemoteCatalogHit {
  return {
    remoteKey: overrides.remoteKey ?? '1234567890123',
    provider: overrides.provider ?? 'open_food_facts',
    name: overrides.name ?? 'Chicken Breast',
    servingSize: overrides.servingSize ?? 100,
    servingUnit: overrides.servingUnit ?? 'g',
    ...overrides,
  }
}

function buildCachedCatalog(overrides: Partial<CatalogFoodRecord> = {}): CatalogFoodRecord {
  return {
    id: overrides.id ?? 'open_food_facts:1234567890123',
    remoteKey: overrides.remoteKey ?? '1234567890123',
    provider: overrides.provider ?? 'open_food_facts',
    name: overrides.name ?? 'Chicken Breast',
    cachedAt: overrides.cachedAt ?? '2026-04-12T00:00:00.000Z',
    staleAt: overrides.staleAt ?? '2026-04-19T00:00:00.000Z',
    lastSeenAt: overrides.lastSeenAt ?? '2026-04-12T00:00:00.000Z',
    ...overrides,
  }
}

describe('resolveFoodIdentityMatch', () => {
  it('prefers exact barcode matches on active local foods', () => {
    const localFoods = [
      buildFood({ id: 'food-1', barcode: '0123456789012' }),
      buildFood({ id: 'food-2', name: 'Other Food' }),
    ]

    const match = resolveFoodIdentityMatch({
      localFoods,
      input: {
        draft: buildDraft({ barcode: '0123456789012', name: 'Different Name' }),
      },
    })

    expect(match.kind).toBe('localBarcodeMatch')
    if (match.kind !== 'localBarcodeMatch') {
      throw new Error('expected a barcode match')
    }
    expect(match.food.id).toBe('food-1')
  })

  it('falls back to normalized identity matching when barcode is absent', () => {
    const localFoods = [
      buildFood({
        id: 'food-1',
        name: 'Chicken Breast',
        brand: 'Store',
        servingSize: 100,
        servingUnit: 'g',
      }),
    ]

    const match = resolveFoodIdentityMatch({
      localFoods,
      input: {
        draft: buildDraft({
          name: '  chicken breast ',
          brand: 'store',
          servingSize: 100,
          servingUnit: 'g',
        }),
      },
    })

    expect(match.kind).toBe('localIdentityMatch')
    if (match.kind !== 'localIdentityMatch') {
      throw new Error('expected an identity match')
    }
    expect(match.food.id).toBe('food-1')
  })

  it('uses cached catalog remote keys before returning none', () => {
    const match = resolveFoodIdentityMatch({
      localFoods: [],
      cachedCatalogFoods: [buildCachedCatalog({ remoteKey: 'off-1' })],
      input: {
        remoteHit: buildRemoteHit({ remoteKey: 'off-1' }),
      },
    })

    expect(match.kind).toBe('catalogRemoteKeyMatch')
    if (match.kind !== 'catalogRemoteKeyMatch') {
      throw new Error('expected a cached catalog match')
    }
    expect(match.catalogFood.remoteKey).toBe('off-1')
  })

  it('ignores archived local foods in duplicate resolution', () => {
    const match = resolveFoodIdentityMatch({
      localFoods: [buildFood({ id: 'archived', archivedAt: '2026-04-10T00:00:00.000Z' })],
      input: {
        draft: buildDraft(),
      },
    })

    expect(match.kind).toBe('none')
  })
})
