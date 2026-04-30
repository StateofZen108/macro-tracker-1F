import type { ActionResult, FoodTrustEvidence } from '../../types'

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
