import type { RemoteCatalogResponse } from './types'
import { searchOpenFoodFactsCatalog } from './openFoodFacts'

interface CatalogSearchOptions {
  limit?: number
  cursor?: string
}

export async function searchCatalogProviders(
  query: string,
  options: CatalogSearchOptions = {},
): Promise<RemoteCatalogResponse> {
  return searchOpenFoodFactsCatalog(query, options)
}

