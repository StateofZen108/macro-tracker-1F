import { assessCatalogImportQuality } from '../../src/domain/foodCatalog/importQuality.ts'
import { normalizeMetricUnit, parseMetricServingText } from '../../src/domain/foodCatalog/servingBasis.ts'
import type { RemoteCatalogHit } from '../../src/domain/foodCatalog/types.ts'
import type {
  ActionResult,
  BarcodeLookupResult,
  CatalogProvider,
  ImportedFoodCandidate,
} from '../../src/types.ts'
import type { RemoteCatalogResponse } from './types.ts'

type FetchLike = typeof fetch

interface FatSecretSearchOptions {
  limit?: number
  cursor?: string
  fetchImpl?: FetchLike
  tokenFetchImpl?: FetchLike
  apiBase?: string
}

interface FatSecretLookupOptions {
  fetchImpl?: FetchLike
  tokenFetchImpl?: FetchLike
  apiBase?: string
  locale?: 'en-GB' | 'en-US'
}

export interface FatSecretProviderFailure {
  provider: Extract<CatalogProvider, 'fatsecret'>
  code: string
  message: string
  retryAfterSeconds?: number
}

type FatSecretFailureCode =
  | 'notConfigured'
  | 'providerDisabled'
  | 'tokenFetchFailed'
  | 'authFailed'
  | 'rateLimited'
  | 'serviceUnavailable'
  | 'networkError'
  | 'notFound'
  | 'invalidResponse'

type FatSecretResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FatSecretProviderFailure & { code: FatSecretFailureCode } }

type FatSecretServingRecord = Record<string, unknown>
type FatSecretFoodRecord = Record<string, unknown>

const OAUTH_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token'
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000
const AUTH_DISABLE_MS = 15 * 60 * 1000
const RATE_LIMIT_DISABLE_MS = 30 * 60 * 1000
const TRANSIENT_BACKOFF_MS = [5 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000] as const
const FATSECRET_SCOPE = 'premier barcode'
const MAIN_MACROS = ['calories', 'protein', 'carbs', 'fat'] as const

let cachedAccessToken: { token: string; expiresAt: number } | null = null
let disabledUntil = 0
let transientFailureCount = 0

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function providerFailure(
  code: FatSecretFailureCode,
  message: string,
  retryAfterSeconds?: number,
): FatSecretProviderFailure & { code: FatSecretFailureCode } {
  return {
    provider: 'fatsecret',
    code,
    message,
    retryAfterSeconds,
  }
}

function emptyResponse(query: string): RemoteCatalogResponse {
  return {
    query,
    providers: ['fatsecret'],
    remoteStatus: 'unavailable',
    results: [],
  }
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function getRegion(locale: 'en-GB' | 'en-US'): 'GB' | 'US' {
  return locale === 'en-GB' ? 'GB' : 'US'
}

function isFeatureEnabled(): boolean {
  const value = process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'on'
}

function getCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.FATSECRET_CLIENT_ID?.trim()
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return null
  }

  return { clientId, clientSecret }
}

function getApiBase(explicitApiBase?: string): string {
  return (explicitApiBase ?? process.env.FATSECRET_API_BASE ?? 'https://platform.fatsecret.com').replace(/\/+$/, '')
}

function parseRetryAfterSeconds(response: Response): number | undefined {
  const retryAfterHeader = response.headers.get('retry-after')
  if (!retryAfterHeader) {
    return undefined
  }

  const numeric = Number.parseInt(retryAfterHeader, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

function markDisabled(durationMs: number): number {
  const nextDisabledUntil = Date.now() + durationMs
  disabledUntil = Math.max(disabledUntil, nextDisabledUntil)
  return Math.max(1, Math.ceil((disabledUntil - Date.now()) / 1000))
}

function markTransientFailure(): number {
  const backoffMs = TRANSIENT_BACKOFF_MS[Math.min(transientFailureCount, TRANSIENT_BACKOFF_MS.length - 1)]
  transientFailureCount += 1
  return markDisabled(backoffMs)
}

function clearTransientFailureState(): void {
  transientFailureCount = 0
}

function normalizeFailureFromStatus(response: Response): FatSecretProviderFailure & { code: FatSecretFailureCode } {
  const retryAfterSeconds = parseRetryAfterSeconds(response)
  if (response.status === 401 || response.status === 403) {
    return providerFailure(
      'authFailed',
      'FatSecret rejected the access token.',
      retryAfterSeconds ?? Math.ceil(AUTH_DISABLE_MS / 1000),
    )
  }

  if (response.status === 429) {
    return providerFailure(
      'rateLimited',
      'FatSecret rate-limited the request.',
      retryAfterSeconds ?? Math.ceil(RATE_LIMIT_DISABLE_MS / 1000),
    )
  }

  if (response.status === 404) {
    return providerFailure('notFound', 'FatSecret did not return a food for this request.')
  }

  return providerFailure('serviceUnavailable', 'FatSecret is unavailable right now.')
}

async function fetchToken(fetchImpl: FetchLike): Promise<FatSecretResult<string>> {
  if (!isFeatureEnabled()) {
    return {
      ok: false,
      error: providerFailure('notConfigured', 'FatSecret lookup is disabled.'),
    }
  }

  const credentials = getCredentials()
  if (!credentials) {
    return {
      ok: false,
      error: providerFailure('notConfigured', 'FatSecret credentials are missing.'),
    }
  }

  if (disabledUntil > Date.now()) {
    return {
      ok: false,
      error: providerFailure(
        'providerDisabled',
        'FatSecret is temporarily disabled after provider failures.',
        Math.max(1, Math.ceil((disabledUntil - Date.now()) / 1000)),
      ),
    }
  }

  if (cachedAccessToken && cachedAccessToken.expiresAt - TOKEN_REFRESH_WINDOW_MS > Date.now()) {
    return { ok: true, data: cachedAccessToken.token }
  }

  try {
    const response = await fetchImpl(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: process.env.FATSECRET_SCOPE?.trim() || FATSECRET_SCOPE,
      }),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: providerFailure(
            'authFailed',
            'FatSecret rejected the client credentials.',
            markDisabled(AUTH_DISABLE_MS),
          ),
        }
      }

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(response)
        return {
          ok: false,
          error: providerFailure(
            'rateLimited',
            'FatSecret rate-limited token requests.',
            retryAfterSeconds ?? markDisabled(RATE_LIMIT_DISABLE_MS),
          ),
        }
      }

      return {
        ok: false,
        error: providerFailure(
          'tokenFetchFailed',
          'FatSecret token acquisition failed.',
          markTransientFailure(),
        ),
      }
    }

    const payload = (await response.json()) as {
      access_token?: string
      expires_in?: number | string
    }
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token.trim() : ''
    const expiresIn = parseNumber(payload.expires_in) ?? 3600
    if (!accessToken) {
      return {
        ok: false,
        error: providerFailure(
          'invalidResponse',
          'FatSecret token response did not include an access token.',
          markTransientFailure(),
        ),
      }
    }

    cachedAccessToken = {
      token: accessToken,
      expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
    }
    clearTransientFailureState()
    return { ok: true, data: accessToken }
  } catch {
    return {
      ok: false,
      error: providerFailure(
        'networkError',
        'FatSecret token acquisition failed due to a network error.',
        markTransientFailure(),
      ),
    }
  }
}

async function callFatSecretJson(
  endpointPath: string,
  params: Record<string, string>,
  options: {
    fetchImpl?: FetchLike
    tokenFetchImpl?: FetchLike
    apiBase?: string
    retryOnAuthFailure?: boolean
  } = {},
): Promise<FatSecretResult<unknown>> {
  const fetchImpl = options.fetchImpl ?? fetch
  const tokenFetchImpl = options.tokenFetchImpl ?? fetchImpl
  const tokenResult = await fetchToken(tokenFetchImpl)
  if (!tokenResult.ok) {
    return tokenResult
  }

  const url = new URL(`${getApiBase(options.apiBase)}${endpointPath}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set('format', 'json')

  try {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${tokenResult.data}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && options.retryOnAuthFailure !== false) {
        cachedAccessToken = null
        const retryTokenResult = await fetchToken(tokenFetchImpl)
        if (!retryTokenResult.ok) {
          return retryTokenResult
        }

        return callFatSecretJson(endpointPath, params, {
          ...options,
          retryOnAuthFailure: false,
        })
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          error: providerFailure(
            'authFailed',
            'FatSecret rejected the access token.',
            markDisabled(AUTH_DISABLE_MS),
          ),
        }
      }

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(response)
        if (!retryAfterSeconds) {
          markDisabled(RATE_LIMIT_DISABLE_MS)
        }
        return {
          ok: false,
          error: providerFailure(
            'rateLimited',
            'FatSecret rate-limited the request.',
            retryAfterSeconds ?? Math.ceil(RATE_LIMIT_DISABLE_MS / 1000),
          ),
        }
      }

      if (response.status === 404) {
        return {
          ok: false,
          error: normalizeFailureFromStatus(response),
        }
      }

      return {
        ok: false,
        error: providerFailure(
          'serviceUnavailable',
          'FatSecret is unavailable right now.',
          markTransientFailure(),
        ),
      }
    }

    const payload = await response.json()
    clearTransientFailureState()
    return {
      ok: true,
      data: payload,
    }
  } catch {
    return {
      ok: false,
      error: providerFailure(
        'networkError',
        'FatSecret request failed due to a network error.',
        markTransientFailure(),
      ),
    }
  }
}

function toServingArray(food: FatSecretFoodRecord): FatSecretServingRecord[] {
  const servings =
    typeof food.servings === 'object' && food.servings !== null
      ? (food.servings as Record<string, unknown>).serving
      : undefined

  if (Array.isArray(servings)) {
    return servings.filter((value): value is FatSecretServingRecord => typeof value === 'object' && value !== null)
  }

  if (typeof servings === 'object' && servings !== null) {
    return [servings as FatSecretServingRecord]
  }

  return []
}

function isContainerStyleDescription(description: string): boolean {
  return /\b(container|package|bottle|bag|box|can|carton|jar|pouch|tray|whole)\b/i.test(description)
}

function parseServingDescription(
  serving: FatSecretServingRecord,
): {
  servingSize: number
  servingUnit: 'g' | 'ml'
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  description: string
  isPerHundred: boolean
  isContainerMetric: boolean
} | null {
  const metricAmount = parseNumber(serving.metric_serving_amount)
  const metricUnit = normalizeMetricUnit(
    typeof serving.metric_serving_unit === 'string' ? serving.metric_serving_unit : undefined,
  )
  if (metricAmount === undefined || metricAmount <= 0 || !metricUnit) {
    return null
  }

  const description =
    typeof serving.serving_description === 'string' && serving.serving_description.trim()
      ? serving.serving_description.trim()
      : `${metricAmount} ${metricUnit}`
  const parsedDescriptionMetric = parseMetricServingText(description)
  const descriptionAmount = parsedDescriptionMetric?.servingSize ?? metricAmount
  const descriptionUnit = parsedDescriptionMetric?.servingUnit ?? metricUnit
  const isPerHundred =
    descriptionAmount === 100 &&
    (descriptionUnit === 'g' || descriptionUnit === 'ml') &&
    /\b100\s*(g|ml)\b/i.test(description)

  return {
    servingSize: metricAmount,
    servingUnit: metricUnit,
    calories: parseNumber(serving.calories),
    protein: parseNumber(serving.protein),
    carbs: parseNumber(serving.carbohydrate),
    fat: parseNumber(serving.fat),
    fiber: parseNumber(serving.fiber),
    description,
    isPerHundred,
    isContainerMetric: isContainerStyleDescription(description),
  }
}

function chooseServing(food: FatSecretFoodRecord): ReturnType<typeof parseServingDescription> {
  const parsedServings = toServingArray(food)
    .map(parseServingDescription)
    .filter((value): value is NonNullable<ReturnType<typeof parseServingDescription>> => value !== null)

  if (!parsedServings.length) {
    return null
  }

  const nonPerHundredMetric = parsedServings.filter((serving) => !serving.isPerHundred)
  if (nonPerHundredMetric.length) {
    const standardServing = nonPerHundredMetric.find((serving) => !serving.isContainerMetric)
    return standardServing ?? nonPerHundredMetric[0]
  }

  return parsedServings[0]
}

function extractFoodImage(food: FatSecretFoodRecord): string | undefined {
  const images =
    typeof food.food_images === 'object' && food.food_images !== null
      ? (food.food_images as Record<string, unknown>).food_image
      : undefined

  const imageArray = Array.isArray(images) ? images : images ? [images] : []
  for (const image of imageArray) {
    if (typeof image !== 'object' || image === null) {
      continue
    }

    const imageUrl = (image as Record<string, unknown>).image_url
    if (typeof imageUrl === 'string' && imageUrl.trim()) {
      return imageUrl.trim()
    }
  }

  return undefined
}

function mapFatSecretFoodToRemoteHit(food: FatSecretFoodRecord, barcode?: string): RemoteCatalogHit | null {
  const foodId =
    typeof food.food_id === 'string' || typeof food.food_id === 'number'
      ? `${food.food_id}`.trim()
      : ''
  const name = typeof food.food_name === 'string' ? food.food_name.trim() : ''
  if (!foodId || !name) {
    return null
  }

  const brand = typeof food.brand_name === 'string' && food.brand_name.trim() ? food.brand_name.trim() : undefined
  const selectedServing = chooseServing(food)
  const quality =
    selectedServing?.isPerHundred
      ? assessCatalogImportQuality({
          provider: 'fatsecret',
          hasExplicitServing: false,
          nutritionBasis: selectedServing.servingUnit === 'ml' ? '100ml' : '100g',
          servingBasisSource: selectedServing.servingUnit === 'ml' ? 'per100ml_fallback' : 'per100g_fallback',
          calories: selectedServing.calories,
          protein: selectedServing.protein,
          carbs: selectedServing.carbs,
          fat: selectedServing.fat,
          brand,
          barcode,
        })
      : assessCatalogImportQuality({
          provider: 'fatsecret',
          hasExplicitServing:
            Boolean(selectedServing) && !selectedServing?.isPerHundred && !selectedServing?.isContainerMetric,
          nutritionBasis: selectedServing ? 'serving' : 'unknown',
          servingBasisSource: selectedServing ? 'provider_serving' : 'provider_quantity',
          calories: selectedServing?.calories,
          protein: selectedServing?.protein,
          carbs: selectedServing?.carbs,
          fat: selectedServing?.fat,
          brand,
          barcode,
        })

  return {
    remoteKey: foodId,
    provider: 'fatsecret',
    name,
    brand,
    barcode,
    servingSize: selectedServing?.servingSize,
    servingUnit: selectedServing?.servingUnit,
    calories: selectedServing?.calories,
    protein: selectedServing?.protein,
    carbs: selectedServing?.carbs,
    fat: selectedServing?.fat,
    fiber: selectedServing?.fiber,
    imageUrl: extractFoodImage(food),
    importConfidence: quality.importConfidence,
    sourceQuality: quality.sourceQuality,
    sourceQualityNote: quality.sourceQualityNote,
    importTrust: quality.importTrust,
  }
}

function mapFatSecretFoodToBarcodeCandidate(
  food: FatSecretFoodRecord,
  barcode: string,
): ImportedFoodCandidate | null {
  const normalizedHit = mapFatSecretFoodToRemoteHit(food, barcode)
  if (!normalizedHit) {
    return null
  }

  const verification: ImportedFoodCandidate['verification'] =
    normalizedHit.importTrust?.level === 'exact_autolog' ? 'verified' : 'needsConfirmation'

  return {
    provider: 'fatsecret',
    remoteKey: normalizedHit.remoteKey,
    barcode,
    name: normalizedHit.name,
    brand: normalizedHit.brand,
    servingSize: normalizedHit.servingSize ?? 1,
    servingUnit: normalizedHit.servingUnit ?? 'serving',
    calories: normalizedHit.calories,
    protein: normalizedHit.protein,
    carbs: normalizedHit.carbs,
    fat: normalizedHit.fat,
    fiber: normalizedHit.fiber,
    source: 'api',
    verification,
    nutritionBasis: normalizedHit.importTrust?.servingBasis ?? 'unknown',
    importTrust:
      normalizedHit.importTrust
        ? {
            ...normalizedHit.importTrust,
            verifiedAt: new Date().toISOString(),
          }
        : undefined,
    importConfidence: normalizedHit.importConfidence ?? 'manual_review_required',
    sourceQuality: normalizedHit.sourceQuality ?? 'low',
    note: normalizedHit.sourceQualityNote,
  }
}

function extractSearchFoods(payload: unknown): FatSecretFoodRecord[] {
  if (typeof payload !== 'object' || payload === null) {
    return []
  }

  const root = payload as Record<string, unknown>
  const foodsSearch =
    typeof root.foods_search === 'object' && root.foods_search !== null
      ? (root.foods_search as Record<string, unknown>)
      : root
  const food = foodsSearch.food
  if (Array.isArray(food)) {
    return food.filter((value): value is FatSecretFoodRecord => typeof value === 'object' && value !== null)
  }

  if (typeof food === 'object' && food !== null) {
    return [food as FatSecretFoodRecord]
  }

  return []
}

function readSearchMetadata(payload: unknown): {
  totalResults?: number
  pageNumber?: number
  maxResults?: number
} {
  if (typeof payload !== 'object' || payload === null) {
    return {}
  }

  const root = payload as Record<string, unknown>
  const foodsSearch =
    typeof root.foods_search === 'object' && root.foods_search !== null
      ? (root.foods_search as Record<string, unknown>)
      : root

  return {
    totalResults: parseNumber(foodsSearch.total_results),
    pageNumber: parseNumber(foodsSearch.page_number),
    maxResults: parseNumber(foodsSearch.max_results),
  }
}

export async function searchFatSecretCatalog(
  query: string,
  options: FatSecretSearchOptions = {},
): Promise<RemoteCatalogResponse> {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length < 3) {
    return {
      query: trimmedQuery,
      providers: ['fatsecret'],
      remoteStatus: 'ok',
      results: [],
    }
  }

  if (!isFeatureEnabled() || !getCredentials()) {
    return emptyResponse(trimmedQuery)
  }

  const pageNumber = Math.max(0, Number.parseInt(options.cursor ?? '0', 10) || 0)
  const maxResults = Math.min(50, Math.max(1, options.limit ?? 20))
  const response = await callFatSecretJson(
    '/rest/foods/search/v2',
    {
      search_expression: trimmedQuery,
      page_number: `${pageNumber}`,
      max_results: `${maxResults}`,
      flag_default_serving: 'true',
      region: 'US',
      language: 'en',
    },
    {
      fetchImpl: options.fetchImpl,
      tokenFetchImpl: options.tokenFetchImpl,
      apiBase: options.apiBase,
    },
  )

  if (!response.ok) {
    return emptyResponse(trimmedQuery)
  }

  const foods = extractSearchFoods(response.data)
    .map((food) => mapFatSecretFoodToRemoteHit(food))
    .filter((value): value is RemoteCatalogHit => value !== null)
  const metadata = readSearchMetadata(response.data)
  const nextCursor =
    typeof metadata.totalResults === 'number' &&
    typeof metadata.pageNumber === 'number' &&
    typeof metadata.maxResults === 'number' &&
    (metadata.pageNumber + 1) * metadata.maxResults < metadata.totalResults
      ? `${metadata.pageNumber + 1}`
      : undefined

  return {
    query: trimmedQuery,
    providers: ['fatsecret'],
    remoteStatus: 'ok',
    nextCursor,
    results: foods,
  }
}

export async function lookupFatSecretBarcode(
  barcode: string,
  options: FatSecretLookupOptions = {},
): Promise<FatSecretResult<BarcodeLookupResult>> {
  const normalizedBarcode = barcode.replace(/\D/g, '')
  if (normalizedBarcode.length < 8) {
    return {
      ok: false,
      error: providerFailure('notFound', 'Provide a valid barcode.'),
    }
  }

  if (!isFeatureEnabled() || !getCredentials()) {
    return {
      ok: false,
      error: providerFailure('notConfigured', 'FatSecret lookup is not configured.'),
    }
  }

  const locale = options.locale ?? 'en-US'
  const response = await callFatSecretJson(
    '/rest/food/barcode/find-by-id/v2',
    {
      barcode: normalizedBarcode,
      flag_default_serving: 'true',
      region: getRegion(locale),
      language: 'en',
    },
    {
      fetchImpl: options.fetchImpl,
      tokenFetchImpl: options.tokenFetchImpl,
      apiBase: options.apiBase,
    },
  )

  if (!response.ok) {
    return response
  }

  const payload = response.data
  const food =
    typeof payload === 'object' && payload !== null && typeof (payload as Record<string, unknown>).food === 'object'
      ? ((payload as Record<string, unknown>).food as FatSecretFoodRecord)
      : null

  if (!food) {
    return {
      ok: false,
      error: providerFailure('notFound', 'FatSecret did not return a food for this barcode.'),
    }
  }

  const candidate = mapFatSecretFoodToBarcodeCandidate(food, normalizedBarcode)
  if (!candidate) {
    return {
      ok: false,
      error: providerFailure(
        'invalidResponse',
        'FatSecret barcode response did not include a usable food record.',
      ),
    }
  }

  return {
    ok: true,
    data: {
      candidate,
      missingFields: MAIN_MACROS.filter((field) => candidate[field] === undefined),
    },
  }
}

export async function lookupFatSecretBarcodeWithFallback(
  barcode: string,
  options: FatSecretLookupOptions = {},
): Promise<ActionResult<BarcodeLookupResult>> {
  const result = await lookupFatSecretBarcode(barcode, options)
  if (!result.ok) {
    return fail(result.error.code, result.error.message)
  }

  return ok(result.data)
}
