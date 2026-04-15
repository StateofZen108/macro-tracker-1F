import { describe, expect, it, vi } from 'vitest'
import { searchOpenFoodFactsCatalog, searchUsdaFdcCatalog } from '../../server/food-catalog'

describe('searchOpenFoodFactsCatalog', () => {
  it('maps OFF search payloads into the remote catalog response shape', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          count: 3,
          page: 1,
          page_size: 2,
          products: [
            {
              code: '1234567890123',
              product_name: 'Chicken Breast',
              brands: 'Store Brand',
              serving_size: '100 g',
              nutriments: {
                'energy-kcal_100g': 165,
                proteins_100g: 31,
                carbohydrates_100g: 0,
                fat_100g: 3.6,
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )

    const response = await searchOpenFoodFactsCatalog('chicken', {
      limit: 2,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(response.remoteStatus).toBe('ok')
    expect(response.providers).toEqual(['open_food_facts'])
    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({
      remoteKey: '1234567890123',
      provider: 'open_food_facts',
      name: 'Chicken Breast',
      brand: 'Store Brand',
      servingSize: 100,
      servingUnit: 'g',
      calories: 165,
      protein: 31,
      importConfidence: 'weak_match',
      sourceQuality: 'medium',
      importTrust: {
        level: 'exact_review',
        servingBasis: '100g',
        servingBasisSource: 'per100g_fallback',
      },
    })
    expect(response.nextCursor).toBe('2')
  })

  it('returns an unavailable response when OFF fetch fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network')
    })

    const response = await searchOpenFoodFactsCatalog('chicken', {
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(response).toEqual({
      query: 'chicken',
      providers: ['open_food_facts'],
      remoteStatus: 'unavailable',
      results: [],
    })
  })

  it('treats invalid cursors as unavailable instead of silently coercing them', async () => {
    const fetchImpl = vi.fn()

    const response = await searchOpenFoodFactsCatalog('chicken', {
      cursor: 'not-a-page',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(response).toEqual({
      query: 'chicken',
      providers: ['open_food_facts'],
      remoteStatus: 'unavailable',
      results: [],
    })
  })

  it('maps USDA branded payloads into the remote catalog response shape', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          currentPage: 1,
          totalPages: 2,
          foods: [
            {
              fdcId: 12345,
              description: 'Greek Yogurt',
              brandName: 'Test Dairy',
              servingSize: 170,
              servingSizeUnit: 'g',
              gtinUpc: '000111222333',
              labelNutrients: {
                calories: { value: 120 },
                protein: { value: 16 },
                carbohydrates: { value: 6 },
                fat: { value: 0 },
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )

    const response = await searchUsdaFdcCatalog('yogurt', {
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      limit: 1,
    })

    expect(response.providers).toEqual(['usda_fdc'])
    expect(response.remoteStatus).toBe('ok')
    expect(response.nextCursor).toBe('2')
    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({
      remoteKey: '12345',
      provider: 'usda_fdc',
      name: 'Greek Yogurt',
      brand: 'Test Dairy',
      calories: 120,
      protein: 16,
      importTrust: {
        level: 'exact_autolog',
        servingBasis: 'serving',
        servingBasisSource: 'provider_serving',
      },
    })
  })
})
