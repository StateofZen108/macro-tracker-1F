import { assessCatalogImportQuality } from '../domain/foodCatalog/importQuality'
import type { ActionResult, BarcodeLookupResult, ImportedFoodCandidate, NutritionBasis } from '../types'

const MAIN_MACROS = ['calories', 'protein', 'carbs', 'fat'] as const

type MacroKey = (typeof MAIN_MACROS)[number]
type Nutriments = Record<string, unknown>

interface ServingMetadata {
  servingSize: number
  servingUnit: string
  isExplicit: boolean
}

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

function normalizeUnit(unit: string | undefined): string {
  const normalized = unit?.trim().toLowerCase()

  if (!normalized) {
    return 'serving'
  }

  if (['gram', 'grams'].includes(normalized)) {
    return 'g'
  }

  if (['milliliter', 'milliliters'].includes(normalized)) {
    return 'ml'
  }

  return normalized
}

function parseServingMetadata(servingSize: string | undefined, servingQuantity: unknown): ServingMetadata {
  const text = servingSize?.trim()

  if (text) {
    const match = text.match(/([\d.,]+)\s*([a-zA-Z]+)/)
    if (match) {
      const size = parseNumber(match[1]) ?? 1
      return {
        servingSize: size,
        servingUnit: normalizeUnit(match[2]),
        isExplicit: true,
      }
    }
  }

  const quantity = parseNumber(servingQuantity)
  if (quantity !== undefined) {
    return {
      servingSize: quantity,
      servingUnit: 'g',
      isExplicit: false,
    }
  }

  return {
    servingSize: 1,
    servingUnit: 'serving',
    isExplicit: false,
  }
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

  const servingMeta = parseServingMetadata(
    typeof product.serving_size === 'string' ? product.serving_size : undefined,
    product.serving_quantity,
  )

  const nutriments = (product.nutriments ?? {}) as Nutriments
  const macroDraft = buildMacroDraft(nutriments)
  const perHundredGramMacros = getPerHundredMacros(nutriments, 'g')
  const perHundredMilliliterMacros = getPerHundredMacros(nutriments, 'ml')

  let note: string | undefined
  let nutritionBasis: NutritionBasis = servingMeta.isExplicit ? 'serving' : 'unknown'
  let verification: ImportedFoodCandidate['verification'] = servingMeta.isExplicit ? 'verified' : 'needsConfirmation'

  if (!macrosAreComplete(macroDraft as Partial<Record<MacroKey, number>>)) {
    if (macrosAreComplete(perHundredGramMacros as Partial<Record<MacroKey, number>>)) {
      servingMeta.servingSize = 100
      servingMeta.servingUnit = 'g'
      Object.assign(macroDraft, perHundredGramMacros)
      note = 'Using per 100g nutrition because serving data was incomplete.'
      nutritionBasis = '100g'
      verification = 'needsConfirmation'
    } else if (macrosAreComplete(perHundredMilliliterMacros as Partial<Record<MacroKey, number>>)) {
      servingMeta.servingSize = 100
      servingMeta.servingUnit = 'ml'
      Object.assign(macroDraft, perHundredMilliliterMacros)
      note = 'Using per 100ml nutrition because serving data was incomplete.'
      nutritionBasis = '100ml'
      verification = 'needsConfirmation'
    } else {
      note = 'Nutrition data is incomplete. Review and complete the imported values before saving.'
      verification = 'needsConfirmation'
      nutritionBasis = servingMeta.isExplicit ? 'serving' : 'unknown'
    }
  } else if (!servingMeta.isExplicit) {
    note = 'Serving size was estimated from product metadata. Confirm it before saving.'
    verification = 'needsConfirmation'
    nutritionBasis = 'unknown'
  }

  const quality = assessCatalogImportQuality({
    provider: 'open_food_facts',
    hasExplicitServing: servingMeta.isExplicit,
    nutritionBasis,
    calories: macroDraft.calories,
    protein: macroDraft.protein,
    carbs: macroDraft.carbs,
    fat: macroDraft.fat,
    brand,
    barcode,
  })

  if (quality.importConfidence !== 'direct_match') {
    verification = 'needsConfirmation'
  }

  return {
    provider: 'open_food_facts',
    barcode,
    name,
    brand,
    servingSize: servingMeta.servingSize,
    servingUnit: servingMeta.servingUnit,
    calories: macroDraft.calories,
    protein: macroDraft.protein,
    carbs: macroDraft.carbs,
    fat: macroDraft.fat,
    fiber: macroDraft.fiber,
    source: 'api',
    verification,
    nutritionBasis,
    importConfidence: quality.importConfidence,
    sourceQuality: quality.sourceQuality,
    note: note ?? quality.sourceQualityNote,
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
