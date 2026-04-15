import type {
  ImportTrustBlockingIssue,
  NutritionBasis,
  ServingBasisSource,
} from '../../types.ts'

export interface ServingBasisResolution {
  servingSize: number
  servingUnit: string
  nutritionBasis: NutritionBasis
  servingBasisSource: ServingBasisSource
  blockingIssues: ImportTrustBlockingIssue[]
  safeForAutolog: boolean
  explanation: string
}

export interface ProviderServingBasisInput {
  servingSizeText?: string
  servingQuantity?: unknown
  hasPer100gFallback?: boolean
  hasPer100mlFallback?: boolean
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = Number.parseFloat(value.replace(',', '.'))
    if (Number.isFinite(normalized)) {
      return normalized
    }
  }

  return undefined
}

export function normalizeMetricUnit(unit: string | undefined): 'g' | 'ml' | null {
  const normalized = unit?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') {
    return 'g'
  }

  if (
    normalized === 'ml' ||
    normalized === 'milliliter' ||
    normalized === 'milliliters' ||
    normalized === 'millilitre' ||
    normalized === 'millilitres'
  ) {
    return 'ml'
  }

  return null
}

export function parseMetricServingText(
  text: string | undefined,
): { servingSize: number; servingUnit: 'g' | 'ml'; source: ServingBasisSource } | null {
  if (!text?.trim()) {
    return null
  }

  const trimmed = text.trim()
  const parentheticalMatches = [...trimmed.matchAll(/\(([^)]*)\)/g)]
  for (const match of parentheticalMatches) {
    const nested = parseMetricServingText(match[1])
    if (nested) {
      return {
        ...nested,
        source: 'label_parenthetical_metric',
      }
    }
  }

  const directMatch = trimmed.match(/\b(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i)
  if (!directMatch) {
    return null
  }

  const servingSize = parseNumber(directMatch[1])
  const servingUnit = normalizeMetricUnit(directMatch[2])
  if (servingSize === undefined || servingSize <= 0 || !servingUnit) {
    return null
  }

  return {
    servingSize,
    servingUnit,
    source: 'label_metric',
  }
}

export function resolveProviderServingBasis(
  input: ProviderServingBasisInput,
): ServingBasisResolution {
  const parsedMetric = parseMetricServingText(input.servingSizeText)
  if (parsedMetric) {
    return {
      servingSize: parsedMetric.servingSize,
      servingUnit: parsedMetric.servingUnit,
      nutritionBasis: 'serving',
      servingBasisSource:
        parsedMetric.source === 'label_parenthetical_metric'
          ? 'label_parenthetical_metric'
          : 'provider_serving',
      blockingIssues: [],
      safeForAutolog: true,
      explanation: `Using label/provider serving: ${parsedMetric.servingSize} ${parsedMetric.servingUnit}.`,
    }
  }

  const quantity = parseNumber(input.servingQuantity)
  if (quantity !== undefined && quantity > 0) {
    return {
      servingSize: quantity,
      servingUnit: 'serving',
      nutritionBasis: 'unknown',
      servingBasisSource: 'provider_quantity',
      blockingIssues: ['estimated_serving', 'unknown_serving_basis'],
      safeForAutolog: false,
      explanation: 'Serving size was estimated from provider data. Confirm it before saving.',
    }
  }

  if (input.hasPer100gFallback) {
    return {
      servingSize: 100,
      servingUnit: 'g',
      nutritionBasis: '100g',
      servingBasisSource: 'per100g_fallback',
      blockingIssues: ['per100_fallback'],
      safeForAutolog: false,
      explanation: 'Using per 100g nutrition because serving data was incomplete.',
    }
  }

  if (input.hasPer100mlFallback) {
    return {
      servingSize: 100,
      servingUnit: 'ml',
      nutritionBasis: '100ml',
      servingBasisSource: 'per100ml_fallback',
      blockingIssues: ['per100_fallback'],
      safeForAutolog: false,
      explanation: 'Using per 100ml nutrition because serving data was incomplete.',
    }
  }

  return {
    servingSize: 1,
    servingUnit: 'serving',
    nutritionBasis: 'unknown',
    servingBasisSource: 'manual_review',
    blockingIssues: ['unknown_serving_basis'],
    safeForAutolog: false,
    explanation: 'Serving basis could not be resolved. Enter a serving size before saving.',
  }
}
