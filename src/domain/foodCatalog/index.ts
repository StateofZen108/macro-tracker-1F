export {
  buildCatalogFoodRecord,
  clearCatalogCacheForTests,
  isCatalogFoodStale,
  listCatalogCache,
  pruneCatalogCache,
  saveCatalogHitsToCache,
  searchCatalogCache,
} from './cache'
export { resolveFoodIdentityMatch } from './identity'
export { detectUnifiedFoodMatchKind, rankUnifiedFoodSearchResults } from './ranking'
export type {
  CatalogFoodRecord,
  CatalogProvider,
  FoodIdentityInput,
  FoodIdentityMatch,
  RemoteCatalogHit,
  UnifiedFoodMatchKind,
  UnifiedFoodSearchContext,
  UnifiedFoodSearchResult,
  UnifiedFoodSource,
} from './types'
