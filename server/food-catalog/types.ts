import type {
  CatalogProviderAdapter,
  NormalizedBarcodeLookupResult,
  NormalizedCatalogSearchPage,
} from '../../src/types'

export type RemoteCatalogResponse = NormalizedCatalogSearchPage

export type ServerCatalogProviderAdapter = CatalogProviderAdapter

export type ServerBarcodeLookupResult = NormalizedBarcodeLookupResult
