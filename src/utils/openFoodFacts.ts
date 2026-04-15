import { assessCatalogImportQuality } from '../domain/foodCatalog/importQuality.ts'
import { resolveProviderServingBasis } from '../domain/foodCatalog/servingBasis.ts'
import type { ActionResult, BarcodeLookupResult, ImportedFoodCandidate } from '../types.ts'

const MAIN_MACROS = ['calories', 'protein', 'carbs', 'fat'] as const

type MacroKey = (typeof MAIN_MACROS)[number]
type Nutriments = Record<string, unknown>

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
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

function pickFirstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseNumber(value)
    if (parsed !== undefined) {
      return parsed
    }
  }

  return undefined
}

function buildMacroDraft(nutriments: Nutriments): Partial<Record<MacroKey | 'fiber', number>> {
  return {
    calories: pickFirstNumber(nutriments['energy-kcal_serving']),
    protein: pickFirstNumber(nutriments.proteins_serving),
    carbs: pickFirstNumber(nutriments.carbohydrates_serving),
    fat: pickFirstNumber(nutriments.fat_serving),
    fiber: pickFirstNumber(nutriments.fiber_serving),
  }
}

function getPerHundredMacros(
  nutriments: Nutriments,
  unit: 'g' | 'ml',
): Partial<Record<MacroKey | 'fiber', number>> {
  if (unit === 'g') {
    return {
      calories: pickFirstNumber(nutriments['energy-kcal_100g'], nutriments['energy-kcal']),
      protein: pickFirstNumber(nutriments.proteins_100g),
      carbs: pickFirstNumber(nutriments.carbohydrates_100g),
      fat: pickFirstNumber(nutriments.fat_100g),
      fiber: pickFirstNumber(nutriments.fiber_100g),
    }
  }

  return {
    calories: pickFirstNumber(nutriments['energy-kcal_100ml']),
    protein: pickFirstNumber(nutriments.proteins_100ml),
    carbs: pickFirstNumber(nutriments.carbohydrates_100ml),
    fat: pickFirstNumber(nutriments.fat_100ml),
    fiber: pickFirstNumber(nutriments.fiber_100ml),
  }
}

function macrosAreComplete(values: Partial<Record<MacroKey, number>>): boolean {
  return MAIN_MACROS.every((key) => values[key] !== undefined)
}

function buildCandidate(product: Record<string, unknown>, barcode: string): ImportedFoodCandidate {
  const name =
    typeof product.product_name === 'string'
      ? product.product_name.trim()
      : typeof product.product_name_en === 'string'
        ? product.product_name_en.trim()
        : typeof product.generic_name === 'string'
          ? product.generic_name.trim()
          : ''

  if (!name) {
    throw new Error('This barcode did not include a usable product name.')
  }

  const brand =
    typeof product.brands === 'string' && product.brands.trim()
      ? product.brands.split(',')[0]?.trim()
      : undefined

  const nutriments = (product.nutriments ?? {}) as Nutriments
  const servingMacros = buildMacroDraft(nutriments)
  const perHundredGramMacros = getPerHundredMacros(nutriments, 'g')
  const perHundredMilliliterMacros = getPerHundredMacros(nutriments, 'ml')
  const hasCompleteServingMacros = macrosAreComplete(servingMacros as Partial<Record<MacroKey, number>>)
  const hasPerHundredGramFallback = macrosAreComplete(
    perHundredGramMacros as Partial<Record<MacroKey, number>>,
  )
  const hasPerHundredMilliliterFallback = macrosAreComplete(
    perHundredMilliliterMacros as Partial<Record<MacroKey, number>>,
  )
  const servingBasis =
    hasCompleteServingMacros
      ? resolveProviderServingBasis({
          servingSizeText: typeof product.serving_size === 'string' ? product.serving_size : undefined,
          servingQuantity: product.serving_quantity,
        })
      : resolveProviderServingBasis({
          hasPer100gFallback: hasPerHundredGramFallback,
          hasPer100mlFallback: hasPerHundredMilliliterFallback,
          servingSizeText:
            !hasPerHundredGramFallback && !hasPerHundredMilliliterFallback
              ? typeof product.serving_size === 'string'
                ? product.serving_size
                : undefined
              : undefined,
          servingQuantity:
            !hasPerHundredGramFallback && !hasPerHundredMilliliterFallback
              ? product.serving_quantity
              : undefined,
        })
  const macroDraft =
    servingBasis.nutritionBasis === '100g'
      ? { ...perHundredGramMacros }
      : servingBasis.nutritionBasis === '100ml'
        ? { ...perHundredMilliliterMacros }
        : { ...servingMacros }

  const quality = assessCatalogImportQuality({
    provider: 'open_food_facts',
    hasExplicitServing: servingBasis.nutritionBasis === 'serving',
    nutritionBasis: servingBasis.nutritionBasis,
    servingBasisSource: servingBasis.servingBasisSource,
    blockingIssues: servingBasis.blockingIssues,
    calories: macroDraft.calories,
    protein: macroDraft.protein,
    carbs: macroDraft.carbs,
    fat: macroDraft.fat,
    brand,
    barcode,
  })
  const verification: ImportedFoodCandidate['verification'] =
    quality.importTrust.level === 'exact_autolog' ? 'verified' : 'needsConfirmation'

  return {
    provider: 'open_food_facts',
    remoteKey: barcode,
    barcode,
    name,
    brand,
    servingSize: servingBasis.servingSize,
    servingUnit: servingBasis.servingUnit,
    calories: macroDraft.calories,
    protein: macroDraft.protein,
    carbs: macroDraft.carbs,
    fat: macroDraft.fat,
    fiber: macroDraft.fiber,
    source: 'api',
    verification,
    nutritionBasis: servingBasis.nutritionBasis,
    importTrust: {
      ...quality.importTrust,
      verifiedAt: new Date().toISOString(),
    },
    importConfidence: quality.importConfidence,
    sourceQuality: quality.sourceQuality,
    note: quality.sourceQualityNote ?? servingBasis.explanation,
  }
}

export async function fetchFoodByBarcode(barcode: string): Promise<ActionResult<BarcodeLookupResult>> {
  const normalizedBarcode = barcode.replace(/\D/g, '')
  if (normalizedBarcode.length < 8) {
    return fail('invalidBarcode', 'Enter a valid barcode with at least 8 digits.')
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return fail('offline', 'You appear to be offline. Reconnect and retry the barcode lookup.')
  }

  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${normalizedBarcode}.json`)
    if (!response.ok) {
      return fail('serviceUnavailable', 'Open Food Facts is unavailable right now. Please retry in a moment.')
    }

    const payload = (await response.json()) as {
      status?: number
      product?: Record<string, unknown>
    }

    if (payload.status !== 1 || !payload.product) {
      return fail('notFound', 'No product was found for that barcode.')
    }

    let candidate: ImportedFoodCandidate
    try {
      candidate = buildCandidate(payload.product, normalizedBarcode)
    } catch (error) {
      return fail(
        'invalidProduct',
        error instanceof Error
          ? error.message
          : 'This barcode returned product data that could not be imported safely.',
      )
    }

    return ok({
      candidate,
      missingFields: MAIN_MACROS.filter((field) => candidate[field] === undefined),
    })
  } catch (error) {
    if (error instanceof TypeError) {
      return fail('offline', 'The lookup failed due to a network problem. Check your connection and retry.')
    }

    return fail('serviceUnavailable', 'Open Food Facts is unavailable right now. Please retry in a moment.')
  }
}
