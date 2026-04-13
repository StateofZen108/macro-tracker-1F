import type { LabelReviewValues, LabelReviewWarning } from '../components/LabelReviewSheet'
import type {
  FoodDraft,
  LabelOcrReviewSession,
  LabelNutritionPanel,
} from '../types'

const ORIGINAL_SERVING_WARNING =
  'No gram or ml serving size was found on this label, so the food will stay on its original serving basis unless you edit it.'

export interface OcrServingResolution {
  servingSize: number
  servingUnit: string
  source: 'labelTextMetric' | 'metricDraft' | 'per100Metric' | 'originalServing'
  warningMessage?: string
}

function formatDraftNumber(value: number | undefined): string {
  return value === undefined ? '' : `${value}`
}

function parseRequiredNumber(label: string, value: string, minimum = 0): number {
  const parsedValue = Number.parseFloat(value)
  if (!Number.isFinite(parsedValue) || parsedValue < minimum) {
    throw new Error(`${label} must be ${minimum === 0 ? 'a valid number' : `at least ${minimum}`}.`)
  }

  return parsedValue
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  const parsedValue = Number.parseFloat(value)
  return Number.isFinite(parsedValue) ? parsedValue : undefined
}

function normalizeMetricUnit(value: string | undefined): 'g' | 'ml' | null {
  const normalized = value?.trim().toLowerCase()
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

function parseMetricAmount(text: string | undefined): { servingSize: number; servingUnit: 'g' | 'ml' } | null {
  if (!text?.trim()) {
    return null
  }

  const value = text.trim()
  const parenthesizedMatches = [...value.matchAll(/\(([^)]*)\)/g)]
  for (const match of parenthesizedMatches) {
    const nestedAmount = parseMetricAmount(match[1])
    if (nestedAmount) {
      return nestedAmount
    }
  }

  const directMatch = value.match(/\b(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i)
  if (!directMatch) {
    return null
  }

  const parsedSize = Number.parseFloat(directMatch[1].replace(',', '.'))
  const servingUnit = normalizeMetricUnit(directMatch[2])
  if (!Number.isFinite(parsedSize) || parsedSize <= 0 || !servingUnit) {
    return null
  }

  return {
    servingSize: parsedSize,
    servingUnit,
  }
}

function getOriginalServingText(panel: LabelNutritionPanel | undefined): string | undefined {
  const originalText = panel?.servingSizeText?.trim()
  return originalText ? originalText : undefined
}

function sameServingBasis(
  values: LabelReviewValues,
  servingSize: number,
  servingUnit: string,
): boolean {
  const parsedSize = Number.parseFloat(values.servingSize)
  if (!Number.isFinite(parsedSize)) {
    return false
  }

  return (
    Math.abs(parsedSize - servingSize) < 0.0001 &&
    values.servingUnit.trim().toLowerCase() === servingUnit.trim().toLowerCase()
  )
}

function buildBaseWarnings(session: LabelOcrReviewSession): LabelReviewWarning[] {
  return session.warnings.map((warning, index) => ({
    id: `ocr-warning-${index + 1}`,
    severity: warning.toLowerCase().includes('missing') ? 'warning' : 'info',
    message: warning,
  }))
}

function getFieldNumber(
  session: LabelOcrReviewSession,
  normalizedKey: 'sugars' | 'salt' | 'sodium',
): number | undefined {
  const matchedField = session.fieldCandidates.find(
    (field) => field.normalizedKey === normalizedKey && typeof field.value === 'number',
  )

  return matchedField && typeof matchedField.value === 'number' ? matchedField.value : undefined
}

export function resolveOcrServingBasis(session: LabelOcrReviewSession): OcrServingResolution {
  const originalServingSize = session.foodDraft.servingSize
  const originalServingUnit = session.foodDraft.servingUnit.trim() || 'serving'
  const originalServingText = getOriginalServingText(session.foodDraft.labelNutrition)
  const normalizedDraftUnit = normalizeMetricUnit(originalServingUnit)
  if (normalizedDraftUnit && Number.isFinite(originalServingSize) && originalServingSize > 0) {
    return {
      servingSize: originalServingSize,
      servingUnit: normalizedDraftUnit,
      source: originalServingSize === 100 && !originalServingText ? 'per100Metric' : 'metricDraft',
    }
  }

  const metricFromLabel = parseMetricAmount(originalServingText)
  if (metricFromLabel) {
    return {
      ...metricFromLabel,
      source: 'labelTextMetric',
    }
  }

  return {
    servingSize: originalServingSize,
    servingUnit: originalServingUnit,
    source: 'originalServing',
    warningMessage: ORIGINAL_SERVING_WARNING,
  }
}

export function buildLabelReviewValues(session: LabelOcrReviewSession): LabelReviewValues {
  const servingResolution = resolveOcrServingBasis(session)

  return {
    name: session.foodDraft.name,
    brand: session.foodDraft.brand ?? '',
    servingSize: formatDraftNumber(servingResolution.servingSize),
    servingUnit: servingResolution.servingUnit,
    calories: formatDraftNumber(session.foodDraft.calories),
    protein: formatDraftNumber(session.foodDraft.protein),
    carbs: formatDraftNumber(session.foodDraft.carbs),
    fat: formatDraftNumber(session.foodDraft.fat),
    fiber: formatDraftNumber(session.foodDraft.fiber),
    barcode: session.foodDraft.barcode ?? '',
  }
}

export function buildLabelReviewWarnings(
  session: LabelOcrReviewSession,
  values: LabelReviewValues,
): LabelReviewWarning[] {
  const warnings = buildBaseWarnings(session)
  const servingResolution = resolveOcrServingBasis(session)

  if (
    servingResolution.source === 'originalServing' &&
    sameServingBasis(values, session.foodDraft.servingSize, session.foodDraft.servingUnit) &&
    !warnings.some((warning) => warning.message === servingResolution.warningMessage)
  ) {
    warnings.push({
      id: 'ocr-warning-original-serving',
      severity: 'warning',
      message: servingResolution.warningMessage ?? ORIGINAL_SERVING_WARNING,
      field: 'servingUnit',
    })
  }

  return warnings
}

export function buildOcrDraftFromReview(
  values: LabelReviewValues,
  session: LabelOcrReviewSession,
): FoodDraft {
  const servingSize = parseRequiredNumber('Serving size', values.servingSize, 0.01)
  const calories = parseRequiredNumber('Calories', values.calories)
  const protein = parseRequiredNumber('Protein', values.protein)
  const carbs = parseRequiredNumber('Carbs', values.carbs)
  const fat = parseRequiredNumber('Fat', values.fat)
  const fiber = parseOptionalNumber(values.fiber)
  const reviewedValues = new Map([
    ['calories', calories],
    ['protein', protein],
    ['carbs', carbs],
    ['fat', fat],
    ...(fiber !== undefined ? ([['fiber', fiber]] as const) : []),
  ])
  const originalServingText = getOriginalServingText(session.foodDraft.labelNutrition)

  return {
    name: values.name.trim(),
    brand: values.brand.trim() || undefined,
    servingSize,
    servingUnit: values.servingUnit.trim(),
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugars: getFieldNumber(session, 'sugars'),
    salt: getFieldNumber(session, 'salt'),
    sodium: getFieldNumber(session, 'sodium'),
    labelNutrition: {
      fields: [...session.fieldCandidates, ...session.unmappedFields].map((field) => ({
        normalizedKey: field.normalizedKey,
        rawLabel: field.rawLabel,
        value:
          field.normalizedKey && reviewedValues.has(field.normalizedKey)
            ? reviewedValues.get(field.normalizedKey) ?? field.value
            : field.value,
        unit: field.unit,
      })),
      servingSizeText: originalServingText ?? `${values.servingSize.trim()} ${values.servingUnit.trim()}`.trim(),
      locale: session.foodDraft.labelNutrition?.locale ?? 'unknown',
      source: 'label_ocr',
      reviewedAt: new Date().toISOString(),
    },
    barcode: values.barcode.trim() || undefined,
    source: session.foodDraft.source,
  }
}
