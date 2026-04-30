import type { AiMealCaptureEntry, AiMealCaptureResult, FoodTrustServingBasis } from '../types.js'

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function inferServingBasis(text: string): FoodTrustServingBasis {
  const normalized = text.toLowerCase()
  if (/\b(\d+(\.\d+)?)\s?(g|gram|grams|ml|millilitre|milliliter)\b/.test(normalized)) {
    return 'verified'
  }

  if (/\b(serving|portion|plate|bowl|cup|slice)\b/.test(normalized)) {
    return 'inferred'
  }

  return 'missing'
}

export function classifyAiMealCaptureResult(input: {
  imageEvidenceId: string
  textHint?: string
  entries: AiMealCaptureEntry[]
  reviewed?: boolean
  rejected?: boolean
  id?: string
}): AiMealCaptureResult {
  const hasInvalidEntry = input.entries.some(
    (entry) =>
      !entry.name.trim() ||
      entry.calories < 0 ||
      entry.protein < 0 ||
      entry.carbs < 0 ||
      entry.fat < 0 ||
      entry.servingBasis === 'missing' ||
      clampConfidence(entry.confidence) < 0.8,
  )

  return {
    id: input.id ?? `ai-meal-${input.imageEvidenceId}`,
    imageEvidenceId: input.imageEvidenceId,
    textHint: input.textHint,
    entries: input.entries.map((entry) => ({
      ...entry,
      confidence: clampConfidence(entry.confidence),
    })),
    status: input.rejected
      ? 'rejected'
      : input.reviewed && !hasInvalidEntry
        ? 'trusted_after_review'
        : 'review_required',
  }
}

export function buildDraftAiMealCapture(input: {
  imageEvidenceId: string
  textHint?: string
  fileName?: string
}): AiMealCaptureResult {
  const hint = input.textHint?.trim() || input.fileName?.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'Meal photo'
  const servingBasis = inferServingBasis(hint)

  return classifyAiMealCaptureResult({
    imageEvidenceId: input.imageEvidenceId,
    textHint: input.textHint,
    entries: [
      {
        name: hint,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        confidence: servingBasis === 'verified' ? 0.82 : 0.55,
        servingBasis,
      },
    ],
  })
}
