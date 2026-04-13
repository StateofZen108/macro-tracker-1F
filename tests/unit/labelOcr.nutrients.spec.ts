import { describe, expect, it } from 'vitest'
import {
  buildLegacyLabelNutrientProfileV1,
  extractOcrNutrientMappingV1,
  mapCanonicalNutritionFieldToNutrientKeyV1,
} from '../../src/domain/labelOcr'
import type { NormalizedLabelOcrRow } from '../../src/domain/labelOcr'
import { getNutrientAmountV1 } from '../../src/domain/nutrition'

function makeRow(overrides: Partial<NormalizedLabelOcrRow>): NormalizedLabelOcrRow {
  return {
    id: 'row-1',
    index: 0,
    rawLabel: 'Calories',
    rawValue: '200',
    normalizedLabel: 'calories',
    normalizedValue: '200',
    canonicalField: 'calories',
    matchedAlias: 'calories',
    numericValue: 200,
    unit: 'kcal',
    comparator: null,
    confidence: 0.9,
    page: null,
    ...overrides,
  }
}

describe('label OCR nutrient helpers', () => {
  it('maps OCR canonical nutrition fields onto rich nutrient keys', () => {
    expect(mapCanonicalNutritionFieldToNutrientKeyV1('sugar')).toBe('sugars')
    expect(mapCanonicalNutritionFieldToNutrientKeyV1('addedSugar')).toBe('addedSugars')
    expect(mapCanonicalNutritionFieldToNutrientKeyV1('sodium')).toBe('sodium')
    expect(mapCanonicalNutritionFieldToNutrientKeyV1('servingSize')).toBeNull()
  })

  it('extracts deterministic nutrient selections from normalized OCR rows', () => {
    const mapping = extractOcrNutrientMappingV1([
      makeRow({
        id: 'sugar-a',
        rawLabel: 'Sugars',
        rawValue: '12 g',
        normalizedLabel: 'sugars',
        normalizedValue: '12 g',
        canonicalField: 'sugar',
        matchedAlias: 'sugars',
        numericValue: 12,
        unit: 'g',
        confidence: 0.95,
      }),
      makeRow({
        id: 'sugar-b',
        index: 1,
        rawLabel: 'Sugars',
        rawValue: '10 g',
        normalizedLabel: 'sugars',
        normalizedValue: '10 g',
        canonicalField: 'sugar',
        matchedAlias: 'sugars',
        numericValue: 10,
        unit: 'g',
        confidence: 0.8,
      }),
      makeRow({
        id: 'added-sugar',
        index: 2,
        rawLabel: 'Includes Added Sugars',
        rawValue: '8 g',
        normalizedLabel: 'includes added sugars',
        normalizedValue: '8 g',
        canonicalField: 'addedSugar',
        matchedAlias: 'includesaddedsugars',
        numericValue: 8,
        unit: 'g',
        confidence: 0.7,
      }),
      makeRow({
        id: 'sodium',
        index: 3,
        rawLabel: 'Sodium',
        rawValue: '140 mg',
        normalizedLabel: 'sodium',
        normalizedValue: '140 mg',
        canonicalField: 'sodium',
        matchedAlias: 'sodium',
        numericValue: 140,
        unit: 'mg',
        confidence: 0.9,
      }),
    ])

    expect(getNutrientAmountV1(mapping.profile, 'sugars')).toBe(12)
    expect(getNutrientAmountV1(mapping.profile, 'addedSugars')).toBe(8)
    expect(getNutrientAmountV1(mapping.profile, 'sodium')).toBe(140)
    expect(mapping.duplicateKeys).toContain('sugars')
    expect(mapping.warnings[0]).toMatch(/multiple ocr rows mapped to sugars/i)
  })

  it('maps current legacy label review fields into rich nutrient profiles', () => {
    const profile = buildLegacyLabelNutrientProfileV1([
      {
        normalizedKey: 'sugars',
        rawLabel: 'Sugars',
        value: 14,
      },
      {
        normalizedKey: 'salt',
        rawLabel: 'Salt',
        value: 1.2,
      },
      {
        normalizedKey: 'sodium',
        rawLabel: 'Sodium',
        value: 240,
      },
    ])

    expect(getNutrientAmountV1(profile, 'sugars')).toBe(14)
    expect(getNutrientAmountV1(profile, 'salt')).toBe(1.2)
    expect(getNutrientAmountV1(profile, 'sodium')).toBe(240)
  })
})
