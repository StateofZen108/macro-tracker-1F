import type {
  ActionResult,
  GarminImportedWeight,
  GarminModifierRecord,
  GarminWorkoutSummary,
  WeightEntry,
  WeightUnit,
} from '../../types'
import { FEATURE_FLAGS } from '../../config/featureFlags'
import { isWeightProofEligible, validateWeightValue } from '../../domain/biometricSanity'
import { enqueueEncryptedSyncEnvelope } from './encryptedSync'

const STORAGE_KEYS = {
  importedWeights: 'mt_garmin_imported_weights',
  modifierRecords: 'mt_garmin_modifier_records',
  workoutSummaries: 'mt_garmin_workout_summaries',
} as const

type Listener = () => void

type GarminImportCache = {
  weights: GarminImportedWeight[] | null
  modifiers: GarminModifierRecord[] | null
  workouts: GarminWorkoutSummary[] | null
}

const cache: GarminImportCache = {
  weights: null,
  modifiers: null,
  workouts: null,
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseWeightUnit(value: unknown): WeightUnit | null {
  return value === 'lb' || value === 'kg' ? value : null
}

function applyGarminWeightSanity(
  record: GarminImportedWeight,
  localWeights: readonly WeightEntry[],
): GarminImportedWeight {
  const sanity = validateWeightValue({
    date: record.date,
    weight: record.weight,
    unit: record.unit,
    source: 'garmin_import',
    existingWeights: localWeights.filter(isWeightProofEligible),
  })
  return {
    ...record,
    sanityStatus: sanity.status,
    sanityIssues: sanity.issues.length ? sanity.issues : undefined,
    proofEligible: sanity.proofEligible,
  }
}

function normalizeImportedWeight(rawValue: unknown): GarminImportedWeight | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const date = typeof rawValue.date === 'string' && rawValue.date.trim() ? rawValue.date.trim() : null
  const weight = typeof rawValue.weight === 'number' && Number.isFinite(rawValue.weight) ? rawValue.weight : null
  const unit = parseWeightUnit(rawValue.unit)
  const sourceUpdatedAt =
    typeof rawValue.sourceUpdatedAt === 'string' && rawValue.sourceUpdatedAt.trim()
      ? rawValue.sourceUpdatedAt
      : null
  const importedAt =
    typeof rawValue.importedAt === 'string' && rawValue.importedAt.trim() ? rawValue.importedAt : null
  const state =
    rawValue.state === 'ignored_conflict' || rawValue.state === 'imported'
      ? rawValue.state
      : null

  if (!id || !date || weight === null || !unit || !sourceUpdatedAt || !importedAt || !state) {
    return null
  }

  return {
    id,
    provider: 'garmin',
    date,
    weight,
    unit,
    sourceUpdatedAt,
    importedAt,
    state,
    conflictLocalWeightId:
      typeof rawValue.conflictLocalWeightId === 'string' && rawValue.conflictLocalWeightId.trim()
        ? rawValue.conflictLocalWeightId.trim()
        : undefined,
    sanityStatus:
      rawValue.sanityStatus === 'valid' ||
      rawValue.sanityStatus === 'outlier_review_required' ||
      rawValue.sanityStatus === 'blocked_invalid'
        ? rawValue.sanityStatus
        : undefined,
    proofEligible: typeof rawValue.proofEligible === 'boolean' ? rawValue.proofEligible : undefined,
    reviewedAt: typeof rawValue.reviewedAt === 'string' && rawValue.reviewedAt.trim() ? rawValue.reviewedAt.trim() : undefined,
  }
}

function normalizeModifierRecord(rawValue: unknown): GarminModifierRecord | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const date = typeof rawValue.date === 'string' && rawValue.date.trim() ? rawValue.date.trim() : null
  const sourceUpdatedAt =
    typeof rawValue.sourceUpdatedAt === 'string' && rawValue.sourceUpdatedAt.trim()
      ? rawValue.sourceUpdatedAt
      : null
  const importedAt =
    typeof rawValue.importedAt === 'string' && rawValue.importedAt.trim() ? rawValue.importedAt : null

  if (!id || !date || !sourceUpdatedAt || !importedAt) {
    return null
  }

  return {
    id,
    provider: 'garmin',
    date,
    steps:
      typeof rawValue.steps === 'number' && Number.isFinite(rawValue.steps) ? rawValue.steps : undefined,
    sleepMinutes:
      typeof rawValue.sleepMinutes === 'number' && Number.isFinite(rawValue.sleepMinutes)
        ? rawValue.sleepMinutes
        : undefined,
    restingHeartRate:
      typeof rawValue.restingHeartRate === 'number' && Number.isFinite(rawValue.restingHeartRate)
        ? rawValue.restingHeartRate
        : undefined,
    activeCalories:
      typeof rawValue.activeCalories === 'number' && Number.isFinite(rawValue.activeCalories)
        ? rawValue.activeCalories
        : undefined,
    derivedCardioMinutes:
      typeof rawValue.derivedCardioMinutes === 'number' && Number.isFinite(rawValue.derivedCardioMinutes)
        ? rawValue.derivedCardioMinutes
        : undefined,
    sourceUpdatedAt,
    importedAt,
  }
}

function normalizeWorkoutSummary(rawValue: unknown): GarminWorkoutSummary | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const date = typeof rawValue.date === 'string' && rawValue.date.trim() ? rawValue.date.trim() : null
  const sourceUpdatedAt =
    typeof rawValue.sourceUpdatedAt === 'string' && rawValue.sourceUpdatedAt.trim()
      ? rawValue.sourceUpdatedAt
      : null
  const importedAt =
    typeof rawValue.importedAt === 'string' && rawValue.importedAt.trim() ? rawValue.importedAt : null

  if (!id || !date || !sourceUpdatedAt || !importedAt) {
    return null
  }

  return {
    id,
    provider: 'garmin',
    date,
    workoutName:
      typeof rawValue.workoutName === 'string' && rawValue.workoutName.trim()
        ? rawValue.workoutName.trim()
        : undefined,
    startedAt:
      typeof rawValue.startedAt === 'string' && rawValue.startedAt.trim()
        ? rawValue.startedAt
        : undefined,
    durationMinutes:
      typeof rawValue.durationMinutes === 'number' && Number.isFinite(rawValue.durationMinutes)
        ? rawValue.durationMinutes
        : undefined,
    activeCalories:
      typeof rawValue.activeCalories === 'number' && Number.isFinite(rawValue.activeCalories)
        ? rawValue.activeCalories
        : undefined,
    averageHeartRate:
      typeof rawValue.averageHeartRate === 'number' && Number.isFinite(rawValue.averageHeartRate)
        ? rawValue.averageHeartRate
        : undefined,
    sourceUpdatedAt,
    importedAt,
  }
}

function sortByUpdatedAt<T extends { sourceUpdatedAt: string; id: string }>(records: T[]): T[] {
  return [...records].sort(
    (left, right) => right.sourceUpdatedAt.localeCompare(left.sourceUpdatedAt) || left.id.localeCompare(right.id),
  )
}

function readArray<T>(storageKey: string, normalize: (value: unknown) => T | null): T[] {
  if (!canUseStorage()) {
    return []
  }

  const raw = getStorage()?.getItem(storageKey)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.map((entry) => normalize(entry)).filter((entry): entry is T => entry !== null)
      : []
  } catch {
    return []
  }
}

function persistWeights(records: GarminImportedWeight[]): ActionResult<void> {
  try {
    const normalized = sortByUpdatedAt(records)
    cache.weights = normalized
    getStorage()?.setItem(STORAGE_KEYS.importedWeights, JSON.stringify(normalized))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist Garmin import data locally.')
  }
}

function persistModifiers(records: GarminModifierRecord[]): ActionResult<void> {
  try {
    const normalized = sortByUpdatedAt(records)
    cache.modifiers = normalized
    getStorage()?.setItem(STORAGE_KEYS.modifierRecords, JSON.stringify(normalized))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist Garmin import data locally.')
  }
}

function persistWorkouts(records: GarminWorkoutSummary[]): ActionResult<void> {
  try {
    const normalized = sortByUpdatedAt(records)
    cache.workouts = normalized
    getStorage()?.setItem(STORAGE_KEYS.workoutSummaries, JSON.stringify(normalized))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist Garmin import data locally.')
  }
}

function ensureWeights(): GarminImportedWeight[] {
  if (cache.weights !== null) {
    return cache.weights
  }

  cache.weights = sortByUpdatedAt(readArray(STORAGE_KEYS.importedWeights, normalizeImportedWeight))
  return cache.weights
}

function ensureModifiers(): GarminModifierRecord[] {
  if (cache.modifiers !== null) {
    return cache.modifiers
  }

  cache.modifiers = sortByUpdatedAt(readArray(STORAGE_KEYS.modifierRecords, normalizeModifierRecord))
  return cache.modifiers
}

function ensureWorkouts(): GarminWorkoutSummary[] {
  if (cache.workouts !== null) {
    return cache.workouts
  }

  cache.workouts = sortByUpdatedAt(readArray(STORAGE_KEYS.workoutSummaries, normalizeWorkoutSummary))
  return cache.workouts
}

function upsertById<T extends { id: string; sourceUpdatedAt: string }>(existing: T[], incoming: T[]): T[] {
  const next = new Map(existing.map((record) => [record.id, record]))
  for (const record of incoming) {
    const current = next.get(record.id)
    if (!current || current.sourceUpdatedAt <= record.sourceUpdatedAt) {
      next.set(record.id, record)
    }
  }
  return sortByUpdatedAt([...next.values()])
}

export function subscribeToGarminImportStorage(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadGarminImportedWeights(): GarminImportedWeight[] {
  return ensureWeights()
}

export function loadGarminModifierRecords(): GarminModifierRecord[] {
  return ensureModifiers()
}

export function loadGarminWorkoutSummaries(): GarminWorkoutSummary[] {
  return ensureWorkouts()
}

export function saveGarminImportedWeights(records: GarminImportedWeight[]): ActionResult<void> {
  return persistWeights(records)
}

export function saveGarminModifierRecords(records: GarminModifierRecord[]): ActionResult<void> {
  return persistModifiers(records)
}

export function saveGarminWorkoutSummaries(records: GarminWorkoutSummary[]): ActionResult<void> {
  return persistWorkouts(records)
}

export function mergeGarminImportedData(input: {
  importedWeights?: Array<{
    date: string
    weight: number
    unit: WeightUnit
    sourceUpdatedAt: string
  }>
  modifierRecords?: Array<{
    date: string
    steps?: number
    sleepMinutes?: number
    restingHeartRate?: number
    activeCalories?: number
    derivedCardioMinutes?: number
    sourceUpdatedAt: string
  }>
  workoutSummaries?: Array<{
    date: string
    workoutName?: string
    startedAt?: string
    durationMinutes?: number
    activeCalories?: number
    averageHeartRate?: number
    sourceUpdatedAt: string
  }>
  localWeights: WeightEntry[]
}): ActionResult<{
  weights: GarminImportedWeight[]
  modifiers: GarminModifierRecord[]
  workouts: GarminWorkoutSummary[]
  localWeightConflictCount: number
}> {
  const now = new Date().toISOString()

  const nextWeights = upsertById(
    ensureWeights(),
    (input.importedWeights ?? []).map((record) => {
      const localWeight = input.localWeights.find((entry) => !entry.deletedAt && entry.date === record.date)

      return applyGarminWeightSanity({
        id: `garmin-weight:${record.date}`,
        provider: 'garmin' as const,
        date: record.date,
        weight: record.weight,
        unit: record.unit,
        sourceUpdatedAt: record.sourceUpdatedAt,
        importedAt: now,
        state: localWeight ? 'ignored_conflict' : 'imported',
        conflictLocalWeightId: localWeight?.id,
      } satisfies GarminImportedWeight, input.localWeights)
    }),
  )

  const nextModifiers = upsertById(
    ensureModifiers(),
    (input.modifierRecords ?? []).map((record) => ({
      id: `garmin-modifier:${record.date}`,
      provider: 'garmin' as const,
      date: record.date,
      steps: record.steps,
      sleepMinutes: record.sleepMinutes,
      restingHeartRate: record.restingHeartRate,
      activeCalories: record.activeCalories,
      derivedCardioMinutes: record.derivedCardioMinutes,
      sourceUpdatedAt: record.sourceUpdatedAt,
      importedAt: now,
    })),
  )

  const nextWorkouts = upsertById(
    ensureWorkouts(),
    (input.workoutSummaries ?? []).map((record, index) => ({
      id: `garmin-workout:${record.date}:${record.startedAt ?? record.workoutName ?? index}`,
      provider: 'garmin' as const,
      date: record.date,
      workoutName: record.workoutName,
      startedAt: record.startedAt,
      durationMinutes: record.durationMinutes,
      activeCalories: record.activeCalories,
      averageHeartRate: record.averageHeartRate,
      sourceUpdatedAt: record.sourceUpdatedAt,
      importedAt: now,
    })),
  )

  const weightsResult = saveGarminImportedWeights(nextWeights)
  if (!weightsResult.ok) {
    return weightsResult
  }

  const modifiersResult = saveGarminModifierRecords(nextModifiers)
  if (!modifiersResult.ok) {
    return modifiersResult
  }

  const workoutsResult = saveGarminWorkoutSummaries(nextWorkouts)
  if (!workoutsResult.ok) {
    return workoutsResult
  }

  if (FEATURE_FLAGS.encryptedSyncV2) {
    for (const record of nextWeights) {
      void enqueueEncryptedSyncEnvelope({
        recordKind: 'garmin_imported_weights',
        recordId: record.id,
        updatedAt: record.importedAt,
        payload: record,
      })
    }
    for (const record of nextModifiers) {
      void enqueueEncryptedSyncEnvelope({
        recordKind: 'garmin_modifier_records',
        recordId: record.id,
        updatedAt: record.importedAt,
        payload: record,
      })
    }
    for (const record of nextWorkouts) {
      void enqueueEncryptedSyncEnvelope({
        recordKind: 'garmin_workout_summaries',
        recordId: record.id,
        updatedAt: record.importedAt,
        payload: record,
      })
    }
  }

  return ok({
    weights: nextWeights,
    modifiers: nextModifiers,
    workouts: nextWorkouts,
    localWeightConflictCount: nextWeights.filter((record) => record.state === 'ignored_conflict').length,
  })
}

export function clearGarminImportStoresForTests(): void {
  cache.weights = []
  cache.modifiers = []
  cache.workouts = []
  if (canUseStorage()) {
    getStorage()?.removeItem(STORAGE_KEYS.importedWeights)
    getStorage()?.removeItem(STORAGE_KEYS.modifierRecords)
    getStorage()?.removeItem(STORAGE_KEYS.workoutSummaries)
  }
  emitChange()
}
