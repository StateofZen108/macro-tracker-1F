import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../server/food-catalog/fatsecret', () => ({
  lookupFatSecretBarcode: vi.fn(),
  readFatSecretFailure: vi.fn((result) => (result.ok === false ? result : null)),
  readFatSecretSuccess: vi.fn((result) => (result.ok === true ? result : null)),
  searchFatSecretCatalog: vi.fn(),
}))

vi.mock('../../server/food-catalog/openFoodFacts', () => ({
  lookupOpenFoodFactsBarcode: vi.fn(),
  searchOpenFoodFactsCatalog: vi.fn(),
}))

vi.mock('../../server/food-catalog/usdaFdc', () => ({
  searchUsdaFdcCatalog: vi.fn(),
}))

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.VITE_FF_PERSONAL_LIBRARY_V1
  delete process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1
})

describe('searchCatalogProviders', () => {
  it('prepends FatSecret results when the FatSecret barcode lane is enabled', async () => {
    process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1 = 'true'

    const { searchFatSecretCatalog } = await import('../../server/food-catalog/fatsecret')
    const { searchOpenFoodFactsCatalog } = await import('../../server/food-catalog/openFoodFacts')
    vi.mocked(searchFatSecretCatalog).mockResolvedValue({
      query: 'protein bar',
      providers: ['fatsecret'],
      remoteStatus: 'ok',
      results: [
        {
          remoteKey: 'fs-1',
          provider: 'fatsecret',
          name: 'Protein Bar',
          brand: 'FatSecret Brand',
        },
      ],
    })
    vi.mocked(searchOpenFoodFactsCatalog).mockResolvedValue({
      query: 'protein bar',
      providers: ['open_food_facts'],
      remoteStatus: 'ok',
      results: [
        {
          remoteKey: 'off-1',
          provider: 'open_food_facts',
          name: 'Protein Bar',
          brand: 'OFF Brand',
        },
      ],
    })

    const { searchCatalogProviders } = await import('../../server/food-catalog/providers')
    const response = await searchCatalogProviders('protein bar', {
      locale: 'en-US',
    })

    expect(response.providers).toEqual(['fatsecret', 'open_food_facts'])
    expect(response.results.map((result) => `${result.provider}:${result.remoteKey}`)).toEqual([
      'fatsecret:fs-1',
      'open_food_facts:off-1',
    ])
  })

  it('merges OFF and USDA results for en-US when personal library is enabled', async () => {
    process.env.VITE_FF_PERSONAL_LIBRARY_V1 = 'true'

    const { searchFatSecretCatalog } = await import('../../server/food-catalog/fatsecret')
    const { searchOpenFoodFactsCatalog } = await import('../../server/food-catalog/openFoodFacts')
    const { searchUsdaFdcCatalog } = await import('../../server/food-catalog/usdaFdc')
    vi.mocked(searchFatSecretCatalog).mockResolvedValue({
      query: 'yogurt',
      providers: ['fatsecret'],
      remoteStatus: 'unavailable',
      results: [],
    })
    vi.mocked(searchOpenFoodFactsCatalog).mockResolvedValue({
      query: 'yogurt',
      providers: ['open_food_facts'],
      remoteStatus: 'ok',
      nextCursor: '2',
      results: [
        {
          remoteKey: 'off-1',
          provider: 'open_food_facts',
          name: 'Greek Yogurt',
          brand: 'OFF Brand',
        },
      ],
    })
    vi.mocked(searchUsdaFdcCatalog).mockResolvedValue({
      query: 'yogurt',
      providers: ['usda_fdc'],
      remoteStatus: 'ok',
      results: [
        {
          remoteKey: 'fdc-1',
          provider: 'usda_fdc',
          name: 'Greek Yogurt',
          brand: 'USDA Brand',
        },
      ],
    })

    const { searchCatalogProviders } = await import('../../server/food-catalog/providers')
    const response = await searchCatalogProviders('yogurt', {
      locale: 'en-US',
    })

    expect(response.providers).toEqual(['open_food_facts', 'usda_fdc'])
    expect(response.nextCursor).toBe('2')
    expect(response.results).toHaveLength(2)
    expect(response.results.map((result) => `${result.provider}:${result.remoteKey}`)).toEqual([
      'open_food_facts:off-1',
      'usda_fdc:fdc-1',
    ])
  })

  it('falls back to OFF only for en-GB even when personal library is enabled', async () => {
    process.env.VITE_FF_PERSONAL_LIBRARY_V1 = 'true'

    const { searchFatSecretCatalog } = await import('../../server/food-catalog/fatsecret')
    const { searchOpenFoodFactsCatalog } = await import('../../server/food-catalog/openFoodFacts')
    const { searchUsdaFdcCatalog } = await import('../../server/food-catalog/usdaFdc')
    vi.mocked(searchFatSecretCatalog).mockResolvedValue({
      query: 'beans',
      providers: ['fatsecret'],
      remoteStatus: 'unavailable',
      results: [],
    })
    vi.mocked(searchOpenFoodFactsCatalog).mockResolvedValue({
      query: 'beans',
      providers: ['open_food_facts'],
      remoteStatus: 'ok',
      results: [],
    })

    const { searchCatalogProviders } = await import('../../server/food-catalog/providers')
    await searchCatalogProviders('beans', {
      locale: 'en-GB',
    })

    expect(searchFatSecretCatalog).not.toHaveBeenCalled()
    expect(searchOpenFoodFactsCatalog).toHaveBeenCalledOnce()
    expect(searchUsdaFdcCatalog).not.toHaveBeenCalled()
  })
})

describe('lookupBarcodeProviders', () => {
  it('returns the FatSecret hit first when available', async () => {
    process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1 = 'true'

    const { lookupFatSecretBarcode } = await import('../../server/food-catalog/fatsecret')
    const { lookupOpenFoodFactsBarcode } = await import('../../server/food-catalog/openFoodFacts')
    vi.mocked(lookupFatSecretBarcode).mockResolvedValue({
      ok: true,
      data: {
        candidate: {
          provider: 'fatsecret',
          remoteKey: 'fs-123',
          barcode: '0123456789012',
          name: 'Protein Drink',
          servingSize: 330,
          servingUnit: 'ml',
          calories: 160,
          protein: 30,
          carbs: 4,
          fat: 1,
          source: 'api',
          verification: 'verified',
          nutritionBasis: 'serving',
          importConfidence: 'direct_match',
          sourceQuality: 'high',
          importTrust: {
            level: 'exact_autolog',
            servingBasis: 'serving',
            servingBasisSource: 'provider_serving',
            blockingIssues: [],
          },
        },
        missingFields: [],
      },
    })
    vi.mocked(lookupOpenFoodFactsBarcode).mockResolvedValue({
      ok: false,
      error: {
        code: 'notFound',
        message: 'No product was found for that barcode.',
      },
    })

    const { lookupBarcodeProviders } = await import('../../server/food-catalog/providers')
    const response = await lookupBarcodeProviders('0123456789012')

    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(response.data.candidate.provider).toBe('fatsecret')
      expect(response.data.providerFailures).toEqual([])
    }
    expect(lookupOpenFoodFactsBarcode).not.toHaveBeenCalled()
  })

  it('falls back to OFF and returns provider failure metadata when FatSecret is unavailable', async () => {
    process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1 = 'true'

    const { lookupFatSecretBarcode } = await import('../../server/food-catalog/fatsecret')
    const { lookupOpenFoodFactsBarcode } = await import('../../server/food-catalog/openFoodFacts')
    vi.mocked(lookupFatSecretBarcode).mockResolvedValue({
      ok: false,
      error: {
        provider: 'fatsecret',
        code: 'rateLimited',
        message: 'FatSecret rate-limited the request.',
        retryAfterSeconds: 1800,
      },
    })
    vi.mocked(lookupOpenFoodFactsBarcode).mockResolvedValue({
      ok: true,
      data: {
        candidate: {
          provider: 'open_food_facts',
          remoteKey: 'off-123',
          barcode: '0123456789012',
          name: 'Protein Drink',
          servingSize: 100,
          servingUnit: 'ml',
          calories: 45,
          protein: 9,
          carbs: 3,
          fat: 0.5,
          source: 'api',
          verification: 'needsConfirmation',
          nutritionBasis: '100ml',
          importConfidence: 'weak_match',
          sourceQuality: 'medium',
          importTrust: {
            level: 'exact_review',
            servingBasis: '100ml',
            servingBasisSource: 'per100ml_fallback',
            blockingIssues: ['per100_fallback'],
          },
        },
        missingFields: [],
      },
    })

    const { lookupBarcodeProviders } = await import('../../server/food-catalog/providers')
    const response = await lookupBarcodeProviders('0123456789012')

    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(response.data.candidate.provider).toBe('open_food_facts')
      expect(response.data.providerFailures).toEqual([
        {
          provider: 'fatsecret',
          code: 'rateLimited',
          message: 'FatSecret rate-limited the request.',
          retryAfterSeconds: 1800,
        },
      ])
    }
    expect(lookupOpenFoodFactsBarcode).toHaveBeenCalledOnce()
  })

  it.each(['notConfigured', 'notFound'] as const)(
    'falls back to OFF without provider failure metadata when FatSecret returns %s',
    async (code) => {
      process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1 = 'true'

      const { lookupFatSecretBarcode } = await import('../../server/food-catalog/fatsecret')
      const { lookupOpenFoodFactsBarcode } = await import('../../server/food-catalog/openFoodFacts')
      vi.mocked(lookupFatSecretBarcode).mockResolvedValue({
        ok: false,
        error: {
          provider: 'fatsecret',
          code,
          message: `FatSecret ${code}`,
        },
      })
      vi.mocked(lookupOpenFoodFactsBarcode).mockResolvedValue({
        ok: true,
        data: {
          candidate: {
            provider: 'open_food_facts',
            remoteKey: 'off-456',
            barcode: '0123456789012',
            name: 'Fallback Food',
            servingSize: 100,
            servingUnit: 'g',
            calories: 120,
            protein: 10,
            carbs: 12,
            fat: 4,
            source: 'api',
            verification: 'needsConfirmation',
            nutritionBasis: '100g',
            importConfidence: 'weak_match',
            sourceQuality: 'medium',
            importTrust: {
              level: 'exact_review',
              servingBasis: '100g',
              servingBasisSource: 'per100g_fallback',
              blockingIssues: ['per100_fallback'],
            },
          },
          missingFields: [],
        },
      })

      const { lookupBarcodeProviders } = await import('../../server/food-catalog/providers')
      const response = await lookupBarcodeProviders('0123456789012')

      expect(response.ok).toBe(true)
      if (response.ok) {
        expect(response.data.candidate.provider).toBe('open_food_facts')
        expect(response.data.providerFailures).toEqual([])
      }
      expect(lookupOpenFoodFactsBarcode).toHaveBeenCalledOnce()
    },
  )
})
