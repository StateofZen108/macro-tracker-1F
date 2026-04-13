import { describe, expect, it } from 'vitest'
import { findDuplicateFoodMatch, getFoodIdentityKey, normalizeFoodIdentity } from '../../src/domain/foods/dedupe'
import type { Food, FoodDraft } from '../../src/types'

const baseFood: Food = {
  id: 'food-1',
  name: 'Banana',
  servingSize: 1,
  servingUnit: 'medium',
  calories: 105,
  protein: 1.3,
  carbs: 27,
  fat: 0.4,
  source: 'custom',
  usageCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('foods dedupe', () => {
  it('normalizes identities consistently', () => {
    expect(normalizeFoodIdentity('  Banana ')).toBe('banana')
    expect(getFoodIdentityKey(baseFood)).toBe('banana||1|medium')
  })

  it('matches duplicates by barcode first', () => {
    const foods: Food[] = [{ ...baseFood, barcode: '123456' }]
    const draft: FoodDraft = { ...baseFood, barcode: '123456' }
    expect(findDuplicateFoodMatch(foods, draft)?.id).toBe('food-1')
  })

  it('matches duplicates by normalized food identity', () => {
    const foods: Food[] = [{ ...baseFood, name: '  Banana ', brand: 'Fresh' }]
    const draft: FoodDraft = { ...baseFood, name: 'banana', brand: ' fresh ' }
    expect(findDuplicateFoodMatch(foods, draft)?.name.trim()).toBe('Banana')
  })
})
