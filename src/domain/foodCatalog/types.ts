import type {
  CatalogProvider,
  Food,
  FoodDraft,
  FoodImportConfidence,
  FoodSourceQuality,
  MealType,
} from '../../types'

export type { CatalogProvider } from '../../types'

export type UnifiedFoodSource =
  | 'local_food'
  | 'recipe'
  | 'saved_meal'
  | 'favorite'
  | 'off_cached'
  | 'off_remote'

export type UnifiedFoodMatchKind = 'barcode' | 'exact' | 'prefix' | 'fuzzy'

export interface CatalogFoodRecord {
  id: string
  remoteKey: string
  provider: CatalogProvider
  name: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  imageUrl?: string
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  cachedAt: string
  staleAt: string
  lastSeenAt: string
}

export interface RemoteCatalogHit {
  remoteKey: string
  provider: CatalogProvider
  name: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  imageUrl?: string
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
}

export interface UnifiedFoodSearchResult {
  source: UnifiedFoodSource
  matchKind: UnifiedFoodMatchKind
  id: string
  foodId?: string
  recipeId?: string
  savedMealId?: string
  favoriteFoodId?: string
  catalogFoodId?: string
  remoteKey?: string
  name: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  usageCount?: number
  lastUsedAt?: string
  defaultMeal?: MealType
  isFavorite?: boolean
  stale?: boolean
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
}

export interface UnifiedFoodSearchContext {
  query: string
  preferredMeal?: MealType
}

export interface LocalFoodIdentityMatch {
  kind: 'localBarcodeMatch' | 'localIdentityMatch'
  food: Food
}

export interface CachedCatalogIdentityMatch {
  kind: 'catalogRemoteKeyMatch'
  catalogFood: CatalogFoodRecord
}

export interface NoFoodIdentityMatch {
  kind: 'none'
}

export type FoodIdentityMatch =
  | LocalFoodIdentityMatch
  | CachedCatalogIdentityMatch
  | NoFoodIdentityMatch

export interface FoodIdentityInput {
  draft?: FoodDraft
  remoteHit?: RemoteCatalogHit
}
