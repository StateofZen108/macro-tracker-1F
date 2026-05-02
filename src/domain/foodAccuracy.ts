import type {
  Food,
  FoodAccuracyIssue,
  FoodEvidenceSource,
  FoodFieldEvidence,
  FoodSnapshot,
  FoodTrustEvidence,
} from '../types'

type FoodAccuracyInput = {
  food?: Pick<
    Food,
    | 'source'
    | 'provider'
    | 'barcode'
    | 'servingSize'
    | 'servingUnit'
    | 'calories'
    | 'protein'
    | 'carbs'
    | 'fat'
    | 'importTrust'
    | 'labelNutrition'
  >
  snapshot?: FoodSnapshot
  source?: FoodTrustEvidence['source']
  confidence?: number
  reviewedAt?: string
}

const MACRO_FIELDS = ['calories', 'protein', 'carbs', 'fat'] as const

function clampConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.85
  }

  return Math.max(0, Math.min(1, value))
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '')
}

function issue(input: Omit<FoodAccuracyIssue, 'blocksCoachingProof'> & { blocksCoachingProof?: boolean }): FoodAccuracyIssue {
  return {
    ...input,
    blocksCoachingProof: input.blocksCoachingProof ?? input.severity !== 'info',
  }
}

function inferFieldSource(input: FoodAccuracyInput): FoodEvidenceSource {
  if (input.reviewedAt) {
    return 'user_review'
  }

  if (input.source === 'barcode' || input.food?.barcode || input.snapshot?.barcode) {
    return 'barcode'
  }

  if (input.source === 'ocr' || input.food?.labelNutrition) {
    return 'ocr'
  }

  if (input.source === 'import' || input.food?.importTrust) {
    return 'import'
  }

  if (input.source === 'catalog' || input.food?.provider) {
    return 'catalog'
  }

  return input.source === 'custom' ? 'custom' : 'system'
}

export function buildFoodFieldEvidence(input: FoodAccuracyInput): FoodFieldEvidence[] {
  const foodLike = input.food ?? input.snapshot
  if (!foodLike) {
    return []
  }

  const source = inferFieldSource(input)
  const confidence = clampConfidence(input.confidence)
  const reviewedAt = input.reviewedAt ?? input.food?.labelNutrition?.reviewedAt
  const fields: FoodFieldEvidence[] = [
    ...MACRO_FIELDS.map((field) => ({
      field,
      value: foodLike[field],
      source,
      confidence,
      reviewedAt,
    })),
    {
      field: 'servingSize',
      value: foodLike.servingSize,
      source,
      confidence,
      reviewedAt,
    },
    {
      field: 'servingUnit',
      value: foodLike.servingUnit,
      source,
      confidence,
      reviewedAt,
    },
  ]

  if (foodLike.barcode) {
    fields.push({
      field: 'barcode',
      value: foodLike.barcode,
      source: 'barcode',
      confidence,
      reviewedAt,
    })
  }

  return fields
}

export function validateFoodAccuracy(input: FoodAccuracyInput): FoodAccuracyIssue[] {
  const foodLike = input.food ?? input.snapshot
  const issues: FoodAccuracyIssue[] = []
  const confidence = clampConfidence(input.confidence)

  if (!foodLike) {
    return [
      issue({
        code: 'missing_macros',
        severity: 'block',
        message: 'No food payload was available to validate.',
      }),
    ]
  }

  for (const field of MACRO_FIELDS) {
    const value = foodLike[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(
        issue({
          code: 'missing_macros',
          severity: 'block',
          field,
          message: `${field} is missing or unreadable.`,
        }),
      )
      continue
    }

    if (value < 0) {
      issues.push(
        issue({
          code: 'impossible_value',
          severity: 'block',
          field,
          message: `${field} cannot be negative.`,
          actual: formatNumber(value),
        }),
      )
    }
  }

  if (
    !Number.isFinite(foodLike.servingSize) ||
    foodLike.servingSize <= 0 ||
    !foodLike.servingUnit.trim() ||
    foodLike.servingUnit.trim().toLowerCase() === 'unknown'
  ) {
    issues.push(
      issue({
        code: 'missing_serving_basis',
        severity: 'block',
        field: 'servingSize',
        message: 'Serving size and unit must be verified before this food can support coaching proof.',
      }),
    )
  }

  const macroEnergy = foodLike.protein * 4 + foodLike.carbs * 4 + foodLike.fat * 9
  if (
    Number.isFinite(foodLike.calories) &&
    Number.isFinite(macroEnergy) &&
    macroEnergy > 0
  ) {
    const tolerance = Math.max(25, foodLike.calories * 0.2)
    if (Math.abs(foodLike.calories - macroEnergy) > tolerance) {
      issues.push(
        issue({
          code: 'macro_energy_mismatch',
          severity: input.reviewedAt ? 'info' : 'review',
          field: 'calories',
          message: 'Calories do not reconcile with protein, carbs, and fat.',
          expected: `${formatNumber(macroEnergy)} kcal from macros`,
          actual: `${formatNumber(foodLike.calories)} kcal logged`,
          blocksCoachingProof: !input.reviewedAt,
        }),
      )
    }
  }

  const unit = foodLike.servingUnit.trim().toLowerCase()
  if (
    Number.isFinite(foodLike.servingSize) &&
    foodLike.servingSize > 0 &&
    (unit === 'g' || unit === 'gram' || unit === 'grams' || unit === 'ml' || unit === 'milliliter' || unit === 'milliliters')
  ) {
    const caloriesPer100 = (foodLike.calories / foodLike.servingSize) * 100
    if (Number.isFinite(caloriesPer100) && caloriesPer100 > 950) {
      issues.push(
        issue({
          code: 'suspicious_density',
          severity: input.reviewedAt ? 'info' : 'review',
          field: 'calories',
          message: 'Calories per 100g/ml look unusually high for a food label.',
          actual: `${formatNumber(caloriesPer100)} kcal per 100${unit.startsWith('ml') ? 'ml' : 'g'}`,
          blocksCoachingProof: !input.reviewedAt,
        }),
      )
    }
  }

  if (input.food?.importTrust?.blockingIssues.includes('provider_conflict')) {
    issues.push(
      issue({
        code: 'provider_conflict',
        severity: input.reviewedAt ? 'info' : 'review',
        message: 'Provider macros conflict and need a human-confirmed value.',
        blocksCoachingProof: !input.reviewedAt,
      }),
    )
  }

  if (confidence < 0.8) {
    issues.push(
      issue({
        code: 'low_confidence',
        severity: input.reviewedAt ? 'info' : 'review',
        message: 'Source confidence is below the coaching-grade threshold.',
        actual: `${Math.round(confidence * 100)}% confidence`,
        blocksCoachingProof: !input.reviewedAt,
      }),
    )
  }

  if (input.food?.labelNutrition && !input.food.labelNutrition.reviewedAt && input.source === 'ocr') {
    issues.push(
      issue({
        code: 'ocr_serving_mismatch',
        severity: 'review',
        message: 'OCR label fields include low-confidence source text and need review.',
      }),
    )
  }

  return issues
}
