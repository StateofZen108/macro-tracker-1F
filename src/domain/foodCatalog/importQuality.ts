import type {
  CatalogProvider,
  FoodImportConfidence,
  FoodSourceQuality,
  NutritionBasis,
} from '../../types'

interface CatalogQualityInput {
  provider: CatalogProvider
  hasExplicitServing: boolean
  nutritionBasis: NutritionBasis
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  brand?: string
  barcode?: string
}

interface CatalogQualityAssessment {
  importConfidence: FoodImportConfidence
  sourceQuality: FoodSourceQuality
  sourceQualityNote?: string
}

function hasFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function assessCatalogImportQuality(
  input: CatalogQualityInput,
): CatalogQualityAssessment {
  const hasCompleteMacros =
    hasFiniteNumber(input.calories) &&
    hasFiniteNumber(input.protein) &&
    hasFiniteNumber(input.carbs) &&
    hasFiniteNumber(input.fat)
  const hasBrand = typeof input.brand === 'string' && input.brand.trim().length > 0
  const hasBarcode = typeof input.barcode === 'string' && input.barcode.trim().length >= 8

  if (!hasCompleteMacros) {
    return {
      importConfidence: 'manual_review_required',
      sourceQuality: 'low',
      sourceQualityNote:
        'Macros are incomplete. Review this import before saving it locally.',
    }
  }

  if (!input.hasExplicitServing || input.nutritionBasis === '100g' || input.nutritionBasis === '100ml') {
    return {
      importConfidence: 'weak_match',
      sourceQuality: hasBrand || hasBarcode ? 'medium' : 'low',
      sourceQualityNote:
        input.nutritionBasis === '100ml'
          ? 'Using per 100ml nutrition because serving data was incomplete.'
          : input.nutritionBasis === '100g'
            ? 'Using per 100g nutrition because serving data was incomplete.'
            : 'Serving size was estimated from provider data. Confirm it before saving.',
    }
  }

  return {
    importConfidence: 'direct_match',
    sourceQuality: hasBrand || hasBarcode ? 'high' : 'medium',
    sourceQualityNote:
      hasBrand || hasBarcode
        ? undefined
        : 'Nutrition is complete, but brand metadata is limited. Review if needed.',
  }
}

