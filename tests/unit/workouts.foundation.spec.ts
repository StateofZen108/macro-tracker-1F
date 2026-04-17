import { describe, expect, it } from 'vitest'
import type { WorkoutProgram, WorkoutSession, WorkoutTemplate } from '../../src/types'
import { buildProgressionDecision, isWorkoutProgressionReady } from '../../src/domain/workouts/progression'
import { loadProgressionDecisions, saveProgressionDecisions, saveWorkoutPrograms, saveWorkoutSessions } from '../../src/utils/storage/workouts'

function buildTemplate(overrides?: Partial<WorkoutTemplate>): WorkoutTemplate {
  return {
    id: overrides?.id ?? 'template-1',
    programId: overrides?.programId ?? 'program-1',
    name: overrides?.name ?? 'Upper A',
    slotKey: overrides?.slotKey ?? 'upper-a',
    exercises: overrides?.exercises ?? [
      {
        id: 'exercise-1',
        name: 'Bench Press',
        targetSets: 3,
        targetReps: 8,
        targetLoad: 100,
      },
    ],
    createdAt: overrides?.createdAt ?? '2026-04-16T08:00:00.000Z',
    updatedAt: overrides?.updatedAt ?? '2026-04-16T08:00:00.000Z',
  }
}

function buildProgram(template: WorkoutTemplate): WorkoutProgram {
  return {
    id: 'program-1',
    name: 'Preservation',
    goal: 'strength_preservation',
    templates: [template],
    createdAt: '2026-04-16T08:00:00.000Z',
    updatedAt: '2026-04-16T08:00:00.000Z',
  }
}

function buildSession(overrides: Partial<WorkoutSession> & Pick<WorkoutSession, 'id' | 'date' | 'completedAt'>): WorkoutSession {
  return {
    id: overrides.id,
    programId: overrides.programId ?? 'program-1',
    templateId: overrides.templateId ?? 'template-1',
    slotKey: overrides.slotKey ?? 'upper-a',
    date: overrides.date,
    createdAt: overrides.createdAt ?? `${overrides.date}T08:00:00.000Z`,
    updatedAt: overrides.updatedAt ?? `${overrides.date}T08:00:00.000Z`,
    completedAt: overrides.completedAt,
    exercises: overrides.exercises ?? [
      {
        templateExerciseId: 'exercise-1',
        name: 'Bench Press',
        sets: [
          { reps: 8, load: 100 },
          { reps: 8, load: 100 },
          { reps: 8, load: 100 },
        ],
      },
    ],
  }
}

describe('workouts foundation', () => {
  it('creates a progression decision after two qualifying sessions', () => {
    const template = buildTemplate()
    const sessions = [
      buildSession({ id: 'session-1', date: '2026-04-14', completedAt: '2026-04-14T09:00:00.000Z' }),
      buildSession({ id: 'session-2', date: '2026-04-16', completedAt: '2026-04-16T09:00:00.000Z' }),
    ]

    expect(isWorkoutProgressionReady(sessions, template)).toBe(true)

    const decision = buildProgressionDecision({
      programId: 'program-1',
      template,
      sessions,
      createdAt: '2026-04-16T10:00:00.000Z',
    })

    expect(decision).not.toBeNull()
    expect(decision?.decisionType).toBe('increase_load')
    expect(decision?.basedOnSessionIds).toEqual(['session-2', 'session-1'])
  })

  it('persists workout programs, sessions, and progression decisions locally', () => {
    const template = buildTemplate()
    const program = buildProgram(template)
    const sessions = [
      buildSession({ id: 'session-1', date: '2026-04-14', completedAt: '2026-04-14T09:00:00.000Z' }),
      buildSession({ id: 'session-2', date: '2026-04-16', completedAt: '2026-04-16T09:00:00.000Z' }),
    ]
    const decision = buildProgressionDecision({ programId: program.id, template, sessions })

    expect(saveWorkoutPrograms([program]).ok).toBe(true)
    expect(saveWorkoutSessions(sessions).ok).toBe(true)
    expect(saveProgressionDecisions(decision ? [decision] : []).ok).toBe(true)
    expect(loadProgressionDecisions()).toHaveLength(1)
  })
})
