import { describe, expect, it } from 'vitest'
import { buildTrustRepairTasks, classifyFoodTrustEvidence, isFoodTrustedForCoaching } from '../../src/domain/foodTrust'
import type { Food, FoodLogEntry } from '../../src/types'

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
    updatedAt: '2026-04-28T08:00:00.000Z',
    ...overrides,
  }
}

describe('food trust evidence', () => {
  it('trusts exact complete barcode or catalog hits with verified serving basis', () => {
    const evidence = classifyFoodTrustEvidence({
      food: food({
        barcode: '1234567890123',
        importTrust: {
          level: 'exact_autolog',
          servingBasis: '100g',
          servingBasisSource: 'provider_quantity',
          blockingIssues: [],
          verifiedAt: '2026-04-28T09:00:00.000Z',
        },
      }),
    })

    expect(evidence.status).toBe('trusted')
    expect(evidence.servingBasis).toBe('verified')
    expect(isFoodTrustedForCoaching(evidence)).toBe(true)
  })

  it('requires review when providers conflict or confidence is low', () => {
    const evidence = classifyFoodTrustEvidence({
      food: food({
        importTrust: {
          level: 'exact_review',
          servingBasis: 'serving',
          servingBasisSource: 'provider_serving',
          blockingIssues: ['provider_conflict'],
        },
      }),
      confidence: 0.62,
    })

    expect(evidence.status).toBe('review_required')
    expect(evidence.providerConflict).toBe(true)
    expect(evidence.reasons).toContain('provider_conflict')
  })

  it('blocks coaching proof when macros or serving basis are missing', () => {
    const evidence = classifyFoodTrustEvidence({
      food: food({
        servingSize: 0,
        servingUnit: '',
        calories: Number.NaN,
      }),
    })

    expect(evidence.status).toBe('blocked')
    expect(evidence.reasons).toContain('missing_macros')
    expect(evidence.reasons).toContain('unknown_serving_basis')
  })

  it('promotes reviewed OCR or custom food to trusted', () => {
    const evidence = classifyFoodTrustEvidence({
      food: food({
        source: 'custom',
        labelNutrition: {
          fields: [],
          locale: 'uk_eu',
          source: 'label_ocr',
          reviewedAt: '2026-04-28T10:00:00.000Z',
        },
      }),
    })

    expect(evidence.source).toBe('ocr')
    expect(evidence.status).toBe('trusted')
    expect(evidence.reviewedAt).toBe('2026-04-28T10:00:00.000Z')
  })

  it('creates exact repair tasks for untrusted logged foods', () => {
    const entry: FoodLogEntry = {
      id: 'entry-1',
      date: '2026-04-28',
      meal: 'breakfast',
      servings: 1,
      createdAt: '2026-04-28T08:00:00.000Z',
      needsReview: true,
      snapshot: {
        name: 'Imported meal',
        servingSize: 0,
        servingUnit: '',
        calories: Number.NaN,
        protein: 20,
        carbs: 30,
        fat: 10,
        source: 'custom',
      },
    }

    const tasks = buildTrustRepairTasks({ date: '2026-04-28', entries: [entry] })

    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      logEntryId: 'entry-1',
      reasonCode: 'missing_macros',
      status: 'open',
      blockingCoachProof: true,
    })
  })
})
