import { describe, expect, it } from 'vitest'
import { buildFoodFieldEvidence, validateFoodAccuracy } from '../../src/domain/foodAccuracy'
import type { Food } from '../../src/types'

function food(overrides: Partial<Food> = {}): Food {
  return {
    id: 'food-1',
    name: 'Greek yogurt',
    servingSize: 170,
    servingUnit: 'g',
    calories: 100,
    protein: 17,
    carbs: 6,
    fat: 0,
    source: 'api',
    provider: 'open_food_facts',
    usageCount: 0,
    createdAt: '2026-04-28T08:00:00.000Z',
    ...overrides,
  }
}

describe('food accuracy validation', () => {
  it('records field-level provenance for provider-backed foods', () => {
    const fields = buildFoodFieldEvidence({
      food: food({ barcode: '1234567890123' }),
      source: 'barcode',
      confidence: 0.94,
    })

    expect(fields).toContainEqual({
      field: 'calories',
      value: 100,
      source: 'barcode',
      confidence: 0.94,
      reviewedAt: undefined,
    })
    expect(fields.find((field) => field.field === 'barcode')?.value).toBe('1234567890123')
  })

  it('flags calorie and macro energy mismatch as coaching-proof blocking until review', () => {
    const issues = validateFoodAccuracy({
      food: food({ calories: 500, protein: 10, carbs: 10, fat: 5 }),
      source: 'catalog',
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'macro_energy_mismatch',
          severity: 'review',
          blocksCoachingProof: true,
        }),
      ]),
    )
  })

  it('keeps reviewed label rounding mismatches visible but nonblocking', () => {
    const issues = validateFoodAccuracy({
      food: food({ calories: 500, protein: 10, carbs: 10, fat: 5 }),
      source: 'custom',
      reviewedAt: '2026-04-28T09:00:00.000Z',
    })

    expect(issues.find((issue) => issue.code === 'macro_energy_mismatch')).toMatchObject({
      severity: 'info',
      blocksCoachingProof: false,
    })
  })

  it('blocks impossible values and missing serving basis', () => {
    const issues = validateFoodAccuracy({
      food: food({ servingSize: 0, servingUnit: '', protein: -1 }),
      source: 'custom',
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'impossible_value', field: 'protein', severity: 'block' }),
        expect.objectContaining({ code: 'missing_serving_basis', severity: 'block' }),
      ]),
    )
  })
})
