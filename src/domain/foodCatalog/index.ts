export {
  buildCatalogFoodRecord,
  clearCatalogCacheForTests,
  isCatalogFoodStale,
  listCatalogCache,
  pruneCatalogCache,
  saveCatalogHitsToCache,
  searchCatalogCache,
} from './cache.js'
export { resolveFoodIdentityMatch } from './identity.js'
export { detectUnifiedFoodMatchKind, rankUnifiedFoodSearchResults } from './ranking.js'
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
} from './types.js'
