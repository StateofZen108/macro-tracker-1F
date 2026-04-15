import { describe, expect, it } from 'vitest'
import {
  buildLookupMessage,
  describeFoodWithServings,
  formatMacroSummary,
  formatSelectedFoodServingPreview,
  formatServingMeta,
  formatServingsLabel,
  getRemoteCatalogStatusLabel,
} from '../../src/components/add-food/helpers'
import type { BarcodeLookupResult, Food } from '../../src/types'

function buildLookupResult(overrides: Partial<BarcodeLookupResult> = {}): BarcodeLookupResult {
  return {
    candidate: {
      barcode: '0123456789012',
      name: 'Greek Yogurt',
      brand: 'Store',
      servingSize: 170,
      servingUnit: 'g',
      calories: 100,
      protein: 17,
      carbs: 6,
      fat: 0,
      source: 'api',
      verification: 'verified',
      nutritionBasis: 'serving',
    },
    missingFields: [],
    ...overrides,
  }
}

describe('add-food pane helpers', () => {
  it('formats serving labels with compact precision', () => {
    expect(formatServingsLabel(2)).toBe('2')
    expect(formatServingsLabel(1.255)).toBe('1.25')
  })

  it('formats serving metadata from brand and serving fields', () => {
    expect(
      formatServingMeta({
        brand: 'Store',
        servingSize: 170,
        servingUnit: 'g',
      }),
    ).toBe('Store - 170g')
  })

  it('formats macro summaries only when all core macros exist', () => {
    expect(
      formatMacroSummary({
        calories: 100,
        protein: 17,
        carbs: 6,
        fat: 0,
      }),
    ).toBe('100 cal | 17P | 6C | 0F')

    expect(
      formatMacroSummary({
        calories: 100,
        protein: 17,
        carbs: 6,
      }),
    ).toBeNull()
  })

  it('scales macro summaries for the selected food preview', () => {
    expect(
      describeFoodWithServings(
        {
          calories: 100,
          protein: 17,
          carbs: 6,
          fat: 0,
          fiber: 1,
        } as Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>,
        2,
      ),
    ).toBe('200 cal | 34P | 12C | 0F')
  })

  it('formats OCR serving text at 1x, 2x, and 0.5x', () => {
    const baseFood = {
      brand: 'Store',
      servingSize: 1,
      servingUnit: 'serving',
      labelNutrition: {
        fields: [],
        servingSizeText: '1 serving (30 g)',
        locale: 'unknown',
        source: 'label_ocr',
        reviewedAt: '2026-04-15T00:00:00.000Z',
      },
    } as Pick<Food, 'brand' | 'servingSize' | 'servingUnit' | 'labelNutrition'>

    expect(
      formatSelectedFoodServingPreview({
        ...baseFood,
        servings: 1,
      }),
    ).toEqual({
      primaryMeta: 'Store - 1 serving (30g)',
      basisMeta: null,
    })

    expect(
      formatSelectedFoodServingPreview({
        ...baseFood,
        servings: 2,
      }),
    ).toEqual({
      primaryMeta: 'Store - 2 servings (60g)',
      basisMeta: '1x = 1 serving (30g)',
    })

    expect(
      formatSelectedFoodServingPreview({
        ...baseFood,
        servings: 0.5,
      }),
    ).toEqual({
      primaryMeta: 'Store - 0.5 serving (15g)',
      basisMeta: '1x = 1 serving (30g)',
    })
  })

  it('scales OCR count phrases that already have a non-metric count unit', () => {
    expect(
      formatSelectedFoodServingPreview({
        brand: 'Store',
        servingSize: 2,
        servingUnit: 'cookies',
        labelNutrition: {
          fields: [],
          servingSizeText: '2 cookies (28 g)',
          locale: 'unknown',
          source: 'label_ocr',
          reviewedAt: '2026-04-15T00:00:00.000Z',
        },
        servings: 2,
      }),
    ).toEqual({
      primaryMeta: 'Store - 4 cookies (56g)',
      basisMeta: '1x = 2 cookies (28g)',
    })
  })

  it('formats metric-only serving previews at 2x', () => {
    expect(
      formatSelectedFoodServingPreview({
        brand: 'Store',
        servingSize: 170,
        servingUnit: 'g',
        servings: 2,
      }),
    ).toEqual({
      primaryMeta: 'Store - 2 servings (340g)',
      basisMeta: '1x = 170g',
    })
  })

  it('formats non-metric fallback previews at 2x with no basis line', () => {
    expect(
      formatSelectedFoodServingPreview({
        brand: 'Store',
        servingSize: 1,
        servingUnit: 'medium',
        servings: 2,
      }),
    ).toEqual({
      primaryMeta: 'Store - 2medium',
      basisMeta: null,
    })
  })

  it('builds lookup messages for complete and incomplete barcode imports', () => {
    expect(buildLookupMessage(buildLookupResult())).toBe('Imported 100 cal | 17P | 6C | 0F.')

    expect(
      buildLookupMessage(
        buildLookupResult({
          candidate: {
            ...buildLookupResult().candidate,
            calories: undefined,
            protein: undefined,
          },
          missingFields: ['calories', 'protein'],
        }),
      ),
    ).toBe('Imported with missing fields: calories, protein.')
  })

  it('maps remote status labels for browse pane headers', () => {
    expect(getRemoteCatalogStatusLabel('loading', false)).toBe('Searching...')
    expect(getRemoteCatalogStatusLabel('ok', true)).toBe('Loading more...')
    expect(getRemoteCatalogStatusLabel('ok', false)).toBe('Open Food Facts + USDA')
  })
})
