import { assessCatalogImportQuality } from '../../src/domain/foodCatalog/importQuality.ts'
import { fetchFoodByBarcode as fetchOpenFoodFactsBarcode } from '../../src/utils/openFoodFacts.ts'
import type { RemoteCatalogHit } from '../../src/domain/foodCatalog/types.ts'
import type { ActionResult, BarcodeLookupResult } from '../../src/types.ts'
import type { RemoteCatalogResponse } from './types.ts'

type FetchLike = typeof fetch

interface SearchOpenFoodFactsCatalogOptions {
  limit?: number
  cursor?: string
  timeoutMs?: number
  fetchImpl?: FetchLike
}

type Nutriments = Record<string, unknown>

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = Number.parseFloat(value.replace(',', '.'))
    if (Number.isFinite(normalized)) {
      return normalized
    }
  }

  return undefined
}

function normalizeUnit(unit: string | undefined): string | undefined {
  const normalized = unit?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (normalized === 'gram' || normalized === 'grams') {
    return 'g'
  }

  if (normalized === 'milliliter' || normalized === 'milliliters') {
    return 'ml'
  }

  return normalized
}

function parseServingMetadata(product: Record<string, unknown>): {
  servingSize?: number
  servingUnit?: string
} {
  const servingSizeText =
    typeof product.serving_size === 'string' ? product.serving_size.trim() : undefined
  if (servingSizeText) {
    const match = servingSizeText.match(/([\d.,]+)\s*([a-zA-Z]+)/)
    if (match) {
      return {
        servingSize: parseNumber(match[1]),
        servingUnit: normalizeUnit(match[2]),
      }
    }
  }

  const servingQuantity = parseNumber(product.serving_quantity)
  if (servingQuantity !== undefined) {
    return {
      servingSize: servingQuantity,
      servingUnit: 'g',
    }
  }

  return {}
}

function buildSearchUrl(query: string, limit: number, page: number): URL {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl')
  url.searchParams.set('search_terms', query)
  url.searchParams.set('search_simple', '1')
  url.searchParams.set('action', 'process')
  url.searchParams.set('json', '1')
  url.searchParams.set('page_size', `${limit}`)
  url.searchParams.set('page', `${page}`)
  return url
}

function mapOpenFoodFactsProduct(product: Record<string, unknown>): RemoteCatalogHit | null {
  const name =
    typeof product.product_name === 'string'
      ? product.product_name.trim()
      : typeof product.product_name_en === 'string'
        ? product.product_name_en.trim()
        : typeof product.generic_name === 'string'
          ? product.generic_name.trim()
          : ''
  if (!name) {
    return null
  }

  const remoteKey =
    typeof product.code === 'string' && product.code.trim()
      ? product.code.trim()
      : typeof product.id === 'string' && product.id.trim()
        ? product.id.trim()
        : ''
  if (!remoteKey) {
    return null
  }

  const brand =
    typeof product.brands === 'string' && product.brands.trim()
      ? product.brands.split(',')[0]?.trim()
      : undefined
  const nutriments = (product.nutriments ?? {}) as Nutriments
  const servingMeta = parseServingMetadata(product)
  const calories = parseNumber(nutriments['energy-kcal_serving'] ?? nutriments['energy-kcal_100g'])
  const protein = parseNumber(nutriments.proteins_serving ?? nutriments.proteins_100g)
  const carbs = parseNumber(nutriments.carbohydrates_serving ?? nutriments.carbohydrates_100g)
  const fat = parseNumber(nutriments.fat_serving ?? nutriments.fat_100g)
  const quality = assessCatalogImportQuality({
    provider: 'open_food_facts',
    hasExplicitServing:
      typeof servingMeta.servingSize === 'number' &&
      typeof servingMeta.servingUnit === 'string' &&
      servingMeta.servingUnit.length > 0,
    nutritionBasis:
      typeof nutriments['energy-kcal_serving'] === 'number' ||
      typeof nutriments.proteins_serving === 'number' ||
      typeof nutriments.carbohydrates_serving === 'number' ||
      typeof nutriments.fat_serving === 'number'
        ? 'serving'
        : servingMeta.servingUnit === 'ml'
          ? '100ml'
          : '100g',
    calories,
    protein,
    carbs,
    fat,
    brand,
    barcode: typeof product.code === 'string' ? product.code.trim() : undefined,
  })

  return {
    remoteKey,
    provider: 'open_food_facts',
    name,
    brand,
    barcode: typeof product.code === 'string' ? product.code.trim() : undefined,
    servingSize: servingMeta.servingSize,
    servingUnit: servingMeta.servingUnit,
    calories,
    protein,
    carbs,
    fat,
    fiber: parseNumber(nutriments.fiber_serving ?? nutriments.fiber_100g),
    imageUrl:
      typeof product.image_front_small_url === 'string'
        ? product.image_front_small_url
        : typeof product.image_url === 'string'
          ? product.image_url
          : undefined,
    importConfidence: quality.importConfidence,
    sourceQuality: quality.sourceQuality,
    sourceQualityNote: quality.sourceQualityNote,
    importTrust: quality.importTrust,
  }
}

function emptyResponse(query: string): RemoteCatalogResponse {
  return {
    query,
    providers: ['open_food_facts'],
    remoteStatus: 'unavailable',
    results: [],
  }
}

async function fetchWithTimeout(
  url: URL,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function searchOpenFoodFactsCatalog(
  query: string,
  options: SearchOpenFoodFactsCatalogOptions = {},
): Promise<RemoteCatalogResponse> {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length < 3) {
    return {
      query: trimmedQuery,
      providers: ['open_food_facts'],
      remoteStatus: 'ok',
      results: [],
    }
  }

  const limit = Math.min(40, Math.max(1, options.limit ?? 20))
  if (options.cursor && !/^[1-9]\d*$/.test(options.cursor.trim())) {
    return emptyResponse(trimmedQuery)
  }

  const page = Math.max(1, Number.parseInt(options.cursor ?? '1', 10) || 1)
  const timeoutMs = options.timeoutMs ?? 1500
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchWithTimeout(buildSearchUrl(trimmedQuery, limit, page), timeoutMs, fetchImpl)
    if (!response.ok) {
      return emptyResponse(trimmedQuery)
    }

    const payload = (await response.json()) as {
      count?: number
      page?: number
      page_size?: number
      products?: Array<Record<string, unknown>>
    }

    const results = (payload.products ?? [])
      .map(mapOpenFoodFactsProduct)
      .filter((value): value is RemoteCatalogHit => value !== null)

    const count = typeof payload.count === 'number' ? payload.count : undefined
    const pageSize = typeof payload.page_size === 'number' ? payload.page_size : limit
    const currentPage = typeof payload.page === 'number' ? payload.page : page
    const nextCursor =
      count !== undefined && currentPage * pageSize < count ? `${currentPage + 1}` : undefined

    return {
      query: trimmedQuery,
      providers: ['open_food_facts'],
      remoteStatus: 'ok',
      nextCursor,
      results,
    }
  } catch {
    return emptyResponse(trimmedQuery)
  }
}

export async function lookupOpenFoodFactsBarcode(
  barcode: string,
): Promise<ActionResult<BarcodeLookupResult>> {
  return fetchOpenFoodFactsBarcode(barcode)
}
