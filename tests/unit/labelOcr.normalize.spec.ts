import { describe, expect, it } from 'vitest'
import { normalizeOcrFieldName, normalizeOcrRow, normalizeOcrValue } from '../../src/domain/labelOcr'

describe('label OCR normalization', () => {
  it('maps common nutrition aliases into canonical fields', () => {
    expect(normalizeOcrFieldName('Total Carbohydrate').canonicalField).toBe('carbs')
    expect(normalizeOcrFieldName('Calories').canonicalField).toBe('calories')
    expect(normalizeOcrFieldName('Sugars').canonicalField).toBe('sugar')
  })

  it('parses numeric OCR values with units', () => {
    expect(normalizeOcrValue('31 g')).toMatchObject({
      numericValue: 31,
      unit: 'g',
      comparator: null,
    })
    expect(normalizeOcrValue('< 2 mg')).toMatchObject({
      numericValue: 2,
      unit: 'mg',
      comparator: '<',
    })
  })

  it('normalizes OCR rows from cell-based table input', () => {
    const row = normalizeOcrRow(
      {
        cells: ['Protein', '24 g'],
        confidence: 0.94,
      },
      0,
    )

    expect(row.canonicalField).toBe('protein')
    expect(row.numericValue).toBe(24)
    expect(row.unit).toBe('g')
    expect(row.confidence).toBe(0.94)
  })
})
