import type { UnifiedFoodMatchKind, UnifiedFoodSearchContext, UnifiedFoodSearchResult } from './types'

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function compareTimestamps(left?: string, right?: string): number {
  const leftValue = left ?? ''
  const rightValue = right ?? ''
  return rightValue.localeCompare(leftValue)
}

function getSourcePriority(result: UnifiedFoodSearchResult): number {
  switch (result.source) {
    case 'local_food':
      return 6
    case 'favorite':
      return 5
    case 'saved_meal':
      return 4
    case 'recipe':
      return 3
    case 'off_cached':
      return 2
    case 'off_remote':
      return 1
    default:
      return 0
  }
}

function getImportConfidencePriority(result: UnifiedFoodSearchResult): number {
  switch (result.importConfidence) {
    case 'direct_match':
      return 3
    case 'weak_match':
      return 2
    case 'manual_review_required':
      return 1
    default:
      return 0
  }
}

function getSourceQualityPriority(result: UnifiedFoodSearchResult): number {
  switch (result.sourceQuality) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

function getMatchPriority(matchKind: UnifiedFoodMatchKind): number {
  switch (matchKind) {
    case 'barcode':
      return 4
    case 'exact':
      return 3
    case 'prefix':
      return 2
    case 'fuzzy':
      return 1
    default:
      return 0
  }
}

export function detectUnifiedFoodMatchKind(
  query: string,
  value: Pick<UnifiedFoodSearchResult, 'name' | 'brand' | 'barcode'>,
): UnifiedFoodMatchKind {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    return 'fuzzy'
  }

  const name = value.name.trim().toLowerCase()
  const brand = value.brand?.trim().toLowerCase() ?? ''
  const barcode = value.barcode?.trim().toLowerCase() ?? ''
  if (barcode && barcode.includes(normalizedQuery)) {
    return 'barcode'
  }

  if (name === normalizedQuery || `${name} ${brand}`.trim() === normalizedQuery) {
    return 'exact'
  }

  if (name.startsWith(normalizedQuery) || brand.startsWith(normalizedQuery)) {
    return 'prefix'
  }

  return 'fuzzy'
}

export function rankUnifiedFoodSearchResults(
  results: UnifiedFoodSearchResult[],
  context: UnifiedFoodSearchContext,
): UnifiedFoodSearchResult[] {
  const normalizedQuery = normalizeQuery(context.query)

  return [...results].sort((left, right) => {
    const leftMatch = getMatchPriority(left.matchKind)
    const rightMatch = getMatchPriority(right.matchKind)
    if (leftMatch !== rightMatch) {
      return rightMatch - leftMatch
    }

    const leftFavorite = left.isFavorite ? 1 : 0
    const rightFavorite = right.isFavorite ? 1 : 0
    if (leftFavorite !== rightFavorite) {
      return rightFavorite - leftFavorite
    }

    const recentComparison = compareTimestamps(left.lastUsedAt, right.lastUsedAt)
    if (recentComparison !== 0) {
      return recentComparison
    }

    const leftMealRelevance =
      context.preferredMeal && left.defaultMeal === context.preferredMeal ? 1 : 0
    const rightMealRelevance =
      context.preferredMeal && right.defaultMeal === context.preferredMeal ? 1 : 0
    if (leftMealRelevance !== rightMealRelevance) {
      return rightMealRelevance - leftMealRelevance
    }

    const leftUsageCount = left.usageCount ?? 0
    const rightUsageCount = right.usageCount ?? 0
    if (leftUsageCount !== rightUsageCount) {
      return rightUsageCount - leftUsageCount
    }

    const leftImportConfidence = getImportConfidencePriority(left)
    const rightImportConfidence = getImportConfidencePriority(right)
    if (leftImportConfidence !== rightImportConfidence) {
      return rightImportConfidence - leftImportConfidence
    }

    const leftSourceQuality = getSourceQualityPriority(left)
    const rightSourceQuality = getSourceQualityPriority(right)
    if (leftSourceQuality !== rightSourceQuality) {
      return rightSourceQuality - leftSourceQuality
    }

    const leftBarcode = left.barcode?.trim() ? 1 : 0
    const rightBarcode = right.barcode?.trim() ? 1 : 0
    if (leftBarcode !== rightBarcode) {
      return rightBarcode - leftBarcode
    }

    const leftSource = getSourcePriority(left)
    const rightSource = getSourcePriority(right)
    if (leftSource !== rightSource) {
      return rightSource - leftSource
    }

    if ((left.stale ?? false) !== (right.stale ?? false)) {
      return Number(left.stale ?? false) - Number(right.stale ?? false)
    }

    const leftName = left.name.trim().toLowerCase()
    const rightName = right.name.trim().toLowerCase()
    if (leftName !== rightName) {
      return leftName.localeCompare(rightName)
    }

    const leftBrand = left.brand?.trim().toLowerCase() ?? ''
    const rightBrand = right.brand?.trim().toLowerCase() ?? ''
    if (leftBrand !== rightBrand) {
      return leftBrand.localeCompare(rightBrand)
    }

    if (normalizedQuery && left.id === right.id) {
      return 0
    }

    return left.id.localeCompare(right.id)
  })
}
