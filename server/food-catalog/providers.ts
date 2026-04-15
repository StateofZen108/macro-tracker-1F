import type { ActionResult, BarcodeLookupResult } from '../../src/types.ts'
import type { ServerCatalogProviderAdapter, RemoteCatalogResponse } from './types.ts'
import { lookupFatSecretBarcode, searchFatSecretCatalog } from './fatsecret.ts'
import { lookupOpenFoodFactsBarcode, searchOpenFoodFactsCatalog } from './openFoodFacts.ts'
import { searchUsdaFdcCatalog } from './usdaFdc.ts'

interface CatalogSearchOptions {
  locale?: 'en-GB' | 'en-US'
  limit?: number
  cursor?: string
}

function isPersonalLibraryEnabled(): boolean {
  const value = process.env.VITE_FF_PERSONAL_LIBRARY_V1?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'on'
}

function isFatSecretEnabled(): boolean {
  const value = process.env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'on'
}

function dedupeRemoteResults(responsePages: RemoteCatalogResponse[]): RemoteCatalogResponse {
  const pages = responsePages.filter((page) => page.remoteStatus === 'ok')
  const fallback = responsePages[0] ?? {
    query: '',
    providers: ['open_food_facts'],
    remoteStatus: 'unavailable',
    results: [],
  }
  if (!pages.length) {
    return {
      ...fallback,
      providers: [...new Set(responsePages.flatMap((page) => page.providers))],
    }
  }

  const results = new Map<string, RemoteCatalogResponse['results'][number]>()
  for (const page of pages) {
    for (const result of page.results) {
      results.set(`${result.provider}:${result.remoteKey}`, result)
    }
  }

  return {
    query: pages[0].query,
    providers: [...new Set(pages.flatMap((page) => page.providers))],
    remoteStatus: 'ok',
    nextCursor: pages[0].nextCursor,
    results: [...results.values()],
  }
}

export async function searchCatalogProviders(
  query: string,
  options: CatalogSearchOptions = {},
): Promise<RemoteCatalogResponse> {
  const locale = options.locale ?? 'en-GB'
  const searchInput = {
    query,
    locale,
    limit: options.limit ?? 20,
    cursor: options.cursor,
  }

  const providerSearches: Array<Promise<RemoteCatalogResponse>> = [openFoodFactsCatalogProvider.search(searchInput)]
  if (isFatSecretEnabled() && locale === 'en-US') {
    providerSearches.unshift(fatSecretCatalogProvider.search(searchInput))
  }
  if (isPersonalLibraryEnabled() && locale === 'en-US') {
    providerSearches.push(usdaFdcCatalogProvider.search(searchInput))
  }

  return dedupeRemoteResults(await Promise.all(providerSearches))
}

export async function lookupBarcodeProviders(
  barcode: string,
): Promise<ActionResult<BarcodeLookupResult>> {
  const providerFailures: NonNullable<BarcodeLookupResult['providerFailures']> = []

  if (isFatSecretEnabled()) {
    const fatSecretResult = await lookupFatSecretBarcode(barcode, {
      locale: 'en-US',
    })
    if (fatSecretResult.ok) {
      return {
        ok: true,
        data: {
          ...fatSecretResult.data,
          providerFailures,
        },
      }
    }

    if (
      fatSecretResult.error.code !== 'notConfigured' &&
      fatSecretResult.error.code !== 'notFound'
    ) {
      providerFailures.push(fatSecretResult.error)
    }
  }

  const openFoodFactsResult = await lookupOpenFoodFactsBarcode(barcode)
  if (!openFoodFactsResult.ok) {
    return openFoodFactsResult
  }

  return {
    ok: true,
    data: {
      ...openFoodFactsResult.data,
      providerFailures,
    },
  }
}

export const openFoodFactsCatalogProvider: ServerCatalogProviderAdapter = {
  provider: 'open_food_facts',
  search(input) {
    return searchOpenFoodFactsCatalog(input.query, {
      limit: input.limit,
      cursor: input.cursor,
    })
  },
  async lookupBarcode() {
    return null
  },
}

export const fatSecretCatalogProvider: ServerCatalogProviderAdapter = {
  provider: 'fatsecret',
  search(input) {
    return searchFatSecretCatalog(input.query, {
      limit: input.limit,
      cursor: input.cursor,
    })
  },
  async lookupBarcode() {
    return null
  },
}

export const usdaFdcCatalogProvider: ServerCatalogProviderAdapter = {
  provider: 'usda_fdc',
  search(input) {
    return searchUsdaFdcCatalog(input.query, {
      limit: input.limit,
      cursor: input.cursor,
    })
  },
  async lookupBarcode() {
    return null
  },
}
