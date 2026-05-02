import type { ActionResult, FoodAccuracyIssue, FoodFieldEvidence, FoodTrustEvidence } from '../../types'

const STORAGE_KEY = 'mt_food_trust_evidence'

type Listener = () => void

let cache: FoodTrustEvidence[] | null = null
const listeners = new Set<Listener>()

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

function canUseStorage(): boolean {
  return typeof globalThis.localStorage !== 'undefined'
}

function getStorage(): Storage | null {
  return canUseStorage() ? globalThis.localStorage : null
}

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function isEvidenceSource(value: unknown): value is FoodTrustEvidence['source'] {
  return (
    value === 'barcode' ||
    value === 'ocr' ||
    value === 'catalog' ||
    value === 'custom' ||
    value === 'import' ||
    value === 'ai_photo'
  )
}

function isEvidenceStatus(value: unknown): value is FoodTrustEvidence['status'] {
  return value === 'trusted' || value === 'review_required' || value === 'blocked'
}

function isServingBasis(value: unknown): value is FoodTrustEvidence['servingBasis'] {
  return value === 'verified' || value === 'inferred' || value === 'missing'
}

function isMacroCompleteness(value: unknown): value is FoodTrustEvidence['macroCompleteness'] {
  return value === 'complete' || value === 'partial' || value === 'missing'
}

function normalizeEvidence(rawValue: unknown): FoodTrustEvidence | null {
  if (typeof rawValue !== 'object' || rawValue === null || Array.isArray(rawValue)) {
    return null
  }

  const raw = rawValue as Record<string, unknown>
  const sourceId = typeof raw.sourceId === 'string' && raw.sourceId.trim() ? raw.sourceId.trim() : null
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, raw.confidence))
    : null

  if (
    !sourceId ||
    !isEvidenceSource(raw.source) ||
    !isEvidenceStatus(raw.status) ||
    confidence === null ||
    !isServingBasis(raw.servingBasis) ||
    !isMacroCompleteness(raw.macroCompleteness)
  ) {
    return null
  }

  const fieldEvidence = Array.isArray(raw.fieldEvidence)
    ? raw.fieldEvidence
        .map((entry) => {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            return null
          }
          const field = (entry as Record<string, unknown>).field
          const source = (entry as Record<string, unknown>).source
          const value = (entry as Record<string, unknown>).value
          const fieldConfidence = (entry as Record<string, unknown>).confidence
          if (
            !['calories', 'protein', 'carbs', 'fat', 'servingSize', 'servingUnit', 'barcode'].includes(`${field}`) ||
            !['barcode', 'catalog', 'ocr', 'custom', 'import', 'user_review', 'system'].includes(`${source}`) ||
            !(typeof value === 'string' || typeof value === 'number') ||
            typeof fieldConfidence !== 'number' ||
            !Number.isFinite(fieldConfidence)
          ) {
            return null
          }

          const normalized: FoodFieldEvidence = {
            field: field as NonNullable<FoodTrustEvidence['fieldEvidence']>[number]['field'],
            value,
            source: source as NonNullable<FoodTrustEvidence['fieldEvidence']>[number]['source'],
            confidence: Math.max(0, Math.min(1, fieldConfidence)),
          }
          const reviewedAt = (entry as Record<string, unknown>).reviewedAt
          if (typeof reviewedAt === 'string' && reviewedAt.trim()) {
            normalized.reviewedAt = reviewedAt
          }
          return normalized
        })
        .filter((entry): entry is NonNullable<FoodTrustEvidence['fieldEvidence']>[number] => entry !== null)
    : undefined
  const accuracyIssues = Array.isArray(raw.accuracyIssues)
    ? raw.accuracyIssues
        .map((entry) => {
          if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            return null
          }
          const issue = entry as Record<string, unknown>
          if (
            ![
              'missing_macros',
              'missing_serving_basis',
              'macro_energy_mismatch',
              'impossible_value',
              'suspicious_density',
              'provider_conflict',
              'low_confidence',
              'ocr_serving_mismatch',
            ].includes(`${issue.code}`) ||
            !['info', 'review', 'block'].includes(`${issue.severity}`) ||
            typeof issue.message !== 'string'
          ) {
            return null
          }

          const normalized: FoodAccuracyIssue = {
            code: issue.code as NonNullable<FoodTrustEvidence['accuracyIssues']>[number]['code'],
            severity: issue.severity as NonNullable<FoodTrustEvidence['accuracyIssues']>[number]['severity'],
            message: issue.message,
            blocksCoachingProof: issue.blocksCoachingProof !== false,
          }
          if (['calories', 'protein', 'carbs', 'fat', 'servingSize', 'servingUnit', 'barcode'].includes(`${issue.field}`)) {
            normalized.field = issue.field as NonNullable<FoodTrustEvidence['accuracyIssues']>[number]['field']
          }
          if (typeof issue.expected === 'string') {
            normalized.expected = issue.expected
          }
          if (typeof issue.actual === 'string') {
            normalized.actual = issue.actual
          }
          return normalized
        })
        .filter((entry): entry is NonNullable<FoodTrustEvidence['accuracyIssues']>[number] => entry !== null)
    : undefined

  return {
    source: raw.source,
    sourceId,
    status: raw.status,
    confidence,
    servingBasis: raw.servingBasis,
    macroCompleteness: raw.macroCompleteness,
    providerConflict: raw.providerConflict === true,
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.filter((reason): reason is FoodTrustEvidence['reasons'][number] =>
          reason === 'missing_macros' ||
          reason === 'estimated_serving' ||
          reason === 'unknown_serving_basis' ||
          reason === 'per100_fallback' ||
          reason === 'provider_conflict' ||
          reason === 'low_ocr_confidence',
        )
      : [],
    reviewedAt: typeof raw.reviewedAt === 'string' && raw.reviewedAt.trim() ? raw.reviewedAt : undefined,
    fieldEvidence,
    accuracyIssues,
    proofEligible: raw.proofEligible === true || raw.status === 'trusted',
  }
}

function sortEvidence(items: FoodTrustEvidence[]): FoodTrustEvidence[] {
  return [...items].sort((left, right) => left.sourceId.localeCompare(right.sourceId))
}

function ensureLoaded(): FoodTrustEvidence[] {
  if (cache !== null) {
    return cache
  }

  const raw = getStorage()?.getItem(STORAGE_KEY)
  if (!raw) {
    cache = []
    return cache
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    cache = Array.isArray(parsed)
      ? sortEvidence(parsed.map(normalizeEvidence).filter((entry): entry is FoodTrustEvidence => entry !== null))
      : []
  } catch {
    cache = []
  }

  return cache
}

function persist(items: FoodTrustEvidence[]): ActionResult<void> {
  try {
    cache = sortEvidence(items)
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(cache))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('foodTrustEvidenceWriteFailed', 'Unable to persist food trust evidence locally.')
  }
}

export function subscribeToFoodTrustEvidence(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadFoodTrustEvidence(): FoodTrustEvidence[] {
  return ensureLoaded()
}

export function saveFoodTrustEvidence(items: FoodTrustEvidence[]): ActionResult<void> {
  return persist(items)
}

export function upsertFoodTrustEvidence(evidence: FoodTrustEvidence): ActionResult<void> {
  const next = ensureLoaded().filter((entry) => entry.sourceId !== evidence.sourceId)
  next.push(evidence)
  return persist(next)
}

export function clearFoodTrustEvidenceForTests(): void {
  cache = []
  getStorage()?.removeItem(STORAGE_KEY)
  emitChange()
}
