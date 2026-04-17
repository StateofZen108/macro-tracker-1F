import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type {
  ActionResult,
  AppActionError,
  CutDayPlan,
  ProgressionDecision,
  RecoverySeverity,
  RecoveryReadiness,
  WorkoutAnalyticsRange,
  WorkoutDashboardSnapshot,
  WorkoutExerciseDrilldown,
  WorkoutExerciseTrend,
  WorkoutGoal,
  WorkoutHabitSnapshot,
  WorkoutMuscleGroup,
  WorkoutProgram,
  WorkoutRecordSnapshot,
  WorkoutSession,
  WorkoutTemplate,
} from '../types'
import { buildProgressionDecision } from '../domain/workouts/progression'
import { buildStrengthRetentionSnapshot, buildWorkoutActionCard } from '../domain/personalCut'
import { addDays, getTodayDateKey } from '../utils/dates'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import {
  loadProgressionDecisions,
  loadWorkoutPrograms,
  loadWorkoutSessions,
  saveProgressionDecisions,
  saveWorkoutPrograms,
  saveWorkoutSessions,
  subscribeToWorkoutStorage,
} from '../utils/storage/workouts'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sumSessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sessionSum, exercise) =>
      sessionSum +
      exercise.sets.reduce((setSum, set) => setSum + (set.load ?? 0) * (set.reps ?? 0), 0),
    0,
  )
}

function sumSessionSets(session: WorkoutSession): number {
  return session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0)
}

function resolveMuscleGroup(
  templateExercise: WorkoutTemplate['exercises'][number] | undefined,
  exerciseName: string,
): WorkoutMuscleGroup {
  if (templateExercise?.muscleGroup) {
    return templateExercise.muscleGroup
  }

  const normalized = exerciseName.trim().toLowerCase()
  if (
    normalized.includes('run') ||
    normalized.includes('bike') ||
    normalized.includes('walk') ||
    normalized.includes('row erg') ||
    normalized.includes('cardio')
  ) {
    return 'cardio'
  }

  return 'full_body'
}

function resolveHabitStatus(current: number, target: number): WorkoutHabitSnapshot['status'] {
  if (target <= 0) {
    return 'met'
  }

  if (current >= target) {
    return 'met'
  }

  if (current >= target * 0.6) {
    return 'at_risk'
  }

  return 'missed'
}

function estimateOneRepMax(load: number, reps: number): number {
  if (!Number.isFinite(load) || !Number.isFinite(reps) || load <= 0 || reps <= 0) {
    return 0
  }

  return load * (1 + reps / 30)
}

function filterSessionsByRange(
  sessions: WorkoutSession[],
  range: WorkoutAnalyticsRange,
  today: string,
): WorkoutSession[] {
  if (range === 'all') {
    return sessions
  }

  const offset =
    range === '7d' ? -6 : range === '30d' ? -29 : range === '90d' ? -89 : -364
  const start = addDays(today, offset)
  return sessions.filter((session) => session.date >= start && session.date <= today)
}

function buildRecentRecords(input: {
  sessions: WorkoutSession[]
  templateExerciseById: Map<string, WorkoutTemplate['exercises'][number]>
}): WorkoutRecordSnapshot[] {
  const bestByMetric = new Map<string, WorkoutRecordSnapshot>()

  for (const session of input.sessions) {
    for (const exercise of session.exercises) {
      const templateExercise = input.templateExerciseById.get(exercise.templateExerciseId)
      const exerciseId = templateExercise?.customExerciseId ?? exercise.templateExerciseId
      const label = templateExercise?.name ?? exercise.name
      const totalVolume = exercise.sets.reduce(
        (sum, set) => sum + (set.load ?? 0) * (set.reps ?? 0),
        0,
      )
      const totalReps = exercise.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)
      const estimated1rm = exercise.sets.reduce(
        (maxValue, set) => Math.max(maxValue, estimateOneRepMax(set.load ?? 0, set.reps ?? 0)),
        0,
      )

      const candidates: WorkoutRecordSnapshot[] = [
        {
          id: `${exerciseId}-volume`,
          exerciseId,
          label: `${label} volume`,
          metric: 'volume',
          value: Math.round(totalVolume),
          unit: 'volume',
          achievedAt: session.completedAt,
        },
        {
          id: `${exerciseId}-reps`,
          exerciseId,
          label: `${label} reps`,
          metric: 'reps',
          value: totalReps,
          unit: 'reps',
          achievedAt: session.completedAt,
        },
        {
          id: `${exerciseId}-estimated_1rm`,
          exerciseId,
          label: `${label} est. 1RM`,
          metric: 'estimated_1rm',
          value: Math.round(estimated1rm * 10) / 10,
          unit: 'kg',
          achievedAt: session.completedAt,
        },
      ]

      for (const candidate of candidates) {
        const key = `${candidate.exerciseId}:${candidate.metric}`
        const currentBest = bestByMetric.get(key)
        if (!currentBest || candidate.value >= currentBest.value) {
          bestByMetric.set(key, candidate)
        }
      }
    }
  }

  return [...bestByMetric.values()]
    .filter((record) => record.value > 0)
    .sort((left, right) => {
      if (right.achievedAt !== left.achievedAt) {
        return right.achievedAt.localeCompare(left.achievedAt)
      }
      return right.value - left.value
    })
    .slice(0, 8)
}

function buildExerciseDrilldown(input: {
  sessions: WorkoutSession[]
  templateExerciseById: Map<string, WorkoutTemplate['exercises'][number]>
  range: WorkoutAnalyticsRange
  exerciseId?: string
}): WorkoutExerciseDrilldown | undefined {
  if (!input.exerciseId) {
    return undefined
  }

  let name = 'Exercise'
  let totalVolume = 0
  let totalReps = 0
  let totalSets = 0
  let heaviestLoad = 0
  let sessionCount = 0

  for (const session of input.sessions) {
    for (const exercise of session.exercises) {
      const templateExercise = input.templateExerciseById.get(exercise.templateExerciseId)
      const resolvedExerciseId = templateExercise?.customExerciseId ?? exercise.templateExerciseId
      if (resolvedExerciseId !== input.exerciseId) {
        continue
      }

      name = templateExercise?.name ?? exercise.name
      sessionCount += 1
      totalSets += exercise.sets.length
      totalReps += exercise.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)
      totalVolume += exercise.sets.reduce(
        (sum, set) => sum + (set.load ?? 0) * (set.reps ?? 0),
        0,
      )
      heaviestLoad = Math.max(
        heaviestLoad,
        exercise.sets.reduce((maxValue, set) => Math.max(maxValue, set.load ?? 0), 0),
      )
    }
  }

  if (sessionCount === 0) {
    return undefined
  }

  return {
    exerciseId: input.exerciseId,
    name,
    range: input.range,
    totalVolume: Math.round(totalVolume),
    totalReps,
    totalSets,
    heaviestLoad,
    sessionCount,
  }
}

function buildSnapshot(input: {
  programs: WorkoutProgram[]
  sessions: WorkoutSession[]
  decisions: ProgressionDecision[]
  recoverySeverity: RecoverySeverity | undefined
  readiness?: RecoveryReadiness | null
  cutDayPlan?: CutDayPlan | null
  stepRecords?: Array<{ date: string; steps?: number }>
  activeGymProfileId?: string
}): WorkoutDashboardSnapshot {
  const defaultRange: WorkoutAnalyticsRange = '30d'
  const today = getTodayDateKey()
  const sessionsInDefaultRange = filterSessionsByRange(input.sessions, defaultRange, today)
  const activePrograms = input.programs.filter((program) => !program.archivedAt)
  const windowStart = addDays(today, -6)
  const recentSessions = input.sessions.filter((session) => session.date >= windowStart)
  const latestCompletedAt = [...input.sessions]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .at(0)?.completedAt
  const templateExerciseById = new Map(
    input.programs.flatMap((program) =>
      program.templates.flatMap((template) =>
        template.exercises.map((exercise) => [exercise.id, exercise] as const),
      ),
    ),
  )

  const muscleGroupMap = new Map<WorkoutMuscleGroup, number>()
  const trendMap = new Map<string, WorkoutExerciseTrend>()
  for (const session of input.sessions) {
    for (const exercise of session.exercises) {
      const templateExercise = templateExerciseById.get(exercise.templateExerciseId)
      const muscleGroup = resolveMuscleGroup(templateExercise, exercise.name)
      const totalVolume = exercise.sets.reduce(
        (sum, set) => sum + (set.load ?? 0) * (set.reps ?? 0),
        0,
      )
      const totalReps = exercise.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)
      const heaviestLoad = exercise.sets.reduce((maxLoad, set) => Math.max(maxLoad, set.load ?? 0), 0)

      if (session.date >= windowStart) {
        muscleGroupMap.set(
          muscleGroup,
          (muscleGroupMap.get(muscleGroup) ?? 0) + exercise.sets.length,
        )
      }

      const trendId = templateExercise?.customExerciseId ?? exercise.templateExerciseId
      const currentTrend = trendMap.get(trendId)
      trendMap.set(trendId, {
        id: trendId,
        name: templateExercise?.name ?? exercise.name,
        muscleGroup,
        sessionCount: (currentTrend?.sessionCount ?? 0) + 1,
        totalVolume: (currentTrend?.totalVolume ?? 0) + totalVolume,
        totalReps: (currentTrend?.totalReps ?? 0) + totalReps,
        heaviestLoad: Math.max(currentTrend?.heaviestLoad ?? 0, heaviestLoad),
        lastCompletedAt:
          currentTrend?.lastCompletedAt && currentTrend.lastCompletedAt > session.completedAt
            ? currentTrend.lastCompletedAt
            : session.completedAt,
      })
    }
  }

  const plannedSessionsTarget = Math.max(
    activePrograms.reduce((sum, program) => sum + program.templates.length, 0),
    1,
  )
  const plannedSetTarget = activePrograms.reduce(
    (programSum, program) =>
      programSum +
      program.templates.reduce(
        (templateSum, template) =>
          templateSum +
          template.exercises.reduce((exerciseSum, exercise) => exerciseSum + Math.max(exercise.targetSets, 0), 0),
        0,
      ),
    0,
  )
  const recentStepRecords = (input.stepRecords ?? []).filter((record) => record.date >= windowStart)
  const steps7d = recentStepRecords.reduce((sum, record) => sum + (record.steps ?? 0), 0)

  const habits: WorkoutHabitSnapshot[] = [
    {
      id: 'weekly_sessions',
      label: 'Weekly sessions',
      current: recentSessions.length,
      target: plannedSessionsTarget,
      status: resolveHabitStatus(recentSessions.length, plannedSessionsTarget),
    },
    {
      id: 'weekly_sets',
      label: 'Weekly set floor',
      current: recentSessions.reduce((sum, session) => sum + sumSessionSets(session), 0),
      target: plannedSetTarget,
      status: resolveHabitStatus(
        recentSessions.reduce((sum, session) => sum + sumSessionSets(session), 0),
        plannedSetTarget,
      ),
    },
    {
      id: 'decision_backlog',
      label: 'Pending decisions',
      current: input.decisions.length,
      target: 0,
      status: input.decisions.length === 0 ? 'met' : input.decisions.length <= 2 ? 'at_risk' : 'missed',
    },
  ]

  if (steps7d > 0) {
    habits.push({
      id: 'weekly_steps',
      label: 'Weekly steps',
      current: steps7d,
      target: 56000,
      status: resolveHabitStatus(steps7d, 56000),
    })
  }

  const weeklyTargetsProgress: WorkoutHabitSnapshot[] = [
    {
      id: 'target_sessions',
      label: 'Session target',
      current: recentSessions.length,
      target: plannedSessionsTarget,
      status: resolveHabitStatus(recentSessions.length, plannedSessionsTarget),
    },
    {
      id: 'target_sets',
      label: 'Set target',
      current: recentSessions.reduce((sum, session) => sum + sumSessionSets(session), 0),
      target: plannedSetTarget,
      status: resolveHabitStatus(
        recentSessions.reduce((sum, session) => sum + sumSessionSets(session), 0),
        plannedSetTarget,
      ),
    },
    {
      id: 'target_exercises',
      label: 'Exercise coverage',
      current: new Set(recentSessions.flatMap((session) => session.exercises.map((exercise) => exercise.templateExerciseId))).size,
      target: Math.max(
        activePrograms.reduce(
          (sum, program) => sum + program.templates.reduce((templateSum, template) => templateSum + template.exercises.length, 0),
          0,
        ),
        1,
      ),
      status: resolveHabitStatus(
        new Set(recentSessions.flatMap((session) => session.exercises.map((exercise) => exercise.templateExerciseId))).size,
        Math.max(
          activePrograms.reduce(
            (sum, program) =>
              sum + program.templates.reduce((templateSum, template) => templateSum + template.exercises.length, 0),
            0,
          ),
          1,
        ),
      ),
    },
  ]

  const recentRecords = buildRecentRecords({
    sessions: sessionsInDefaultRange,
    templateExerciseById,
  })
  const defaultExerciseId = recentRecords[0]?.exerciseId ?? [...trendMap.keys()][0]
  const exerciseDrilldown = buildExerciseDrilldown({
    sessions: sessionsInDefaultRange,
    templateExerciseById,
    range: defaultRange,
    exerciseId: defaultExerciseId,
  })

  const snapshot: WorkoutDashboardSnapshot = {
    activeProgramCount: activePrograms.length,
    completedSessionCount: input.sessions.length,
    completedSessionCount7d: recentSessions.length,
    totalSets7d: recentSessions.reduce((sum, session) => sum + sumSessionSets(session), 0),
    volumeLoad7d: Math.round(recentSessions.reduce((sum, session) => sum + sumSessionVolume(session), 0)),
    pendingDecisionCount: input.decisions.length,
    latestCompletedAt,
    strengthRetention: buildStrengthRetentionSnapshot({
      programs: input.programs,
      sessions: input.sessions,
      recoveryState: input.recoverySeverity,
    }),
    muscleGroupSetCounts: [...muscleGroupMap.entries()]
      .map(([muscleGroup, setCount7d]) => ({ muscleGroup, setCount7d }))
      .sort((left, right) => right.setCount7d - left.setCount7d),
    exerciseTrends: [...trendMap.values()]
      .sort((left, right) => {
        if ((right.lastCompletedAt ?? '') !== (left.lastCompletedAt ?? '')) {
          return (right.lastCompletedAt ?? '').localeCompare(left.lastCompletedAt ?? '')
        }

        return right.sessionCount - left.sessionCount
      })
      .slice(0, 8),
    habits,
    weeklyTargetsProgress,
    recentRecords,
    range: defaultRange,
    exerciseDrilldown,
    steps7d: steps7d || undefined,
    activeGymProfileId: input.activeGymProfileId,
  }

  snapshot.actionCard = buildWorkoutActionCard({
    readiness: input.readiness,
    strengthRetention: snapshot.strengthRetention,
    recentRecords: snapshot.recentRecords,
    sessionCompletionRate7d: snapshot.strengthRetention.sessionCompletionRate7d,
    cutDayPlan: input.cutDayPlan,
    today,
  })

  return snapshot
}

function guardProgressionDecision(
  decision: ProgressionDecision | null,
  snapshot: WorkoutDashboardSnapshot,
  recoverySeverity: RecoverySeverity | undefined,
): ProgressionDecision | null {
  if (!decision) {
    return null
  }

  const shouldHoldForRecovery =
    recoverySeverity === 'red' &&
    (decision.decisionType === 'increase_load' || decision.decisionType === 'increase_reps')
  if (shouldHoldForRecovery) {
    return {
      ...decision,
      decisionType: 'hold',
      reason: 'Recovery readiness is red, so progression is held for the next exposure.',
      adjustments: [],
    }
  }

  const shouldProtectStrength =
    snapshot.strengthRetention.anchorLiftTrend === 'down' &&
    (decision.decisionType === 'increase_load' || decision.decisionType === 'increase_reps')
  if (shouldProtectStrength) {
    return {
      ...decision,
      decisionType: 'hold',
      reason: 'Anchor-lift trend is slipping, so progression is held to protect strength during the cut.',
      adjustments: [],
    }
  }

  return decision
}

export function useWorkouts(input: {
  recoverySeverity?: RecoverySeverity
  readiness?: RecoveryReadiness | null
  cutDayPlan?: CutDayPlan | null
  stepRecords?: Array<{ date: string; steps?: number }>
  activeGymProfileId?: string
}) {
  const programs = useSyncExternalStore(subscribeToWorkoutStorage, loadWorkoutPrograms, loadWorkoutPrograms)
  const sessions = useSyncExternalStore(subscribeToWorkoutStorage, loadWorkoutSessions, loadWorkoutSessions)
  const decisions = useSyncExternalStore(
    subscribeToWorkoutStorage,
    loadProgressionDecisions,
    loadProgressionDecisions,
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  const snapshot = useMemo(
    () =>
      buildSnapshot({
        programs,
        sessions,
        decisions,
          recoverySeverity: input.recoverySeverity,
          readiness: input.readiness,
          cutDayPlan: input.cutDayPlan,
          stepRecords: input.stepRecords,
          activeGymProfileId: input.activeGymProfileId,
        }),
    [
      decisions,
        input.activeGymProfileId,
        input.cutDayPlan,
        input.readiness,
      input.recoverySeverity,
      input.stepRecords,
      programs,
      sessions,
    ],
  )

  const createProgram = useCallback(
      (inputProgram: {
        name: string
        goal: WorkoutGoal
        templateName: string
        slotKey: string
      defaultSets: number
      defaultReps: number
      defaultLoad?: number
      defaultRir?: number
      defaultRestSeconds?: number
        exerciseDefinitions: Array<{
          name: string
          muscleGroup?: WorkoutMuscleGroup
          equipment?: string[]
          customExerciseId?: string
        }>
        gymProfileId?: string
        preservationDefaults?: WorkoutProgram['preservationDefaults']
      }): ActionResult<WorkoutProgram> => {
      const now = new Date().toISOString()
      const templateId = crypto.randomUUID()
        const program: WorkoutProgram = {
          id: crypto.randomUUID(),
          name: inputProgram.name.trim(),
          goal: inputProgram.goal,
          gymProfileId: inputProgram.gymProfileId,
          preservationDefaults: inputProgram.preservationDefaults,
          createdAt: now,
        updatedAt: now,
        templates: [
          {
            id: templateId,
            programId: '',
            name: inputProgram.templateName.trim(),
            slotKey: inputProgram.slotKey.trim(),
            createdAt: now,
            updatedAt: now,
            exercises: inputProgram.exerciseDefinitions.map((exercise) => ({
              id: crypto.randomUUID(),
              name: exercise.name,
              muscleGroup: exercise.muscleGroup,
              equipment: exercise.equipment,
              customExerciseId: exercise.customExerciseId,
              targetSets: inputProgram.defaultSets,
              targetReps: inputProgram.defaultReps,
              targetLoad: inputProgram.defaultLoad,
              rir: inputProgram.defaultRir,
              restSeconds: inputProgram.defaultRestSeconds,
            })),
          },
        ],
      }
      program.templates = program.templates.map((template) => ({ ...template, programId: program.id }))

      const result = saveWorkoutPrograms([program, ...programs])
      setLastError(result.ok ? null : result.error)
      return result.ok ? ok(program) : (result as ActionResult<WorkoutProgram>)
    },
    [programs],
  )

  const updateProgramPreservationDefaults = useCallback(
    (
      programId: string,
      preservationDefaults: WorkoutProgram['preservationDefaults'],
    ): ActionResult<WorkoutProgram> => {
      const targetProgram = programs.find((program) => program.id === programId)
      if (!targetProgram) {
        return {
          ok: false,
          error: {
            code: 'programMissing',
            message: 'That workout program no longer exists.',
          },
        }
      }

      const updatedProgram: WorkoutProgram = {
        ...targetProgram,
        preservationDefaults,
        updatedAt: new Date().toISOString(),
      }
      const result = saveWorkoutPrograms([
        updatedProgram,
        ...programs.filter((program) => program.id !== programId),
      ])
      setLastError(result.ok ? null : result.error)
      return result.ok ? ok(updatedProgram) : (result as ActionResult<WorkoutProgram>)
    },
    [programs],
  )

  const logSession = useCallback(
    (inputSession: {
      program: WorkoutProgram
      template: WorkoutTemplate
      notes?: string
      date: string
      exercises: WorkoutSession['exercises']
    }): ActionResult<{ session: WorkoutSession; decision: ProgressionDecision | null }> => {
      const now = new Date().toISOString()
      const session: WorkoutSession = {
        id: crypto.randomUUID(),
        programId: inputSession.program.id,
        templateId: inputSession.template.id,
        slotKey: inputSession.template.slotKey,
        date: inputSession.date,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        notes: inputSession.notes?.trim() || undefined,
        exercises: inputSession.exercises,
      }

      const sessionResult = saveWorkoutSessions([session, ...sessions])
      if (!sessionResult.ok) {
        setLastError(sessionResult.error)
        return sessionResult as ActionResult<{ session: WorkoutSession; decision: ProgressionDecision | null }>
      }

      const nextSessions = [session, ...sessions]
      const decision = buildProgressionDecision({
        programId: inputSession.program.id,
        template: inputSession.template,
        sessions: nextSessions,
      })
      const guardedSnapshot = buildSnapshot({
        programs,
        sessions: nextSessions,
        decisions,
        recoverySeverity: input.recoverySeverity,
        readiness: input.readiness,
        stepRecords: input.stepRecords,
        activeGymProfileId: input.activeGymProfileId,
      })
      const guardedDecision = guardProgressionDecision(decision, guardedSnapshot, input.recoverySeverity)
      if (guardedDecision) {
        const decisionResult = saveProgressionDecisions([guardedDecision, ...decisions])
        if (!decisionResult.ok) {
          setLastError(decisionResult.error)
          return decisionResult as ActionResult<{
            session: WorkoutSession
            decision: ProgressionDecision | null
          }>
        }

        void recordDiagnosticsEvent({
          eventType: 'workouts_v1_progression_applied',
          severity: 'info',
          scope: 'diagnostics',
          recordKey: guardedDecision.id,
          message: 'A deterministic workout progression decision was generated.',
          payload: {
            programId: inputSession.program.id,
            templateId: inputSession.template.id,
            decisionType: guardedDecision.decisionType,
          },
        })
      }

      setLastError(null)
      return ok({ session, decision: guardedDecision ?? null })
    },
    [
      decisions,
      input.activeGymProfileId,
      input.readiness,
      input.recoverySeverity,
      input.stepRecords,
      programs,
      sessions,
    ],
  )

  return {
    programs,
    sessions,
    decisions,
    snapshot,
    createProgram,
    updateProgramPreservationDefaults,
    logSession,
    lastError,
  }
}
