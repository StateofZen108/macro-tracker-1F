import { describe, expect, it } from 'vitest'
import {
  buildBodyProgressQuickCompare,
  buildCoachInterventionCards,
  buildMorningPhoneSnapshot,
  buildRecoveryReadiness,
  buildStrengthRetentionSnapshot,
  buildWorkoutActionCard,
} from '../../src/domain/personalCut'
import type {
  BodyProgressSnapshot,
  CheckInRecord,
  GarminModifierRecord,
  RecoveryReadiness,
  GarminWorkoutSummary,
  WeightEntry,
  WorkoutProgram,
  WorkoutSession,
} from '../../src/types'

function makeModifierRecord(
  date: string,
  overrides: Partial<GarminModifierRecord> = {},
): GarminModifierRecord {
  return {
    id: `modifier-${date}-${overrides.steps ?? 0}`,
    provider: 'garmin',
    date,
    steps: 8000,
    sleepMinutes: 450,
    restingHeartRate: 54,
    activeCalories: 300,
    derivedCardioMinutes: 20,
    sourceUpdatedAt: `${date}T07:00:00.000Z`,
    importedAt: `${date}T07:05:00.000Z`,
    ...overrides,
  }
}

function makeWorkoutSummary(
  date: string,
  overrides: Partial<GarminWorkoutSummary> = {},
): GarminWorkoutSummary {
  return {
    id: `workout-${date}`,
    provider: 'garmin',
    date,
    workoutName: 'Lift',
    durationMinutes: 55,
    activeCalories: 350,
    averageHeartRate: 128,
    sourceUpdatedAt: `${date}T09:00:00.000Z`,
    importedAt: `${date}T09:05:00.000Z`,
    ...overrides,
  }
}

function makeProgram(): WorkoutProgram {
  return {
    id: 'program-1',
    name: 'Cut block',
    goal: 'strength_preservation',
    createdAt: '2026-04-01T09:00:00.000Z',
    updatedAt: '2026-04-16T09:00:00.000Z',
    templates: [
      {
        id: 'template-1',
        programId: 'program-1',
        name: 'Day A',
        slotKey: 'day-a',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-16T09:00:00.000Z',
        exercises: [
          {
            id: 'exercise-1',
            name: 'Squat',
            targetSets: 3,
            targetReps: 5,
            targetLoad: 140,
          },
        ],
      },
    ],
  }
}

function makeSession(
  date: string,
  load: number,
  reps = 5,
): WorkoutSession {
  return {
    id: `session-${date}-${load}`,
    programId: 'program-1',
    templateId: 'template-1',
    slotKey: 'day-a',
    date,
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    completedAt: `${date}T19:00:00.000Z`,
    exercises: [
      {
        templateExerciseId: 'exercise-1',
        name: 'Squat',
        sets: [
          {
            reps,
            load,
          },
          {
            reps,
            load: load - 10,
          },
        ],
      },
    ],
  }
}

function makeReadiness(
  evaluatedDate: string,
  state: 'green' | 'yellow' | 'red',
): RecoveryReadiness {
  return {
    evaluatedDate,
    state,
    reasons: ['Recovery signals are within baseline and do not justify backing off today.'],
    signals: [
      {
        id: 'sleep',
        label: 'Sleep',
        status: 'baseline',
        detail: '450 min versus 450 min baseline',
      },
      {
        id: 'resting_heart_rate',
        label: 'Resting HR',
        status: 'baseline',
        detail: '54 bpm versus 54 bpm baseline',
      },
      {
        id: 'step_load',
        label: 'Step load',
        status: 'baseline',
        detail: '8000 steps on the prior day',
      },
      {
        id: 'workout_load',
        label: 'Workout load',
        status: 'baseline',
        detail: 'Lift stayed within normal load.',
      },
    ],
  }
}

function makeCheckIn(overrides: Partial<CheckInRecord> = {}): CheckInRecord {
  return {
    id: 'checkin-1',
    weekStartDate: '2026-04-09',
    weekEndDate: '2026-04-16',
    priorWeekStartDate: '2026-04-02',
    priorWeekEndDate: '2026-04-08',
    goalMode: 'lose',
    targetWeeklyRatePercent: -1,
    actualWeeklyRatePercent: -1.4,
    avgCalories: 1600,
    avgProtein: 180,
    avgSteps: 9000,
    weeklyCardioMinutes: 120,
    stepAdherencePercent: 100,
    cardioAdherencePercent: 100,
    avgWeight: 180,
    priorAvgWeight: 182.5,
    recommendationReason: 'Cut is moving quickly.',
    status: 'ready',
    createdAt: '2026-04-16T10:00:00.000Z',
    dataQuality: {
      score: 90,
      band: 'high',
      eligibleDays: 6,
      weighInDays: 6,
      explicitEligibleDays: 6,
      completeDays: 5,
      partialDays: 0,
      fastingDays: 1,
      unmarkedLoggedDays: 0,
      markedConfounderDays: 0,
      recentlyImported: false,
      recoveryIssueCount: 0,
    },
    adherence: {
      isAdequate: true,
      calorieDeviationPercent: 3,
      proteinHitRate: 100,
      stepAdherencePercent: 100,
      cardioAdherencePercent: 100,
      reasons: [],
    },
    ...overrides,
  }
}

function makeWeightEntry(date: string, weight: number): WeightEntry {
  return {
    id: `weight-${date}`,
    date,
    weight,
    unit: 'lb',
    createdAt: `${date}T06:00:00.000Z`,
  }
}

function makeBodyProgressSnapshot(
  date: string,
  overrides: Partial<BodyProgressSnapshot> = {},
): BodyProgressSnapshot {
  return {
    id: `progress-${date}`,
    date,
    metrics: [
      {
        key: 'waist',
        label: 'Waist',
        unit: 'cm',
        value: 82,
      },
      {
        key: 'hips',
        label: 'Hips',
        unit: 'cm',
        value: 98,
      },
    ],
    photos: [
      {
        id: `photo-${date}-front`,
        pose: 'front',
        fileName: `front-${date}.jpg`,
        contentType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,AAA',
        createdAt: `${date}T06:00:00.000Z`,
        updatedAt: `${date}T06:00:00.000Z`,
      },
    ],
    createdAt: `${date}T06:00:00.000Z`,
    updatedAt: `${date}T06:00:00.000Z`,
    ...overrides,
  }
}

describe('personal cut helpers', () => {
  it('marks readiness red when sleep and resting heart rate both degrade', () => {
    const baselineRecords = Array.from({ length: 10 }, (_, index) =>
      makeModifierRecord(`2026-04-${String(index + 1).padStart(2, '0')}`),
    )
    const readiness = buildRecoveryReadiness({
      today: '2026-04-16',
      modifierRecords: [
        ...baselineRecords,
        makeModifierRecord('2026-04-15', { steps: 12000 }),
        makeModifierRecord('2026-04-16', { sleepMinutes: 360, restingHeartRate: 61 }),
      ],
      workoutSummaries: [makeWorkoutSummary('2026-04-15')],
    })

    expect(readiness.state).toBe('red')
    expect(readiness.reasons.some((reason) => /sleep/i.test(reason))).toBe(true)
    expect(readiness.reasons.some((reason) => /heart rate/i.test(reason))).toBe(true)
  })

  it('builds a diet-break prompt when loss is too fast and readiness is red', () => {
    const readiness = buildRecoveryReadiness({
      today: '2026-04-16',
      modifierRecords: [
        ...Array.from({ length: 10 }, (_, index) =>
          makeModifierRecord(`2026-04-${String(index + 1).padStart(2, '0')}`),
        ),
        makeModifierRecord('2026-04-16', { sleepMinutes: 350, restingHeartRate: 62 }),
      ],
      workoutSummaries: [],
    })
    const strengthRetention = buildStrengthRetentionSnapshot({
      programs: [makeProgram()],
      sessions: [makeSession('2026-04-09', 145), makeSession('2026-04-16', 130)],
      recoveryState: readiness.state,
    })

    const cards = buildCoachInterventionCards({
      checkIn: makeCheckIn(),
      strengthRetention,
      readiness,
    })

    expect(cards[0]?.kind).toBe('diet_break_prompt')
  })

  it('marks strength retention down when the anchor lift declines and recent volume is light', () => {
    const snapshot = buildStrengthRetentionSnapshot({
      programs: [makeProgram()],
      sessions: [makeSession('2026-04-09', 145), makeSession('2026-04-16', 130)],
      recoveryState: 'yellow',
    })

    expect(snapshot.anchorLiftTrend).toBe('down')
    expect(snapshot.strengthRetentionScore).toBeLessThan(70)
  })

  it('builds a push action card when readiness is fresh and signals are clean', () => {
    const strengthRetention = {
      anchorLiftName: 'Squat',
      anchorLiftTrend: 'up',
      volumeFloorStatus: 'met',
      sessionCompletionRate7d: 100,
      strengthRetentionScore: 92,
    } as const

    const actionCard = buildWorkoutActionCard({
      readiness: makeReadiness('2026-04-16', 'green'),
      strengthRetention,
      recentRecords: [
        {
          id: 'record-1',
          label: 'Squat volume',
          metric: 'volume',
          value: 420,
          unit: 'volume',
          achievedAt: '2026-04-16T09:00:00.000Z',
          exerciseId: 'exercise-1',
        },
      ],
      sessionCompletionRate7d: 100,
      today: '2026-04-16',
      evaluatedAt: '2026-04-16T10:00:00.000Z',
    })

    expect(actionCard.action).toBe('push')
    expect(actionCard.readinessFresh).toBe(true)
    expect(actionCard.confidence).toBe('high')
    expect(actionCard.primaryCta).toBe('Open workouts and push today')
    expect(actionCard.mode).toBe('directive')
    expect(actionCard.reasonOrder).toEqual(['readiness', 'anchor_lift', 'records', 'completion'])
    expect(actionCard.source).toBe('computed')
    expect(actionCard.freshnessLabel).toBe('Fresh readiness')
    expect(actionCard.evidenceReasons).toEqual([
      'readiness_freshness',
      'anchor_lift_trend',
      'recent_records',
      'volume_floor',
      'completion_adherence',
    ])
  })

  it('falls back to hold when readiness is stale but local training evidence is soft', () => {
    const strengthRetention = {
      anchorLiftName: 'Squat',
      anchorLiftTrend: 'down',
      volumeFloorStatus: 'met',
      sessionCompletionRate7d: 100,
      strengthRetentionScore: 68,
    } as const

    const actionCard = buildWorkoutActionCard({
      readiness: makeReadiness('2026-04-10', 'green'),
      strengthRetention,
      recentRecords: [],
      sessionCompletionRate7d: 100,
      today: '2026-04-16',
      evaluatedAt: '2026-04-16T10:00:00.000Z',
    })

    expect(actionCard.action).toBe('hold')
    expect(actionCard.readinessFresh).toBe(false)
    expect(actionCard.confidence).toBe('medium')
    expect(actionCard.primaryCta).toBe('Open workouts and hold steady')
    expect(actionCard.stalenessReason).toBe('Latest Garmin readiness is older than 72 hours.')
    expect(actionCard.secondaryNote).toBe('Latest Garmin readiness is older than 72 hours.')
    expect(actionCard.reasons.some((reason) => /older than 72 hours/i.test(reason))).toBe(true)
    expect(actionCard.freshnessLabel).toBe('Stale readiness')
  })

  it('treats missing imported readiness signals as unavailable even when a green shell exists', () => {
    const strengthRetention = {
      anchorLiftName: 'Squat',
      anchorLiftTrend: 'down',
      volumeFloorStatus: 'met',
      sessionCompletionRate7d: 100,
      strengthRetentionScore: 68,
    } as const

    const actionCard = buildWorkoutActionCard({
      readiness: {
        evaluatedDate: '2026-04-16',
        state: 'green',
        reasons: ['Recovery signals are within baseline and do not justify backing off today.'],
        signals: [
          { id: 'sleep', label: 'Sleep', status: 'baseline', detail: 'No recent sleep import.' },
          {
            id: 'resting_heart_rate',
            label: 'Resting HR',
            status: 'baseline',
            detail: 'No recent resting-HR import.',
          },
          { id: 'step_load', label: 'Step load', status: 'baseline', detail: 'No prior-day step import.' },
          {
            id: 'workout_load',
            label: 'Workout load',
            status: 'baseline',
            detail: 'No recent Garmin workout summary.',
          },
        ],
      },
      strengthRetention,
      recentRecords: [],
      sessionCompletionRate7d: 100,
      today: '2026-04-16',
      evaluatedAt: '2026-04-16T10:00:00.000Z',
    })

    expect(actionCard.action).toBe('hold')
    expect(actionCard.readinessFresh).toBe(false)
    expect(actionCard.confidence).toBe('medium')
    expect(actionCard.primaryCta).toBe('Open workouts and hold steady')
    expect(actionCard.stalenessReason).toBe('No Garmin readiness snapshot is available yet.')
    expect(actionCard.reasons.some((reason) => /no garmin readiness snapshot/i.test(reason))).toBe(true)
    expect(actionCard.freshnessLabel).toBe('No readiness')
  })

  it('builds an on-track body progress story without a compare photo when waist is down', () => {
    const latestSnapshot = makeBodyProgressSnapshot('2026-04-16', {
      metrics: [
        {
          key: 'waist',
          label: 'Waist',
          unit: 'cm',
          value: 81,
        },
      ],
    })
    const compareSnapshot = makeBodyProgressSnapshot('2026-04-09', {
      metrics: [
        {
          key: 'waist',
          label: 'Waist',
          unit: 'cm',
          value: 83,
        },
      ],
      photos: [],
    })

    const compare = buildBodyProgressQuickCompare({
      latestSnapshot,
      compareSnapshot,
      pose: 'front',
      preset: '7d',
      focusedMetricKey: 'waist',
      weights: [makeWeightEntry('2026-04-16', 180), makeWeightEntry('2026-04-09', 182)],
    })

    expect(compare).toMatchObject({
      storyTone: 'on_track',
      waistTrendLabel: 'Waist down 2 cm',
      missingPhoto: true,
      galleryMode: 'latest_vs_compare',
      shareEnabled: false,
    })
    expect(compare?.storySummary).toMatch(/on track/i)
    expect(compare?.storySummary).toMatch(/photo compare is missing/i)
    expect(compare?.missingSignals).toContain('compare_photo')
    expect(compare?.nextActionPrompt).toMatch(/current cut settings/i)
    expect(compare?.captureChecklist).toHaveLength(4)
  })

  it('prioritizes back-off over repeat logging in the morning snapshot', () => {
    const snapshot = buildMorningPhoneSnapshot({
      meal: 'breakfast',
      repeatLog: {
        label: 'Meal-aware quick log',
        count: 3,
        meal: 'breakfast',
        source: 'saved_meal',
        entryContext: 'meal_slot',
        autocommitAction: 'saved_meal_review',
        preserveQueryOnBatchAdd: true,
      },
      workoutAction: {
        action: 'back_off',
        title: 'Back off today',
        summary: 'Recovery signals are flashing red.',
        reasons: ['Garmin readiness is red.'],
        reasonOrder: ['readiness', 'anchor_lift', 'records', 'completion'],
        source: 'computed',
        evaluatedAt: '2026-04-16T10:00:00.000Z',
        readinessFresh: true,
        confidence: 'medium',
        primaryCta: 'Open workouts and reduce today',
        mode: 'directive',
        fuelDirective: 'Keep pre-lift fuel normal while reducing training stress.',
        volumeDirective: 'Reduce load or set count to preserve recovery.',
        preservationRisk: 'high',
        evidenceReasons: ['readiness_freshness', 'anchor_lift_trend', 'recent_records', 'volume_floor', 'completion_adherence'],
        confidenceReason: 'Signals align strongly enough to trust the current call.',
        freshnessLabel: 'Fresh readiness',
      },
      bodyProgress: {
        preset: '7d',
        pose: 'front',
        compareMode: 'side_by_side',
        galleryMode: 'latest_vs_compare',
        latestDate: '2026-04-16',
        compareDate: '2026-04-09',
        missingPhoto: false,
        storyTone: 'watch',
        storySummary: '7-day progress needs a watch check.',
        missingSignals: [],
        scaleContext: 'neutral',
        captureConsistency: 'tight',
        captureChecklist: [],
        shareEnabled: false,
      },
      reviewBlockedCount: 2,
    })

    expect(snapshot?.primaryTarget).toBe('train')
    expect(snapshot?.primaryLabel).toBe('Back off today')
    expect(snapshot?.secondaryTarget).toBe('log')
    expect(snapshot?.blockingStatusIds).toContain('review_required_logging_blocked')
    expect(snapshot?.statusItems.map((item) => item.id)).toContain('review_required_logging_blocked')
  })

  it('prioritizes review queue when logging fast path is unavailable', () => {
    const snapshot = buildMorningPhoneSnapshot({
      meal: 'dinner',
      repeatLog: null,
      workoutAction: null,
      bodyProgress: null,
      reviewBlockedCount: 1,
    })

    expect(snapshot?.primaryTarget).toBe('review_queue')
    expect(snapshot?.secondaryTarget).toBeUndefined()
  })

  it('prioritizes repeat logging over push guidance in the morning snapshot', () => {
    const snapshot = buildMorningPhoneSnapshot({
      meal: 'lunch',
      repeatLog: {
        label: 'Meal-aware quick log',
        count: 2,
        meal: 'lunch',
        source: 'favorite',
        entryContext: 'meal_slot',
        autocommitAction: 'use_last_amount',
        preserveQueryOnBatchAdd: true,
      },
      workoutAction: {
        action: 'push',
        title: 'Push today',
        summary: 'Signals are clean.',
        reasons: ['Garmin readiness is green.'],
        reasonOrder: ['readiness', 'anchor_lift', 'records', 'completion'],
        source: 'computed',
        evaluatedAt: '2026-04-16T10:00:00.000Z',
        readinessFresh: true,
        confidence: 'high',
        primaryCta: 'Open workouts and push today',
        mode: 'directive',
        fuelDirective: 'Run the planned fuel around training.',
        volumeDirective: 'Keep planned volume intact.',
        preservationRisk: 'low',
        evidenceReasons: ['readiness_freshness', 'anchor_lift_trend', 'recent_records', 'volume_floor', 'completion_adherence'],
        confidenceReason: 'Signals align strongly enough to trust the current call.',
        freshnessLabel: 'Fresh readiness',
      },
      bodyProgress: null,
      reviewBlockedCount: 0,
    })

    expect(snapshot?.primaryTarget).toBe('log')
    expect(snapshot?.primaryLabel).toBe('Log lunch with one tap')
    expect(snapshot?.secondaryTarget).toBe('train')
    expect(snapshot?.confidence).toBe('high')
  })
})
