import { describe, expect, it } from 'vitest'
import {
  buildLabelReviewValues,
  buildLabelReviewWarnings,
  buildOcrDraftFromReview,
} from '../../src/utils/ocrReview'
import type { LabelOcrReviewSession } from '../../src/types'

function createSession(
  overrides: Partial<LabelOcrReviewSession['foodDraft']> = {},
): LabelOcrReviewSession {
  return {
    provider: 'gemini',
    requiresReview: true,
    warnings: ['Serving size was inferred from the label image.'],
    fieldCandidates: [
      {
        normalizedKey: 'calories',
        rawLabel: 'Calories',
        value: 210,
        unit: 'kcal',
        sourceText: '210 kcal',
        confidence: 0.92,
      },
      {
        normalizedKey: 'protein',
        rawLabel: 'Protein',
        value: 8,
        unit: 'g',
        sourceText: '8 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'carbs',
        rawLabel: 'Carbs',
        value: 33,
        unit: 'g',
        sourceText: '33 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'fat',
        rawLabel: 'Fat',
        value: 4,
        unit: 'g',
        sourceText: '4 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'fiber',
        rawLabel: 'Fiber',
        value: 5,
        unit: 'g',
        sourceText: '5 g',
        confidence: 0.92,
      },
      {
        normalizedKey: 'sodium',
        rawLabel: 'Sodium',
        value: 120,
        unit: 'mg',
        sourceText: '120 mg',
        confidence: 0.78,
      },
    ],
    unmappedFields: [
      {
        rawLabel: 'Salt',
        value: 1.2,
        unit: 'g',
        sourceText: '1.2 g',
        confidence: 0.7,
      },
    ],
    foodDraft: {
      name: 'OCR Oats',
      brand: 'Test Brand',
      servingSize: 2,
      servingUnit: 'cookies',
      calories: 210,
      protein: 8,
      carbs: 33,
      fat: 4,
      fiber: 5,
      sodium: 120,
      source: 'api',
      labelNutrition: {
        fields: [],
        servingSizeText: '2 cookies (28 g)',
        locale: 'unknown',
        source: 'label_ocr',
        reviewedAt: '2026-04-12T09:00:00.000Z',
      },
      ...overrides,
    },
  }
}

describe('OCR review draft mapping', () => {
  it('prefills grams from label text and preserves the original label serving text on save', () => {
    const session = createSession()
    const values = buildLabelReviewValues(session)

    expect(values.servingSize).toBe('28')
    expect(values.servingUnit).toBe('g')

    const draft = buildOcrDraftFromReview(values, session)
    expect(draft).toMatchObject({
      servingSize: 28,
      servingUnit: 'g',
      calories: 210,
      protein: 8,
      carbs: 33,
      fat: 4,
      fiber: 5,
      sodium: 120,
    })
    expect(draft.labelNutrition?.servingSizeText).toBe('2 cookies (28 g)')
  })

  it('uses a 100 g fallback when OCR only yields a per-100 basis', () => {
    const session = createSession({
      servingSize: 100,
      servingUnit: 'g',
      labelNutrition: undefined,
    })

    const values = buildLabelReviewValues(session)
    expect(values.servingSize).toBe('100')
    expect(values.servingUnit).toBe('g')

    const draft = buildOcrDraftFromReview(values, session)
    expect(draft.servingSize).toBe(100)
    expect(draft.servingUnit).toBe('g')
    expect(draft.labelNutrition?.servingSizeText).toBe('100 g')
  })

  it('keeps the original serving basis and shows a warning when no metric amount exists', () => {
    const session = createSession({
      servingSize: 1,
      servingUnit: 'bar',
      labelNutrition: {
        fields: [],
        servingSizeText: '1 bar',
        locale: 'unknown',
        source: 'label_ocr',
        reviewedAt: '2026-04-12T09:00:00.000Z',
      },
    })

    const values = buildLabelReviewValues(session)
    expect(values.servingSize).toBe('1')
    expect(values.servingUnit).toBe('bar')

    const warnings = buildLabelReviewWarnings(session, values)
    expect(
      warnings.some(
        (warning) =>
          warning.message === 'Serving basis could not be resolved. Enter a serving size before saving.',
      ),
    ).toBe(true)

    const draft = buildOcrDraftFromReview(values, session)
    expect(draft.servingSize).toBe(1)
    expect(draft.servingUnit).toBe('bar')
    expect(draft.labelNutrition?.servingSizeText).toBe('1 bar')
  })
})
