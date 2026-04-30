import { assessCatalogImportQuality } from '../../src/domain/foodCatalog/importQuality.js'
import type { RemoteCatalogHit } from '../../src/domain/foodCatalog/types.js'
import type { RemoteCatalogResponse } from './types.js'

type FetchLike = typeof fetch

interface SearchUsdaFdcCatalogOptions {
  limit?: number
  cursor?: string
  timeoutMs?: number
  fetchImpl?: FetchLike
  apiKey?: string | null
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function emptyResponse(query: string): RemoteCatalogResponse {
  return {
    query,
    providers: ['usda_fdc'],
    remoteStatus: 'unavailable',
    results: [],
  }
}

function getApiKey(explicitApiKey?: string | null): string | null {
  const apiKey = explicitApiKey ?? process.env.USDA_FDC_API_KEY ?? null
  return typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : null
}

function extractNutrientValue(
  nutrients: Array<Record<string, unknown>> | undefined,
  names: string[],
): number | undefined {
  if (!Array.isArray(nutrients)) {
    return undefined
  }

  for (const nutrient of nutrients) {
    const nutrientRecord =
      typeof nutrient.nutrient === 'object' && nutrient.nutrient !== null
        ? (nutrient.nutrient as Record<string, unknown>)
        : null
    const nutrientName =
      typeof nutrient.nutrientName === 'string'
        ? nutrient.nutrientName
        : typeof nutrientRecord?.name === 'string'
          ? nutrientRecord.name
          : undefined
    if (!nutrientName || !names.includes(nutrientName.toLowerCase())) {
      continue
    }

    const value = parseNumber(nutrient.value ?? nutrient.amount)
    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

function mapUsdaFood(item: Record<string, unknown>): RemoteCatalogHit | null {
  const description =
    typeof item.description === 'string' && item.description.trim() ? item.description.trim() : null
  const fdcId = parseNumber(item.fdcId)
  if (!description || fdcId === undefined) {
    return null
  }

  const labelNutrients =
    typeof item.labelNutrients === 'object' && item.labelNutrients !== null
      ? (item.labelNutrients as Record<string, unknown>)
      : {}
  const foodNutrients = Array.isArray(item.foodNutrients)
    ? (item.foodNutrients as Array<Record<string, unknown>>)
    : undefined
  const servingSize = parseNumber(item.servingSize)
  const servingUnit =
    typeof item.servingSizeUnit === 'string' && item.servingSizeUnit.trim()
      ? item.servingSizeUnit.trim().toLowerCase()
      : undefined
  const calories =
    parseNumber((labelNutrients.calories as Record<string, unknown> | undefined)?.value) ??
    extractNutrientValue(foodNutrients, ['energy', 'energy (atwater general factors)'])
  const protein =
    parseNumber((labelNutrients.protein as Record<string, unknown> | undefined)?.value) ??
    extractNutrientValue(foodNutrients, ['protein'])
  const carbs =
    parseNumber((labelNutrients.carbohydrates as Record<string, unknown> | undefined)?.value) ??
    extractNutrientValue(foodNutrients, ['carbohydrate, by difference'])
  const fat =
    parseNumber((labelNutrients.fat as Record<string, unknown> | undefined)?.value) ??
    extractNutrientValue(foodNutrients, ['total lipid (fat)'])
  const fiber =
    parseNumber((labelNutrients.fiber as Record<string, unknown> | undefined)?.value) ??
    extractNutrientValue(foodNutrients, ['fiber, total dietary'])
  const brand =
    typeof item.brandName === 'string' && item.brandName.trim()
      ? item.brandName.trim()
      : typeof item.brandOwner === 'string' && item.brandOwner.trim()
        ? item.brandOwner.trim()
        : undefined
  const barcode = typeof item.gtinUpc === 'string' && item.gtinUpc.trim() ? item.gtinUpc.trim() : undefined
  const quality = assessCatalogImportQuality({
    provider: 'usda_fdc',
    hasExplicitServing:
      typeof servingSize === 'number' && typeof servingUnit === 'string' && servingUnit.length > 0,
    nutritionBasis:
      typeof servingSize === 'number' && typeof servingUnit === 'string'
        ? servingUnit === 'ml'
          ? 'serving'
          : 'serving'
        : 'unknown',
    calories,
    protein,
    carbs,
    fat,
    brand,
    barcode,
  })

  return {
    remoteKey: `${fdcId}`,
    provider: 'usda_fdc',
    name: description,
    brand,
    barcode,
    servingSize,
    servingUnit,
    calories,
    protein,
    carbs,
    fat,
    fiber,
    importConfidence: quality.importConfidence,
    sourceQuality: quality.sourceQuality,
    sourceQualityNote: quality.sourceQualityNote,
    importTrust: quality.importTrust,
  }
}

async function fetchWithTimeout(
  url: URL,
  requestInit: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, {
      ...requestInit,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function searchUsdaFdcCatalog(
  query: string,
  options: SearchUsdaFdcCatalogOptions = {},
): Promise<RemoteCatalogResponse> {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length < 3) {
    return {
      query: trimmedQuery,
      providers: ['usda_fdc'],
      remoteStatus: 'ok',
      results: [],
    }
  }

  const apiKey = getApiKey(options.apiKey)
  if (!apiKey) {
    return emptyResponse(trimmedQuery)
  }

  const limit = Math.min(40, Math.max(1, options.limit ?? 20))
  const pageNumber = Math.max(1, Number.parseInt(options.cursor ?? '1', 10) || 1)
  const timeoutMs = options.timeoutMs ?? 1500
  const fetchImpl = options.fetchImpl ?? fetch
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
  url.searchParams.set('api_key', apiKey)

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: trimmedQuery,
          pageSize: limit,
          pageNumber,
          dataType: ['Branded'],
        }),
      },
      timeoutMs,
      fetchImpl,
    )
    if (!response.ok) {
      return emptyResponse(trimmedQuery)
    }

    const payload = (await response.json()) as {
      totalHits?: number
      currentPage?: number
      totalPages?: number
      foods?: Array<Record<string, unknown>>
    }

    const results = (payload.foods ?? [])
      .map(mapUsdaFood)
      .filter((value): value is RemoteCatalogHit => value !== null)
    const nextCursor =
      typeof payload.currentPage === 'number' &&
      typeof payload.totalPages === 'number' &&
      payload.currentPage < payload.totalPages
        ? `${payload.currentPage + 1}`
        : undefined

    return {
      query: trimmedQuery,
      providers: ['usda_fdc'],
      remoteStatus: 'ok',
      nextCursor,
      results,
    }
  } catch {
    return emptyResponse(trimmedQuery)
  }
}
