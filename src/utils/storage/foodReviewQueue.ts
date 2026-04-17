import type {
  ActionResult,
  FoodReviewItem,
  FoodReviewSource,
  FoodReviewStatus,
  ImportTrustLevel,
} from '../../types'
import { FEATURE_FLAGS } from '../../config/featureFlags'
import { enqueueEncryptedSyncEnvelope } from './encryptedSync'

const STORAGE_KEY = 'mt_food_review_queue'

type Listener = () => void

let cache: FoodReviewItem[] | null = null
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

function isStatus(value: unknown): value is FoodReviewStatus {
  return value === 'pending' || value === 'resolved' || value === 'dismissed'
}

function isSource(value: unknown): value is FoodReviewSource {
  return (
    value === 'barcode' ||
    value === 'ocr' ||
    value === 'catalog_import' ||
    value === 'orphaned_log_entry'
  )
}

function isTrustLevel(value: unknown): value is ImportTrustLevel {
  return value === 'exact_autolog' || value === 'exact_review' || value === 'blocked'
}

function normalizeReviewItem(rawValue: unknown): FoodReviewItem | null {
  if (typeof rawValue !== 'object' || rawValue === null || Array.isArray(rawValue)) {
    return null
  }

  const raw = rawValue as Record<string, unknown>
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : null
  const status = isStatus(raw.status) ? raw.status : null
  const source = isSource(raw.source) ? raw.source : null
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : null
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt : null
  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : null

  if (!id || !status || !source || !title || !reason || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    status,
    source,
    title,
    reason,
    createdAt,
    updatedAt,
    linkedFoodId:
      typeof raw.linkedFoodId === 'string' && raw.linkedFoodId.trim()
        ? raw.linkedFoodId.trim()
        : undefined,
    linkedEntryId:
      typeof raw.linkedEntryId === 'string' && raw.linkedEntryId.trim()
        ? raw.linkedEntryId.trim()
        : undefined,
    linkedEntryDate:
      typeof raw.linkedEntryDate === 'string' && raw.linkedEntryDate.trim()
        ? raw.linkedEntryDate.trim()
        : undefined,
    resolvedFoodId:
      typeof raw.resolvedFoodId === 'string' && raw.resolvedFoodId.trim()
        ? raw.resolvedFoodId.trim()
        : undefined,
    barcode:
      typeof raw.barcode === 'string' && raw.barcode.trim() ? raw.barcode.trim() : undefined,
    trustLevel: isTrustLevel(raw.trustLevel) ? raw.trustLevel : undefined,
    resolvedAt:
      typeof raw.resolvedAt === 'string' && raw.resolvedAt.trim() ? raw.resolvedAt : undefined,
    dismissedAt:
      typeof raw.dismissedAt === 'string' && raw.dismissedAt.trim()
        ? raw.dismissedAt
        : undefined,
  }
}

function sortItems(items: FoodReviewItem[]): FoodReviewItem[] {
  return [...items].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt),
  )
}

function ensureLoaded(): FoodReviewItem[] {
  if (cache !== null) {
    return cache
  }

  if (!canUseStorage()) {
    cache = []
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
      ? sortItems(parsed.map((entry) => normalizeReviewItem(entry)).filter((entry): entry is FoodReviewItem => entry !== null))
      : []
  } catch {
    cache = []
  }

  return cache
}

function persist(items: FoodReviewItem[]): ActionResult<void> {
  try {
    const normalized = sortItems(items)
    cache = normalized
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(normalized))
    if (FEATURE_FLAGS.encryptedSyncV2) {
      for (const item of normalized) {
        void enqueueEncryptedSyncEnvelope({
          recordKind: 'food_review_queue',
          recordId: item.id,
          updatedAt: item.updatedAt,
          payload: item,
        })
      }
    }
    emitChange()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist the food review queue locally.')
  }
}

export function subscribeToFoodReviewQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadFoodReviewQueue(): FoodReviewItem[] {
  return ensureLoaded()
}

export function saveFoodReviewQueue(items: FoodReviewItem[]): ActionResult<void> {
  return persist(items)
}

export function queueFoodReviewItem(input: {
  source: FoodReviewSource
  title: string
  reason: string
  linkedFoodId?: string
  linkedEntryId?: string
  linkedEntryDate?: string
  barcode?: string
  trustLevel?: ImportTrustLevel
}): ActionResult<FoodReviewItem> {
  const now = new Date().toISOString()
  const item: FoodReviewItem = {
    id: crypto.randomUUID(),
    status: 'pending',
    source: input.source,
    title: input.title.trim(),
    reason: input.reason.trim(),
    createdAt: now,
    updatedAt: now,
    linkedFoodId: input.linkedFoodId?.trim() || undefined,
    linkedEntryId: input.linkedEntryId?.trim() || undefined,
    linkedEntryDate: input.linkedEntryDate?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
    trustLevel: input.trustLevel,
  }

  const result = persist([item, ...ensureLoaded()])
  return result.ok ? ok(item) : result
}

export function resolveFoodReviewItem(
  reviewItemId: string,
  resolvedFoodId?: string,
): ActionResult<FoodReviewItem | null> {
  const items = ensureLoaded()
  const existing = items.find((item) => item.id === reviewItemId)
  if (!existing) {
    return ok(null)
  }

  const now = new Date().toISOString()
  const nextItem: FoodReviewItem = {
    ...existing,
    status: 'resolved',
    resolvedFoodId: resolvedFoodId?.trim() || existing.resolvedFoodId,
    resolvedAt: now,
    updatedAt: now,
  }

  const result = persist(items.map((item) => (item.id === reviewItemId ? nextItem : item)))
  return result.ok ? ok(nextItem) : result
}

export function dismissFoodReviewItem(reviewItemId: string): ActionResult<FoodReviewItem | null> {
  const items = ensureLoaded()
  const existing = items.find((item) => item.id === reviewItemId)
  if (!existing) {
    return ok(null)
  }

  const now = new Date().toISOString()
  const nextItem: FoodReviewItem = {
    ...existing,
    status: 'dismissed',
    dismissedAt: now,
    updatedAt: now,
  }

  const result = persist(items.map((item) => (item.id === reviewItemId ? nextItem : item)))
  return result.ok ? ok(nextItem) : result
}

export function clearFoodReviewQueueForTests(): void {
  cache = []
  if (canUseStorage()) {
    getStorage()?.removeItem(STORAGE_KEY)
  }
  emitChange()
}
