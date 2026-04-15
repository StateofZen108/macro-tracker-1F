import { describe, expect, it } from 'vitest'
import { assessCatalogImportQuality } from '../../src/domain/foodCatalog/importQuality'

describe('assessCatalogImportQuality', () => {
  it('marks complete branded foods as direct imports', () => {
    const result = assessCatalogImportQuality({
      provider: 'open_food_facts',
      hasExplicitServing: true,
      nutritionBasis: 'serving',
      calories: 210,
      protein: 15,
      carbs: 24,
      fat: 8,
      brand: 'Tesco',
      barcode: '5012345678901',
    })

    expect(result.importConfidence).toBe('direct_match')
    expect(result.sourceQuality).toBe('high')
    expect(result.importTrust).toMatchObject({
      level: 'exact_autolog',
      servingBasis: 'serving',
      servingBasisSource: 'provider_serving',
      blockingIssues: [],
    })
  })

  it('downgrades 100g fallback foods to weak matches', () => {
    const result = assessCatalogImportQuality({
      provider: 'open_food_facts',
      hasExplicitServing: false,
      nutritionBasis: '100g',
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 4,
      brand: 'Store',
    })

    expect(result.importConfidence).toBe('weak_match')
    expect(result.sourceQuality).toBe('medium')
    expect(result.sourceQualityNote).toMatch(/100g/i)
    expect(result.importTrust).toMatchObject({
      level: 'exact_review',
      servingBasis: '100g',
      servingBasisSource: 'per100g_fallback',
      blockingIssues: ['per100_fallback'],
    })
  })

  it('requires manual review when macros are incomplete', () => {
    const result = assessCatalogImportQuality({
      provider: 'open_food_facts',
      hasExplicitServing: true,
      nutritionBasis: 'serving',
      calories: 95,
      protein: 3,
      carbs: undefined,
      fat: 1,
    })

    expect(result.importConfidence).toBe('manual_review_required')
    expect(result.sourceQuality).toBe('low')
    expect(result.importTrust).toMatchObject({
      level: 'blocked',
    })
    expect(result.importTrust.blockingIssues).toContain('missing_macros')
  })
})
