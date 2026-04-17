import type { ActionResult, BenchmarkReport } from '../../types'

const STORAGE_KEY = 'mt_benchmark_reports'

let cache: BenchmarkReport[] | null = null
const listeners = new Set<() => void>()

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeReport(rawValue: unknown): BenchmarkReport | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const createdAt =
    typeof rawValue.createdAt === 'string' && rawValue.createdAt.trim() ? rawValue.createdAt : null
  const scenarios = Array.isArray(rawValue.scenarios) ? rawValue.scenarios : null

  if (!id || !createdAt || scenarios === null || typeof rawValue.passed !== 'boolean') {
    return null
  }

  return {
    id,
    createdAt,
    passed: rawValue.passed,
    blockedReason:
      typeof rawValue.blockedReason === 'string' && rawValue.blockedReason.trim()
        ? rawValue.blockedReason
        : undefined,
    scenarios: scenarios.filter((scenario): scenario is BenchmarkReport['scenarios'][number] => isRecord(scenario)).map((scenario) => ({
      id: typeof scenario.id === 'string' ? scenario.id : crypto.randomUUID(),
      name: typeof scenario.name === 'string' ? scenario.name : 'Scenario',
      required: scenario.required === true,
      baselineActionCount:
        typeof scenario.baselineActionCount === 'number' && Number.isFinite(scenario.baselineActionCount)
          ? scenario.baselineActionCount
          : 0,
      baselineElapsedMs:
        typeof scenario.baselineElapsedMs === 'number' && Number.isFinite(scenario.baselineElapsedMs)
          ? scenario.baselineElapsedMs
          : 0,
      actualActionCount:
        typeof scenario.actualActionCount === 'number' && Number.isFinite(scenario.actualActionCount)
          ? scenario.actualActionCount
          : 0,
      actualElapsedMs:
        typeof scenario.actualElapsedMs === 'number' && Number.isFinite(scenario.actualElapsedMs)
          ? scenario.actualElapsedMs
          : 0,
      correctnessPassed: scenario.correctnessPassed === true,
      createdAt:
        typeof scenario.createdAt === 'string' && scenario.createdAt.trim()
          ? scenario.createdAt
          : createdAt,
    })),
  }
}

export function loadBenchmarkReports(): BenchmarkReport[] {
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
      ? parsed.map((entry) => normalizeReport(entry)).filter((entry): entry is BenchmarkReport => entry !== null)
      : []
  } catch {
    cache = []
  }

  return cache
}

export function subscribeToBenchmarkReports(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function saveBenchmarkReports(reports: BenchmarkReport[]): ActionResult<void> {
  if (!canUseStorage()) {
    return fail('unavailable', 'Browser storage is not available in this environment.')
  }

  try {
    cache = [...reports].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify(cache))
    for (const listener of listeners) {
      listener()
    }
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist benchmark reports locally.')
  }
}

export function clearBenchmarkReportsForTests(): void {
  cache = []
  if (canUseStorage()) {
    getStorage()?.removeItem(STORAGE_KEY)
  }
  for (const listener of listeners) {
    listener()
  }
}
