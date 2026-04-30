import type { ActionResult, DailyMistakeProofModel } from '../../types'

const STORAGE_KEY = 'mt_daily_guardrails'

type Listener = () => void

let cache: DailyMistakeProofModel[] | null = null
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

function normalizeModel(rawValue: unknown): DailyMistakeProofModel | null {
  if (typeof rawValue !== 'object' || rawValue === null || Array.isArray(rawValue)) {
    return null
  }

  const raw = rawValue as Partial<DailyMistakeProofModel>
  if (
    typeof raw.date !== 'string' ||
    (raw.readiness !== 'ready' && raw.readiness !== 'needs_repair' && raw.readiness !== 'blocked') ||
    !Array.isArray(raw.guardrails) ||
    !Array.isArray(raw.trustRepairs) ||
    typeof raw.surfaceConsistency !== 'object' ||
    raw.surfaceConsistency === null
  ) {
    return null
  }

  return raw as DailyMistakeProofModel
}

function sortModels(items: DailyMistakeProofModel[]): DailyMistakeProofModel[] {
  return [...items].sort((left, right) => right.date.localeCompare(left.date))
}

function ensureLoaded(): DailyMistakeProofModel[] {
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
      ? sortModels(parsed.map(normalizeModel).filter((entry): entry is DailyMistakeProofModel => entry !== null))
      : []
  } catch {
    cache = []
  }

  return cache
}

function persist(items: DailyMistakeProofModel[]): ActionResult<void> {
  try {
    cache = sortModels(items)
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(cache))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('dailyGuardrailsWriteFailed', 'Unable to persist daily guardrails locally.')
  }
}

export function subscribeToDailyGuardrails(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadDailyGuardrails(): DailyMistakeProofModel[] {
  return ensureLoaded()
}

export function saveDailyGuardrails(items: DailyMistakeProofModel[]): ActionResult<void> {
  return persist(items)
}

export function upsertDailyGuardrailModel(model: DailyMistakeProofModel): ActionResult<void> {
  const next = ensureLoaded().filter((entry) => entry.date !== model.date)
  next.push(model)
  return persist(next)
}

export function clearDailyGuardrailsForTests(): void {
  cache = []
  getStorage()?.removeItem(STORAGE_KEY)
  emitChange()
}
