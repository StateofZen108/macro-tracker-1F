import { describe, expect, it } from 'vitest'
import {
  MAX_SEARCH_ALIASES,
  buildImportedFoodDraft,
  mergeImportedFood,
  mergeSearchAliases,
  resolveFoodLibraryMatch,
} from '../../src/domain/foods/personalLibrary'
import type { Food, FoodDraft } from '../../src/types'

const baseFood: Food = {
  id: 'food-1',
  name: 'Greek Yogurt',
  brand: 'Local Dairy',
  servingSize: 170,
  servingUnit: 'g',
  calories: 120,
  protein: 16,
  carbs: 6,
  fat: 0,
  source: 'custom',
  usageCount: 12,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('personal library helpers', () => {
  it('captures query, barcode, and provider references on imported drafts', () => {
    const imported = buildImportedFoodDraft({
      draft: {
        name: 'Greek Yogurt',
        brand: 'Test Dairy',
        servingSize: 170,
        servingUnit: 'g',
        calories: 120,
        protein: 16,
        carbs: 6,
        fat: 0,
        barcode: '000111222333',
        source: 'api',
        provider: 'usda_fdc',
        remoteReferences: [
          {
            provider: 'usda_fdc',
            remoteKey: '12345',
            barcode: '000111222333',
          },
        ],
      },
      acceptedQuery: 'Fage yogurt',
    })

    expect(imported.searchAliases).toContain('fage yogurt')
    expect(imported.searchAliases).toContain('test dairy greek yogurt')
    expect(imported.searchAliases).toContain('000111222333')
    expect(imported.remoteReferences).toEqual([
      {
        provider: 'usda_fdc',
        remoteKey: '12345',
        barcode: '000111222333',
      },
    ])
  })

  it('prefers barcode, then remote reference, then normalized identity, then archived matches', () => {
    const foods: Food[] = [
      {
        ...baseFood,
        id: 'barcode-match',
        barcode: '000111222333',
      },
      {
        ...baseFood,
        id: 'remote-match',
        barcode: '999999',
        remoteReferences: [{ provider: 'usda_fdc', remoteKey: '12345' }],
      },
      {
        ...baseFood,
        id: 'identity-match',
        barcode: undefined,
      },
      {
        ...baseFood,
        id: 'archived-match',
        barcode: '444444',
        archivedAt: '2026-04-01T00:00:00.000Z',
      },
    ]

    const barcodeDraft: FoodDraft = {
      ...baseFood,
      source: 'api',
      barcode: '000111222333',
      remoteReferences: [{ provider: 'usda_fdc', remoteKey: '12345' }],
    }
    expect(resolveFoodLibraryMatch(foods, barcodeDraft).kind).toBe('activeBarcodeMatch')

    const remoteDraft: FoodDraft = {
      ...baseFood,
      source: 'api',
      barcode: '222222',
      remoteReferences: [{ provider: 'usda_fdc', remoteKey: '12345' }],
    }
    expect(resolveFoodLibraryMatch(foods, remoteDraft).kind).toBe('activeRemoteReferenceMatch')

    const identityDraft: FoodDraft = {
      ...baseFood,
      source: 'api',
      barcode: undefined,
      remoteReferences: undefined,
    }
    expect(resolveFoodLibraryMatch([foods[2]], identityDraft).kind).toBe('activeIdentityMatch')

    const archivedDraft: FoodDraft = {
      ...baseFood,
      source: 'api',
      name: 'Archived Match',
      brand: undefined,
      barcode: '444444',
      servingSize: 1,
      servingUnit: 'serving',
    }
    expect(resolveFoodLibraryMatch([foods[3]], archivedDraft).kind).toBe('archivedBarcodeMatch')
  })

  it('keeps system aliases and trims older non-system aliases at the cap', () => {
    const merged = mergeSearchAliases({
      existing: Array.from({ length: MAX_SEARCH_ALIASES }, (_, index) => `legacy alias ${index}`),
      additions: ['accepted query', 'greek yogurt', 'local dairy greek yogurt'],
      systemAliases: ['greek yogurt', 'local dairy greek yogurt'],
    })

    expect(merged.trimmed).toBe(true)
    expect(merged.aliases).toHaveLength(MAX_SEARCH_ALIASES)
    expect(merged.aliases).toContain('greek yogurt')
    expect(merged.aliases).toContain('local dairy greek yogurt')
    expect(merged.aliases).toContain('accepted query')
  })

  it('fills only missing optional fields on direct matches and preserves existing macros on weak matches', () => {
    const directMerge = mergeImportedFood({
      existingFood: {
        ...baseFood,
        fiber: undefined,
        remoteReferences: [{ provider: 'open_food_facts', remoteKey: 'off-1' }],
      },
      draft: {
        ...baseFood,
        source: 'api',
        fiber: 2,
        importConfidence: 'direct_match',
        remoteReferences: [{ provider: 'usda_fdc', remoteKey: '12345' }],
      },
      acceptedQuery: 'greek yogurt pot',
      now: '2026-04-13T00:00:00.000Z',
    })

    expect(directMerge.food.fiber).toBe(2)
    expect(directMerge.food.remoteReferences).toEqual([
      { provider: 'open_food_facts', remoteKey: 'off-1', barcode: undefined },
      { provider: 'usda_fdc', remoteKey: '12345', barcode: undefined },
    ])
    expect(directMerge.food.searchAliases).toContain('greek yogurt pot')

    const weakMerge = mergeImportedFood({
      existingFood: {
        ...baseFood,
        fiber: 3,
      },
      draft: {
        ...baseFood,
        source: 'api',
        fiber: 1,
        importConfidence: 'weak_match',
      },
      now: '2026-04-13T00:00:00.000Z',
    })

    expect(weakMerge.food.fiber).toBe(3)
  })
})
