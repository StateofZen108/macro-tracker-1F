import { describe, expect, it } from 'vitest'
import {
  buildNutrientProfileFromLabelFields,
  buildNutrientProfileFromLegacyNutrition,
  canonicalizeNutrientKeyV1,
  getNutrientAmountV1,
  sumNutrientProfilesV1,
} from '../../src/domain/nutrition'

describe('nutrition profile helpers', () => {
  it('canonicalizes legacy and OCR nutrient aliases into V1 keys', () => {
    expect(canonicalizeNutrientKeyV1('Calories')).toBe('calories')
    expect(canonicalizeNutrientKeyV1('sugar')).toBe('sugars')
    expect(canonicalizeNutrientKeyV1('addedSugar')).toBe('addedSugars')
    expect(canonicalizeNutrientKeyV1('fiber')).toBe('fiber')
    expect(canonicalizeNutrientKeyV1('servingSize')).toBeNull()
  })

  it('builds and sums nutrient profiles from legacy food nutrition fields', () => {
    const base = buildNutrientProfileFromLegacyNutrition({
      calories: 200,
      protein: 25,
      carbs: 15,
      fat: 8,
      fiber: 4,
      sugars: 3,
      sodium: 120,
    })
    const scaled = buildNutrientProfileFromLegacyNutrition(
      {
        calories: 100,
        protein: 10,
        carbs: 5,
        fat: 2,
        salt: 1.5,
      },
      2,
    )

    const combined = sumNutrientProfilesV1([base, scaled])
    expect(getNutrientAmountV1(combined, 'calories')).toBe(400)
    expect(getNutrientAmountV1(combined, 'protein')).toBe(45)
    expect(getNutrientAmountV1(combined, 'salt')).toBe(3)
    expect(getNutrientAmountV1(combined, 'sodium')).toBe(120)
  })

  it('builds rich nutrient profiles from reviewed label fields without fabricating trace values', () => {
    const profile = buildNutrientProfileFromLabelFields([
      {
        normalizedKey: 'sugars',
        rawLabel: 'Sugars',
        value: 12,
        unit: 'g',
      },
      {
        normalizedKey: 'sodium',
        rawLabel: 'Sodium',
        value: 140,
        unit: 'mg',
      },
      {
        normalizedKey: 'salt',
        rawLabel: 'Salt',
        value: 'traces',
        unit: 'g',
      },
    ])

    expect(getNutrientAmountV1(profile, 'sugars')).toBe(12)
    expect(getNutrientAmountV1(profile, 'sodium')).toBe(140)
    expect(getNutrientAmountV1(profile, 'salt')).toBeNull()
  })
})
