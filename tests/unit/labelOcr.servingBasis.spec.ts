import { describe, expect, it } from 'vitest'
import { resolveOcrServingBasis } from '../../src/utils/ocrReview'
import type { LabelOcrReviewSession } from '../../src/types'

function createSession(
  overrides: Partial<LabelOcrReviewSession['foodDraft']> = {},
): LabelOcrReviewSession {
  return {
    provider: 'gemini',
    requiresReview: true,
    warnings: [],
    fieldCandidates: [],
    unmappedFields: [],
    foodDraft: {
      name: 'Test Food',
      servingSize: 1,
      servingUnit: 'serving',
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 10,
      source: 'api',
      ...overrides,
    },
  }
}

describe('OCR serving basis resolution', () => {
  it('keeps existing gram-based servings unchanged', () => {
    const resolution = resolveOcrServingBasis(
      createSession({
        servingSize: 55,
        servingUnit: 'g',
      }),
    )

    expect(resolution).toMatchObject({
      servingSize: 55,
      servingUnit: 'g',
      source: 'metricDraft',
    })
  })

  it('prefers a parenthesized gram amount from label serving text', () => {
    const resolution = resolveOcrServingBasis(
      createSession({
        servingSize: 2,
        servingUnit: 'cookies',
        labelNutrition: {
          fields: [],
          servingSizeText: '2 cookies (28 g)',
          locale: 'unknown',
          source: 'label_ocr',
          reviewedAt: '2026-04-12T08:00:00.000Z',
        },
      }),
    )

    expect(resolution).toMatchObject({
      servingSize: 28,
      servingUnit: 'g',
      source: 'labelTextMetric',
    })
  })

  it('uses a parenthesized milliliter amount for liquids', () => {
    const resolution = resolveOcrServingBasis(
      createSession({
        servingSize: 1,
        servingUnit: 'bottle',
        labelNutrition: {
          fields: [],
          servingSizeText: '1 bottle (500 ml)',
          locale: 'unknown',
          source: 'label_ocr',
          reviewedAt: '2026-04-12T08:00:00.000Z',
        },
      }),
    )

    expect(resolution).toMatchObject({
      servingSize: 500,
      servingUnit: 'ml',
      source: 'labelTextMetric',
    })
  })

  it('keeps a per-100 metric fallback when no explicit serving text exists', () => {
    const resolution = resolveOcrServingBasis(
      createSession({
        servingSize: 100,
        servingUnit: 'g',
      }),
    )

    expect(resolution).toMatchObject({
      servingSize: 100,
      servingUnit: 'g',
      source: 'per100Metric',
    })
  })

  it('keeps the original serving basis and returns a warning when no metric amount exists', () => {
    const resolution = resolveOcrServingBasis(
      createSession({
        servingSize: 1,
        servingUnit: 'bar',
        labelNutrition: {
          fields: [],
          servingSizeText: '1 bar',
          locale: 'unknown',
          source: 'label_ocr',
          reviewedAt: '2026-04-12T08:00:00.000Z',
        },
      }),
    )

    expect(resolution).toMatchObject({
      servingSize: 1,
      servingUnit: 'bar',
      source: 'originalServing',
    })
    expect(resolution.warningMessage).toBe(
      'Serving basis could not be resolved. Enter a serving size before saving.',
    )
  })
})
