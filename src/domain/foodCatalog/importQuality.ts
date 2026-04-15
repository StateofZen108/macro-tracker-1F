import type {
  CatalogProvider,
  FoodImportConfidence,
  FoodSourceQuality,
  ImportTrust,
  ImportTrustBlockingIssue,
  NutritionBasis,
  ServingBasisSource,
} from '../../types.ts'

interface CatalogQualityInput {
  provider: CatalogProvider
  hasExplicitServing: boolean
  nutritionBasis: NutritionBasis
  servingBasisSource?: ServingBasisSource
  blockingIssues?: ImportTrustBlockingIssue[]
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
  importTrust: ImportTrust
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
  const blockingIssues = [...(input.blockingIssues ?? [])]

  if (
    (input.nutritionBasis === '100g' || input.nutritionBasis === '100ml') &&
    !blockingIssues.includes('per100_fallback')
  ) {
    blockingIssues.push('per100_fallback')
  }

  if (
    !input.hasExplicitServing &&
    input.nutritionBasis === 'serving' &&
    !blockingIssues.includes('estimated_serving')
  ) {
    blockingIssues.push('estimated_serving')
  }

  if (input.nutritionBasis === 'unknown' && !blockingIssues.includes('unknown_serving_basis')) {
    blockingIssues.push('unknown_serving_basis')
  }

  if (!hasCompleteMacros && !blockingIssues.includes('missing_macros')) {
    blockingIssues.push('missing_macros')
  }

  if (!hasCompleteMacros) {
    return {
      importConfidence: 'manual_review_required',
      sourceQuality: 'low',
      sourceQualityNote:
        'Macros are incomplete. Review this import before saving it locally.',
      importTrust: {
        level: 'blocked',
        servingBasis: input.nutritionBasis,
        servingBasisSource: input.servingBasisSource ?? 'manual_review',
        blockingIssues,
      },
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
      importTrust: {
        level: 'exact_review',
        servingBasis: input.nutritionBasis,
        servingBasisSource:
          input.servingBasisSource ??
          (input.nutritionBasis === '100ml'
            ? 'per100ml_fallback'
            : input.nutritionBasis === '100g'
              ? 'per100g_fallback'
              : 'provider_quantity'),
        blockingIssues,
      },
    }
  }

  return {
    importConfidence: 'direct_match',
    sourceQuality: hasBrand || hasBarcode ? 'high' : 'medium',
    sourceQualityNote:
      hasBrand || hasBarcode
        ? undefined
        : 'Nutrition is complete, but brand metadata is limited. Review if needed.',
    importTrust: {
      level: 'exact_autolog',
      servingBasis: input.nutritionBasis,
      servingBasisSource: input.servingBasisSource ?? 'provider_serving',
      blockingIssues,
    },
  }
}
