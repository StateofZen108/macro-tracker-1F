import type { BarcodeLookupResult, Food } from '../../types'
import type { AddFoodRemoteStatus } from './types'

interface ServingMetaInput {
  brand?: string
  servingSize?: number
  servingUnit?: string
}

interface MacroSummaryInput {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatServingsLabel(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}`
  }

  return `${Math.round(value * 100) / 100}`
}

export function formatServingMeta({ brand, servingSize, servingUnit }: ServingMetaInput): string {
  const parts: string[] = []
  if (brand?.trim()) {
    parts.push(brand.trim())
  }

  if (isFiniteNumber(servingSize) && servingUnit?.trim()) {
    parts.push(`${servingSize}${servingUnit.trim()}`)
  } else if (isFiniteNumber(servingSize)) {
    parts.push(`${servingSize}`)
  } else if (servingUnit?.trim()) {
    parts.push(servingUnit.trim())
  }

  return parts.join(' - ')
}

export function formatMacroSummary({
  calories,
  protein,
  carbs,
  fat,
}: MacroSummaryInput): string | null {
  if (
    !isFiniteNumber(calories) ||
    !isFiniteNumber(protein) ||
    !isFiniteNumber(carbs) ||
    !isFiniteNumber(fat)
  ) {
    return null
  }

  return `${Math.round(calories)} cal | ${Math.round(protein)}P | ${Math.round(carbs)}C | ${Math.round(fat)}F`
}

export function describeFood(food: Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat'>): string {
  return formatMacroSummary(food) ?? 'Nutrition unavailable'
}

export function buildLookupMessage(result: BarcodeLookupResult): string {
  const summary = formatMacroSummary(result.candidate)
  if (summary) {
    return `Imported ${summary}.`
  }

  return `Imported with missing fields: ${result.missingFields.join(', ')}.`
}

export function getRemoteCatalogStatusLabel(
  remoteStatus: AddFoodRemoteStatus,
  remoteLoadingMore: boolean,
): string {
  if (remoteLoadingMore) {
    return 'Loading more...'
  }

  if (remoteStatus === 'loading') {
    return 'Searching...'
  }

  return 'Open Food Facts'
}

export function getCatalogProviderLabel(provider: 'open_food_facts' | undefined): string {
  if (provider === 'open_food_facts') {
    return 'OFF'
  }

  return 'Catalog'
}

export function getImportConfidenceLabel(
  value: 'direct_match' | 'weak_match' | 'manual_review_required' | undefined,
): string {
  if (value === 'manual_review_required') {
    return 'review required'
  }

  if (value === 'weak_match') {
    return 'needs review'
  }

  return 'direct import'
}

export function getSourceQualityLabel(
  value: 'high' | 'medium' | 'low' | undefined,
): string {
  if (value === 'low') {
    return 'low confidence'
  }

  if (value === 'medium') {
    return 'medium confidence'
  }

  return 'high confidence'
}

export function getCatalogImportButtonLabel(
  value: 'direct_match' | 'weak_match' | 'manual_review_required' | undefined,
  addAfterImport: boolean,
): string {
  if (value === 'weak_match' || value === 'manual_review_required') {
    return addAfterImport ? 'Review and add 1x' : 'Review before saving'
  }

  return addAfterImport ? 'Import and add 1x' : 'Save locally'
}
