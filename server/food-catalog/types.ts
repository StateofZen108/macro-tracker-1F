export interface RemoteCatalogResponse {
  query: string
  provider: 'open_food_facts'
  remoteStatus: 'ok' | 'unavailable'
  nextCursor?: string
  results: Array<{
    remoteKey: string
    provider: 'open_food_facts'
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
    importConfidence?: 'direct_match' | 'weak_match' | 'manual_review_required'
    sourceQuality?: 'high' | 'medium' | 'low'
    sourceQualityNote?: string
  }>
}
