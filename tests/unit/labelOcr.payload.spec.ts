import { describe, expect, it } from 'vitest'
import { buildSessionFromProviderPayload } from '../../src/utils/labelOcrPayload'

describe('buildSessionFromProviderPayload', () => {
  it('maps servings-per-container metadata into the review session', () => {
    const session = buildSessionFromProviderPayload({
      candidate: {
        name: 'Container Hard Case',
        brand: 'Label Hard Case',
        servingSize: 50,
        servingUnit: 'g',
        calories: 200,
        protein: 9,
        carbs: 18,
        fat: 11,
        fiber: 2,
        servingsPerContainer: 3,
        caloriesPerContainer: 600,
      },
      fields: {
        servingSizeText: {
          value: '1 bar (50 g)',
        },
        calories: {
          value: 200,
          sourceText: '200 kcal',
        },
        protein: {
          value: 9,
          sourceText: '9 g',
        },
        carbs: {
          value: 18,
          sourceText: '18 g',
        },
        fat: {
          value: 11,
          sourceText: '11 g',
        },
      },
      warnings: [],
    })

    expect(session).not.toBeNull()
    expect(session?.servingsPerContainer).toBe(3)
    expect(session?.caloriesPerContainer).toBe(600)
    expect(session?.servingSizeText).toBe('1 bar (50 g)')
  })
})
