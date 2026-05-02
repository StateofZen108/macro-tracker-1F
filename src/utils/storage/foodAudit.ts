import type { ActionResult, FoodAuditEvent } from '../../types'

const STORAGE_KEY = 'mt_food_audit_events'

type Listener = () => void

let cache: FoodAuditEvent[] | null = null
const listeners = new Set<Listener>()

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

function getStorage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
}

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSnapshot(value: unknown): FoodAuditEvent['after'] {
  if (!isRecord(value)) {
    return undefined
  }

  const entryId = typeof value.entryId === 'string' ? value.entryId : ''
  const date = typeof value.date === 'string' ? value.date : ''
  const meal = typeof value.meal === 'string' ? value.meal : ''
  const name = typeof value.name === 'string' ? value.name : ''
  const servingUnit = typeof value.servingUnit === 'string' ? value.servingUnit : ''
  if (!entryId || !date || !['breakfast', 'lunch', 'dinner', 'snack'].includes(meal) || !name) {
    return undefined
  }

  return {
    entryId,
    foodId: typeof value.foodId === 'string' ? value.foodId : undefined,
    date,
    meal: meal as NonNullable<FoodAuditEvent['after']>['meal'],
    servings: Number(value.servings ?? 0),
    name,
    brand: typeof value.brand === 'string' ? value.brand : undefined,
    servingSize: Number(value.servingSize ?? 0),
    servingUnit,
    calories: Number(value.calories ?? 0),
    protein: Number(value.protein ?? 0),
    carbs: Number(value.carbs ?? 0),
    fat: Number(value.fat ?? 0),
    trustStatus: ['trusted', 'review_required', 'blocked'].includes(`${value.trustStatus}`)
      ? (value.trustStatus as NonNullable<FoodAuditEvent['after']>['trustStatus'])
      : undefined,
    needsReview: value.needsReview === true,
  }
}

function normalizeEvent(value: unknown): FoodAuditEvent | null {
  if (!isRecord(value)) {
    return null
  }

  const id = typeof value.id === 'string' ? value.id : ''
  const operationId = typeof value.operationId === 'string' ? value.operationId : ''
  const entryId = typeof value.entryId === 'string' ? value.entryId : ''
  const date = typeof value.date === 'string' ? value.date : ''
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : ''
  if (!id || !operationId || !entryId || !date || !createdAt) {
    return null
  }

  if (!['created', 'edited', 'deleted', 'restored', 'imported', 'reviewed'].includes(`${value.eventType}`)) {
    return null
  }

  if (!['user', 'barcode', 'ocr', 'catalog', 'import', 'system'].includes(`${value.actor}`)) {
    return null
  }

  return {
    id,
    operationId,
    entryId,
    date,
    eventType: value.eventType as FoodAuditEvent['eventType'],
    actor: value.actor as FoodAuditEvent['actor'],
    before: normalizeSnapshot(value.before),
    after: normalizeSnapshot(value.after),
    trustBefore: ['trusted', 'review_required', 'blocked'].includes(`${value.trustBefore}`)
      ? (value.trustBefore as FoodAuditEvent['trustBefore'])
      : undefined,
    trustAfter: ['trusted', 'review_required', 'blocked'].includes(`${value.trustAfter}`)
      ? (value.trustAfter as FoodAuditEvent['trustAfter'])
      : undefined,
    issues: Array.isArray(value.issues) ? (value.issues as FoodAuditEvent['issues']) : [],
    createdAt,
  }
}

function sortEvents(events: FoodAuditEvent[]): FoodAuditEvent[] {
  return [...events].sort((left, right) => {
    const byDate = left.createdAt.localeCompare(right.createdAt)
    return byDate === 0 ? left.id.localeCompare(right.id) : byDate
  })
}

function ensureLoaded(): FoodAuditEvent[] {
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
      ? sortEvents(parsed.map(normalizeEvent).filter((event): event is FoodAuditEvent => event !== null))
      : []
  } catch {
    cache = []
  }

  return cache
}

function persist(events: FoodAuditEvent[]): ActionResult<void> {
  const deduped = new Map<string, FoodAuditEvent>()
  for (const event of events) {
    deduped.set(event.id, event)
  }

  try {
    cache = sortEvents([...deduped.values()])
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(cache))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('foodAuditWriteFailed', 'Unable to persist the food audit ledger locally.')
  }
}

export function subscribeToFoodAuditEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadFoodAuditEvents(): FoodAuditEvent[] {
  return ensureLoaded()
}

export function saveFoodAuditEvents(events: FoodAuditEvent[]): ActionResult<void> {
  return persist(events)
}

export function appendFoodAuditEvents(events: FoodAuditEvent[]): ActionResult<void> {
  if (events.length === 0) {
    return ok(undefined)
  }

  return persist([...ensureLoaded(), ...events])
}

export function clearFoodAuditEventsForTests(): void {
  cache = []
  getStorage()?.removeItem(STORAGE_KEY)
  emitChange()
}
