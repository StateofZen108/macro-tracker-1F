import type { ActionResult, ProgressionDecision, WorkoutProgram, WorkoutSession } from '../../types'
import { FEATURE_FLAGS } from '../../config/featureFlags'
import { enqueueEncryptedSyncEnvelope } from './encryptedSync'

const STORAGE_KEYS = {
  programs: 'mt_workout_programs',
  sessions: 'mt_workout_sessions',
  decisions: 'mt_progression_decisions',
} as const

type Listener = () => void

const listeners = new Set<Listener>()
let workoutProgramCache: WorkoutProgram[] | null = null
let workoutSessionCache: WorkoutSession[] | null = null
let progressionDecisionCache: ProgressionDecision[] | null = null

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

function readArray<T>(key: string, normalize: (value: unknown) => T | null): T[] {
  if (!canUseStorage()) {
    return []
  }

  const raw = getStorage()?.getItem(key)
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

function persist<T>(key: string, records: T[], cacheSetter: (records: T[]) => void): ActionResult<void> {
  try {
    cacheSetter(records)
    getStorage()?.setItem(key, JSON.stringify(records))
    emitChange()
    return ok(undefined)
  } catch {
    return fail('storageWriteFailed', 'Unable to persist workout data locally.')
  }
}

function normalizeWorkoutProgram(rawValue: unknown): WorkoutProgram | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const name = typeof rawValue.name === 'string' && rawValue.name.trim() ? rawValue.name.trim() : null
  const goal =
    rawValue.goal === 'strength_preservation' ||
    rawValue.goal === 'hypertrophy' ||
    rawValue.goal === 'general_strength'
      ? rawValue.goal
      : null
  const createdAt =
    typeof rawValue.createdAt === 'string' && rawValue.createdAt.trim() ? rawValue.createdAt : null
  const updatedAt =
    typeof rawValue.updatedAt === 'string' && rawValue.updatedAt.trim() ? rawValue.updatedAt : null
  const templates = Array.isArray(rawValue.templates) ? rawValue.templates : null

  if (!id || !name || !goal || !createdAt || !updatedAt || templates === null) {
    return null
  }

  return {
    id,
    name,
    goal,
    gymProfileId:
      typeof rawValue.gymProfileId === 'string' && rawValue.gymProfileId.trim()
        ? rawValue.gymProfileId
        : undefined,
    preservationDefaults: isRecord(rawValue.preservationDefaults)
      ? {
          defaultRestSeconds:
            typeof rawValue.preservationDefaults.defaultRestSeconds === 'number' &&
            Number.isFinite(rawValue.preservationDefaults.defaultRestSeconds)
              ? rawValue.preservationDefaults.defaultRestSeconds
              : undefined,
          defaultTargetRir:
            typeof rawValue.preservationDefaults.defaultTargetRir === 'number' &&
            Number.isFinite(rawValue.preservationDefaults.defaultTargetRir)
              ? rawValue.preservationDefaults.defaultTargetRir
              : undefined,
          backOffCapPercent:
            typeof rawValue.preservationDefaults.backOffCapPercent === 'number' &&
            Number.isFinite(rawValue.preservationDefaults.backOffCapPercent)
              ? rawValue.preservationDefaults.backOffCapPercent
              : undefined,
          restTimerSound:
            rawValue.preservationDefaults.restTimerSound === 'soft' ||
            rawValue.preservationDefaults.restTimerSound === 'beep' ||
            rawValue.preservationDefaults.restTimerSound === 'silent'
              ? rawValue.preservationDefaults.restTimerSound
              : undefined,
          smartWarmupsEnabled:
            typeof rawValue.preservationDefaults.smartWarmupsEnabled === 'boolean'
              ? rawValue.preservationDefaults.smartWarmupsEnabled
              : undefined,
        }
      : undefined,
    templates: templates
      .filter(isRecord)
      .map((template) => ({
        id: typeof template.id === 'string' ? template.id : crypto.randomUUID(),
        programId: typeof template.programId === 'string' ? template.programId : id,
        name: typeof template.name === 'string' ? template.name : 'Template',
        slotKey: typeof template.slotKey === 'string' ? template.slotKey : 'slot-1',
        exercises: Array.isArray(template.exercises)
          ? template.exercises
              .filter((exercise): exercise is Record<string, unknown> => isRecord(exercise))
              .map((exercise) => ({
                id: typeof exercise.id === 'string' ? exercise.id : crypto.randomUUID(),
                name: typeof exercise.name === 'string' ? exercise.name : 'Exercise',
                muscleGroup:
                  exercise.muscleGroup === 'chest' ||
                  exercise.muscleGroup === 'back' ||
                  exercise.muscleGroup === 'legs' ||
                  exercise.muscleGroup === 'shoulders' ||
                  exercise.muscleGroup === 'arms' ||
                  exercise.muscleGroup === 'glutes' ||
                  exercise.muscleGroup === 'core' ||
                  exercise.muscleGroup === 'full_body' ||
                  exercise.muscleGroup === 'cardio'
                    ? exercise.muscleGroup
                    : undefined,
                equipment: Array.isArray(exercise.equipment)
                  ? exercise.equipment.filter(
                      (value): value is string => typeof value === 'string' && value.trim().length > 0,
                    )
                  : undefined,
                customExerciseId:
                  typeof exercise.customExerciseId === 'string' && exercise.customExerciseId.trim()
                    ? exercise.customExerciseId
                    : undefined,
                targetSets:
                  typeof exercise.targetSets === 'number' && Number.isFinite(exercise.targetSets)
                    ? exercise.targetSets
                    : 0,
                targetReps:
                  typeof exercise.targetReps === 'number' && Number.isFinite(exercise.targetReps)
                    ? exercise.targetReps
                    : 0,
                targetLoad:
                  typeof exercise.targetLoad === 'number' && Number.isFinite(exercise.targetLoad)
                    ? exercise.targetLoad
                    : undefined,
                targetSeconds:
                  typeof exercise.targetSeconds === 'number' && Number.isFinite(exercise.targetSeconds)
                    ? exercise.targetSeconds
                    : undefined,
                rir:
                  typeof exercise.rir === 'number' && Number.isFinite(exercise.rir)
                    ? exercise.rir
                    : undefined,
                restSeconds:
                  typeof exercise.restSeconds === 'number' && Number.isFinite(exercise.restSeconds)
                    ? exercise.restSeconds
                    : undefined,
              }))
          : [],
        createdAt:
          typeof template.createdAt === 'string' && template.createdAt.trim()
            ? template.createdAt
            : createdAt,
        updatedAt:
          typeof template.updatedAt === 'string' && template.updatedAt.trim()
            ? template.updatedAt
            : updatedAt,
      })),
    createdAt,
    updatedAt,
    archivedAt:
      typeof rawValue.archivedAt === 'string' && rawValue.archivedAt.trim()
        ? rawValue.archivedAt
        : undefined,
  }
}

function normalizeWorkoutSession(rawValue: unknown): WorkoutSession | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const programId =
    typeof rawValue.programId === 'string' && rawValue.programId.trim() ? rawValue.programId.trim() : null
  const templateId =
    typeof rawValue.templateId === 'string' && rawValue.templateId.trim() ? rawValue.templateId.trim() : null
  const slotKey =
    typeof rawValue.slotKey === 'string' && rawValue.slotKey.trim() ? rawValue.slotKey.trim() : null
  const date = typeof rawValue.date === 'string' && rawValue.date.trim() ? rawValue.date.trim() : null
  const createdAt =
    typeof rawValue.createdAt === 'string' && rawValue.createdAt.trim() ? rawValue.createdAt : null
  const updatedAt =
    typeof rawValue.updatedAt === 'string' && rawValue.updatedAt.trim() ? rawValue.updatedAt : null
  const completedAt =
    typeof rawValue.completedAt === 'string' && rawValue.completedAt.trim() ? rawValue.completedAt : null
  const exercises = Array.isArray(rawValue.exercises) ? rawValue.exercises : null

  if (!id || !programId || !templateId || !slotKey || !date || !createdAt || !updatedAt || !completedAt || exercises === null) {
    return null
  }

  return {
    id,
    programId,
    templateId,
    slotKey,
    date,
    createdAt,
    updatedAt,
    completedAt,
    notes:
      typeof rawValue.notes === 'string' && rawValue.notes.trim() ? rawValue.notes.trim() : undefined,
    exercises: exercises
      .filter((exercise): exercise is Record<string, unknown> => isRecord(exercise))
      .map((exercise) => ({
        templateExerciseId:
          typeof exercise.templateExerciseId === 'string' ? exercise.templateExerciseId : crypto.randomUUID(),
        name: typeof exercise.name === 'string' ? exercise.name : 'Exercise',
        notes:
          typeof exercise.notes === 'string' && exercise.notes.trim() ? exercise.notes.trim() : undefined,
        sets: Array.isArray(exercise.sets)
          ? exercise.sets
              .filter((set): set is Record<string, unknown> => isRecord(set))
              .map((set) => ({
                reps:
                  typeof set.reps === 'number' && Number.isFinite(set.reps) ? set.reps : undefined,
                load:
                  typeof set.load === 'number' && Number.isFinite(set.load) ? set.load : undefined,
                seconds:
                  typeof set.seconds === 'number' && Number.isFinite(set.seconds) ? set.seconds : undefined,
                rir: typeof set.rir === 'number' && Number.isFinite(set.rir) ? set.rir : undefined,
              }))
          : [],
      })),
  }
}

function normalizeProgressionDecision(rawValue: unknown): ProgressionDecision | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const id = typeof rawValue.id === 'string' && rawValue.id.trim() ? rawValue.id.trim() : null
  const programId =
    typeof rawValue.programId === 'string' && rawValue.programId.trim() ? rawValue.programId.trim() : null
  const templateId =
    typeof rawValue.templateId === 'string' && rawValue.templateId.trim() ? rawValue.templateId.trim() : null
  const slotKey =
    typeof rawValue.slotKey === 'string' && rawValue.slotKey.trim() ? rawValue.slotKey.trim() : null
  const decisionType =
    rawValue.decisionType === 'increase_load' ||
    rawValue.decisionType === 'increase_reps' ||
    rawValue.decisionType === 'hold' ||
    rawValue.decisionType === 'decrease_load'
      ? rawValue.decisionType
      : null
  const reason = typeof rawValue.reason === 'string' && rawValue.reason.trim() ? rawValue.reason.trim() : null
  const createdAt =
    typeof rawValue.createdAt === 'string' && rawValue.createdAt.trim() ? rawValue.createdAt : null
  const basedOnSessionIds = Array.isArray(rawValue.basedOnSessionIds) ? rawValue.basedOnSessionIds : null
  const adjustments = Array.isArray(rawValue.adjustments) ? rawValue.adjustments : null

  if (!id || !programId || !templateId || !slotKey || !decisionType || !reason || !createdAt || !basedOnSessionIds || !adjustments) {
    return null
  }

  return {
    id,
    programId,
    templateId,
    slotKey,
    decisionType,
    reason,
    createdAt,
    basedOnSessionIds: basedOnSessionIds.filter((sessionId): sessionId is string => typeof sessionId === 'string'),
    adjustments: adjustments
      .filter((adjustment): adjustment is Record<string, unknown> => isRecord(adjustment))
      .map((adjustment) => ({
        templateExerciseId:
          typeof adjustment.templateExerciseId === 'string'
            ? adjustment.templateExerciseId
            : crypto.randomUUID(),
        loadDelta:
          typeof adjustment.loadDelta === 'number' && Number.isFinite(adjustment.loadDelta)
            ? adjustment.loadDelta
            : undefined,
        repDelta:
          typeof adjustment.repDelta === 'number' && Number.isFinite(adjustment.repDelta)
            ? adjustment.repDelta
            : undefined,
      })),
  }
}

export function subscribeToWorkoutStorage(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadWorkoutPrograms(): WorkoutProgram[] {
  if (workoutProgramCache !== null) {
    return workoutProgramCache
  }

  workoutProgramCache = readArray(STORAGE_KEYS.programs, normalizeWorkoutProgram)
  return workoutProgramCache
}

export function loadWorkoutSessions(): WorkoutSession[] {
  if (workoutSessionCache !== null) {
    return workoutSessionCache
  }

  workoutSessionCache = readArray(STORAGE_KEYS.sessions, normalizeWorkoutSession)
  return workoutSessionCache
}

export function loadProgressionDecisions(): ProgressionDecision[] {
  if (progressionDecisionCache !== null) {
    return progressionDecisionCache
  }

  progressionDecisionCache = readArray(STORAGE_KEYS.decisions, normalizeProgressionDecision)
  return progressionDecisionCache
}

export function saveWorkoutPrograms(records: WorkoutProgram[]): ActionResult<void> {
  const result = persist(STORAGE_KEYS.programs, records, (nextRecords) => {
    workoutProgramCache = nextRecords
  })
  if (result.ok && FEATURE_FLAGS.encryptedSyncV2) {
    for (const record of records) {
      void enqueueEncryptedSyncEnvelope({
        recordKind: 'workout_programs',
        recordId: record.id,
        updatedAt: record.updatedAt,
        payload: record,
      })
    }
  }
  return result
}

export function saveWorkoutSessions(records: WorkoutSession[]): ActionResult<void> {
  const result = persist(STORAGE_KEYS.sessions, records, (nextRecords) => {
    workoutSessionCache = nextRecords
  })
  if (result.ok && FEATURE_FLAGS.encryptedSyncV2) {
    for (const record of records) {
      void enqueueEncryptedSyncEnvelope({
        recordKind: 'workout_sessions',
        recordId: record.id,
        updatedAt: record.updatedAt,
        payload: record,
      })
    }
  }
  return result
}

export function saveProgressionDecisions(records: ProgressionDecision[]): ActionResult<void> {
  const result = persist(STORAGE_KEYS.decisions, records, (nextRecords) => {
    progressionDecisionCache = nextRecords
  })
  if (result.ok && FEATURE_FLAGS.encryptedSyncV2) {
    for (const record of records) {
      void enqueueEncryptedSyncEnvelope({
        recordKind: 'progression_decisions',
        recordId: record.id,
        updatedAt: record.createdAt,
        payload: record,
      })
    }
  }
  return result
}

export function clearWorkoutStorageForTests(): void {
  workoutProgramCache = []
  workoutSessionCache = []
  progressionDecisionCache = []
  if (canUseStorage()) {
    getStorage()?.removeItem(STORAGE_KEYS.programs)
    getStorage()?.removeItem(STORAGE_KEYS.sessions)
    getStorage()?.removeItem(STORAGE_KEYS.decisions)
  }
  emitChange()
}
