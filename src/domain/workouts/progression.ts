import type { ProgressionDecision, WorkoutSession, WorkoutTemplate } from '../../types'

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function isWorkoutProgressionReady(
  sessions: WorkoutSession[],
  template: Pick<WorkoutTemplate, 'slotKey' | 'id'>,
): boolean {
  const qualifyingSessions = sessions.filter(
    (session) =>
      session.templateId === template.id &&
      session.slotKey === template.slotKey &&
      session.exercises.every((exercise) => exercise.sets.length > 0),
  )

  return qualifyingSessions.length >= 2
}

export function buildProgressionDecision(input: {
  programId: string
  template: WorkoutTemplate
  sessions: WorkoutSession[]
  createdAt?: string
}): ProgressionDecision | null {
  const qualifyingSessions = input.sessions
    .filter(
      (session) =>
        session.templateId === input.template.id &&
        session.slotKey === input.template.slotKey &&
        session.exercises.every((exercise) => exercise.sets.length > 0),
    )
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 2)

  if (qualifyingSessions.length < 2) {
    return null
  }

  const adjustments = input.template.exercises.map((exercise) => {
    const recentLoads = qualifyingSessions.flatMap((session) =>
      session.exercises
        .filter((sessionExercise) => sessionExercise.templateExerciseId === exercise.id)
        .flatMap((sessionExercise) =>
          sessionExercise.sets
            .map((set) => set.load)
            .filter((load): load is number => typeof load === 'number' && Number.isFinite(load)),
        ),
    )
    const recentReps = qualifyingSessions.flatMap((session) =>
      session.exercises
        .filter((sessionExercise) => sessionExercise.templateExerciseId === exercise.id)
        .flatMap((sessionExercise) =>
          sessionExercise.sets
            .map((set) => set.reps)
            .filter((reps): reps is number => typeof reps === 'number' && Number.isFinite(reps)),
        ),
    )

    const averageLoad = average(recentLoads)
    const averageReps = average(recentReps)
    const targetLoad = exercise.targetLoad ?? averageLoad ?? 0
    const repDelta = averageReps !== null && averageReps >= exercise.targetReps ? 1 : 0
    const loadDelta =
      averageLoad !== null && averageReps !== null && averageReps >= exercise.targetReps
        ? Math.max(2.5, Math.round(targetLoad * 0.025 * 10) / 10)
        : undefined

    return {
      templateExerciseId: exercise.id,
      loadDelta,
      repDelta,
    }
  })

  const hasLoadIncrease = adjustments.some((adjustment) => typeof adjustment.loadDelta === 'number')
  const hasRepIncrease = adjustments.some((adjustment) => (adjustment.repDelta ?? 0) > 0)

  return {
    id: crypto.randomUUID(),
    programId: input.programId,
    templateId: input.template.id,
    slotKey: input.template.slotKey,
    decisionType: hasLoadIncrease ? 'increase_load' : hasRepIncrease ? 'increase_reps' : 'hold',
    reason: hasLoadIncrease
      ? 'Recent sessions met the current rep target with complete set data.'
      : hasRepIncrease
        ? 'Recent sessions support a small rep increase before load moves.'
        : 'Current performance does not justify a progression change yet.',
    basedOnSessionIds: qualifyingSessions.map((session) => session.id),
    createdAt: input.createdAt ?? new Date().toISOString(),
    adjustments,
  }
}
