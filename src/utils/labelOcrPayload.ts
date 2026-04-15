import type { LabelOcrFieldCandidate, LabelOcrReviewSession } from '../types.js'

export interface LabelOcrExtractResponse {
  session?: unknown
  candidate?: unknown
  fields?: unknown
  warnings?: unknown
  message?: unknown
  error?: {
    code?: string
    message?: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isLabelOcrFieldCandidate(value: unknown): value is LabelOcrFieldCandidate {
  return (
    isRecord(value) &&
    typeof value.rawLabel === 'string' &&
    (value.value === 'traces' || typeof value.value === 'number') &&
    typeof value.unit === 'string' &&
    typeof value.sourceText === 'string' &&
    typeof value.confidence === 'number'
  )
}

export function isLabelOcrReviewSession(value: unknown): value is LabelOcrReviewSession {
  return (
    isRecord(value) &&
    isRecord(value.foodDraft) &&
    Array.isArray(value.fieldCandidates) &&
    value.fieldCandidates.every(isLabelOcrFieldCandidate) &&
    Array.isArray(value.unmappedFields) &&
    value.unmappedFields.every(isLabelOcrFieldCandidate) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((entry) => typeof entry === 'string') &&
    typeof value.requiresReview === 'boolean' &&
    value.provider === 'gemini'
  )
}

function buildFieldCandidate(
  normalizedKey: LabelOcrFieldCandidate['normalizedKey'],
  rawLabel: string,
  value: number | undefined,
  unit: string,
  sourceText: string | undefined,
  confidence = 0.6,
): LabelOcrFieldCandidate | null {
  if (value === undefined) {
    return null
  }

  return {
    normalizedKey,
    rawLabel,
    value,
    unit,
    sourceText: sourceText ?? `${value} ${unit}`.trim(),
    confidence,
  }
}

export function buildSessionFromProviderPayload(
  payload: LabelOcrExtractResponse,
): LabelOcrReviewSession | null {
  if (!isRecord(payload.candidate) || !isRecord(payload.fields)) {
    return null
  }

  const candidate = payload.candidate
  const fields = payload.fields
  const servingSizeText = isRecord(fields.servingSizeText)
    ? readString(fields.servingSizeText.value)
    : undefined

  const fieldCandidates = [
    buildFieldCandidate(
      'calories',
      'Calories',
      readNumber(isRecord(fields.calories) ? fields.calories.value : undefined),
      'kcal',
      readString(isRecord(fields.calories) ? fields.calories.sourceText : undefined),
    ),
    buildFieldCandidate(
      'protein',
      'Protein',
      readNumber(isRecord(fields.protein) ? fields.protein.value : undefined),
      'g',
      readString(isRecord(fields.protein) ? fields.protein.sourceText : undefined),
    ),
    buildFieldCandidate(
      'carbs',
      'Carbs',
      readNumber(isRecord(fields.carbs) ? fields.carbs.value : undefined),
      'g',
      readString(isRecord(fields.carbs) ? fields.carbs.sourceText : undefined),
    ),
    buildFieldCandidate(
      'fat',
      'Fat',
      readNumber(isRecord(fields.fat) ? fields.fat.value : undefined),
      'g',
      readString(isRecord(fields.fat) ? fields.fat.sourceText : undefined),
    ),
    buildFieldCandidate(
      'fiber',
      'Fiber',
      readNumber(isRecord(fields.fiber) ? fields.fiber.value : undefined),
      'g',
      readString(isRecord(fields.fiber) ? fields.fiber.sourceText : undefined),
    ),
    buildFieldCandidate(
      'sugars',
      'Sugars',
      readNumber(isRecord(fields.sugar) ? fields.sugar.value : undefined),
      'g',
      readString(isRecord(fields.sugar) ? fields.sugar.sourceText : undefined),
    ),
    buildFieldCandidate(
      'sodium',
      'Sodium',
      readNumber(isRecord(fields.sodium) ? fields.sodium.value : undefined),
      'mg',
      readString(isRecord(fields.sodium) ? fields.sodium.sourceText : undefined),
    ),
  ].filter((field): field is LabelOcrFieldCandidate => field !== null)

  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.flatMap((warning) =>
        isRecord(warning) && typeof warning.message === 'string' ? [warning.message] : [],
      )
    : []

  if (typeof payload.message === 'string' && payload.message.trim()) {
    warnings.push(payload.message.trim())
  }

  return {
    provider: 'gemini',
    requiresReview: true,
    warnings,
    fieldCandidates,
    unmappedFields: [],
    servingSizeText,
    servingsPerContainer:
      readNumber(candidate.servingsPerContainer) ??
      readNumber(isRecord(fields.servingsPerContainer) ? fields.servingsPerContainer.value : undefined),
    caloriesPerContainer:
      readNumber(candidate.caloriesPerContainer) ??
      readNumber(isRecord(fields.caloriesPerContainer) ? fields.caloriesPerContainer.value : undefined),
    foodDraft: {
      name: readString(candidate.name) ?? 'Label-scanned food',
      brand: readString(candidate.brand),
      servingSize: readNumber(candidate.servingSize) ?? 1,
      servingUnit: readString(candidate.servingUnit) ?? 'serving',
      calories:
        readNumber(candidate.calories) ??
        readNumber(isRecord(fields.calories) ? fields.calories.value : undefined) ??
        0,
      protein:
        readNumber(candidate.protein) ??
        readNumber(isRecord(fields.protein) ? fields.protein.value : undefined) ??
        0,
      carbs:
        readNumber(candidate.carbs) ??
        readNumber(isRecord(fields.carbs) ? fields.carbs.value : undefined) ??
        0,
      fat:
        readNumber(candidate.fat) ??
        readNumber(isRecord(fields.fat) ? fields.fat.value : undefined) ??
        0,
      fiber:
        readNumber(candidate.fiber) ??
        readNumber(isRecord(fields.fiber) ? fields.fiber.value : undefined),
      sugars: readNumber(isRecord(fields.sugar) ? fields.sugar.value : undefined),
      sodium: readNumber(isRecord(fields.sodium) ? fields.sodium.value : undefined),
      labelNutrition: fieldCandidates.length
        ? {
            fields: fieldCandidates.map((field) => ({
              normalizedKey: field.normalizedKey,
              rawLabel: field.rawLabel,
              value: field.value,
              unit: field.unit,
            })),
            servingSizeText,
            locale: 'unknown',
            source: 'label_ocr',
            reviewedAt: new Date().toISOString(),
          }
        : undefined,
      source: 'api',
    },
  }
}
