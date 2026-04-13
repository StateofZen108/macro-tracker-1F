import { describe, expect, it } from 'vitest'
import {
  extractCanonicalMacros,
  normalizeOcrRows,
  preserveUnmappedRows,
  shapeNutritionLabelReviewSession,
} from '../../src/domain/labelOcr'

describe('label OCR review session shaping', () => {
  it('extracts canonical macros from normalized OCR rows', () => {
    const rows = normalizeOcrRows([
      { label: 'Calories', value: '200 kcal', confidence: 0.91 },
      { label: 'Protein', value: '30 g', confidence: 0.91 },
      { label: 'Carbs', value: '15 g', confidence: 0.91 },
      { label: 'Fat', value: '6 g', confidence: 0.91 },
      { label: 'Fiber', value: '3 g', confidence: 0.91 },
    ])

    const extraction = extractCanonicalMacros(rows)
    expect(extraction.draft).toMatchObject({
      calories: 200,
      protein: 30,
      carbs: 15,
      fat: 6,
      fiber: 3,
    })
    expect(extraction.missingFields).toEqual([])
  })

  it('preserves unmapped rows for manual review', () => {
    const rows = normalizeOcrRows([
      { label: 'Calories', value: '200 kcal' },
      { label: 'Potassium', value: '300 mg' },
    ])

    const unmappedRows = preserveUnmappedRows(rows)
    expect(unmappedRows).toHaveLength(1)
    expect(unmappedRows[0]).toMatchObject({
      rawLabel: 'Potassium',
      reason: 'unmappedField',
    })
  })

  it('marks review sessions as needing review when rows are missing or unmapped', () => {
    const session = shapeNutritionLabelReviewSession({
      source: 'test-fixture',
      rows: [
        { label: 'Calories', value: '200 kcal' },
        { label: 'Protein', value: '30 g' },
        { label: 'Salt', value: '1.2 g' },
      ],
    })

    expect(session.status).toBe('needsReview')
    expect(session.unmappedRows).toHaveLength(1)
    expect(session.reviewReasons.some((reason) => reason.includes('Missing canonical fields'))).toBe(
      true,
    )
  })
})
