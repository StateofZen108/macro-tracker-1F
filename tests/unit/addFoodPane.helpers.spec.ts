import { describe, expect, it } from 'vitest'
import {
  buildLookupMessage,
  formatMacroSummary,
  formatServingMeta,
  formatServingsLabel,
  getRemoteCatalogStatusLabel,
} from '../../src/components/add-food/helpers'
import type { BarcodeLookupResult } from '../../src/types'

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
