import { describe, expect, it } from 'vitest'
import { buildDescribeFoodDraftV1 } from '../../src/domain/foodCatalog/describe'
import type { Food } from '../../src/types'

const foods: Food[] = [
  {
    id: 'food-eggs',
    name: 'Eggs',
    servingSize: 1,
    servingUnit: 'egg',
    calories: 70,
    protein: 6,
    carbs: 1,
    fat: 5,
    source: 'custom',
    usageCount: 2,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'food-yogurt',
    name: 'Greek Yogurt',
    brand: 'Tesco',
    servingSize: 150,
    servingUnit: 'g',
    calories: 100,
    protein: 15,
    carbs: 5,
    fat: 0,
    source: 'api',
    usageCount: 1,
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
  },
]

describe('buildDescribeFoodDraftV1', () => {
  it('builds a local-match draft for a clean single-item description', () => {
    const draft = buildDescribeFoodDraftV1({
      rawText: '2 eggs',
      locale: 'en-GB',
      foods,
      searchFoods: (query) => foods.filter((food) => food.name.toLowerCase().includes(query.toLowerCase())),
    })

    expect(draft).not.toBeNull()
    expect(draft?.reviewMode).toBe('local_match')
    expect(draft?.item.candidateLocalFoodId).toBe('food-eggs')
    expect(draft?.item.amount).toBe(2)
  })

  it('downgrades ambiguous multi-item text to manual review', () => {
    const draft = buildDescribeFoodDraftV1({
      rawText: '2 eggs and toast',
      locale: 'en-GB',
      foods,
      searchFoods: () => foods,
    })

    expect(draft).not.toBeNull()
    expect(draft?.reviewMode).toBe('manual_only')
    expect(draft?.confidence).toBe('low')
  })
})
