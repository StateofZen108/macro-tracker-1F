import { describe, expect, it } from 'vitest'
import {
  buildCutOsSnapshot,
  buildMacrofactorReplayReport,
  buildScaleLieVerdict,
} from '../../src/domain/cutOs'
import { addDays } from '../../src/utils/dates'
import type {
  BodyProgressSnapshot,
  CheckInRecord,
  FoodLogEntry,
  HistoryImportPreview,
  WeightEntry,
  WorkoutDashboardSnapshot,
} from '../../src/types'

const commandDate = '2026-04-14'

function buildLogWindow(days: number, endDate = commandDate): Record<string, FoodLogEntry[]> {
  return Object.fromEntries(
    Array.from({ length: days }, (_, index) => {
      const date = addDays(endDate, -(days - 1 - index))
      return [
        date,
        [
          {
            id: `log-${date}`,
            date,
            meal: 'breakfast',
            servings: 1,
            createdAt: `${date}T08:00:00.000Z`,
            snapshot: {
              name: 'Cut meal',
              servingSize: 1,
              servingUnit: 'entry',
              calories: 2000,
              protein: 180,
              carbs: 180,
              fat: 65,
              source: 'custom',
            },
          },
        ],
      ]
    }),
  )
}

function buildWeights(days: number, endDate = commandDate): WeightEntry[] {
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(endDate, -(days - 1 - index))
    return {
      id: `weight-${date}`,
      date,
      weight: 200 - index * 0.05,
      unit: 'lb',
      createdAt: `${date}T07:00:00.000Z`,
    }
  })
}

function buildCheckIn(
  weekEndDate: string,
  overrides: Partial<CheckInRecord> = {},
): CheckInRecord {
  return {
    id: `checkin-${weekEndDate}`,
    weekStartDate: addDays(weekEndDate, -6),
    weekEndDate,
    priorWeekStartDate: addDays(weekEndDate, -13),
    priorWeekEndDate: addDays(weekEndDate, -7),
    nextCheckInDate: addDays(weekEndDate, 7),
    goalMode: 'lose',
    targetWeeklyRatePercent: -0.5,
    actualWeeklyRatePercent: -0.1,
    avgCalories: 2000,
    avgProtein: 180,
    avgSteps: 9000,
    weeklyCardioMinutes: 120,
    stepAdherencePercent: 90,
    cardioAdherencePercent: 100,
    avgWeight: 199.8,
    priorAvgWeight: 199.9,
    recommendedStepTarget: 10500,
    recommendationReason: 'Raise steps before cutting calories.',
    confidenceBand: 'high',
    confidenceScore: 90,
    decisionType: 'increase_steps',
    status: 'ready',
    dataQuality: {
      score: 95,
      band: 'high',
      eligibleDays: 7,
      weighInDays: 6,
      explicitEligibleDays: 7,
      completeDays: 7,
      partialDays: 0,
      fastingDays: 0,
      unmarkedLoggedDays: 0,
      markedConfounderDays: 0,
      recentlyImported: false,
      recoveryIssueCount: 0,
    },
    adherence: {
      isAdequate: true,
      calorieDeviationPercent: 2,
      proteinHitRate: 95,
      stepAdherencePercent: 90,
      cardioAdherencePercent: 100,
      reasons: [],
    },
    confounders: {
      reasons: [],
      explicitMarkers: [],
      hasRecentImport: false,
      hasInterventionChange: false,
      hasRecoveryIssues: false,
      hasPartialLogging: false,
      hasMissingWeighIns: false,
      hasTravel: false,
      hasIllness: false,
      hasHighCalorieEvent: false,
      highCalorieEventDays: 0,
    },
    blockedReasons: [],
    reasonCodes: ['loss_slower_than_target'],
    createdAt: `${weekEndDate}T09:00:00.000Z`,
    updatedAt: `${weekEndDate}T09:00:00.000Z`,
    ...overrides,
  }
}

function buildBodySnapshots(latestWaist = 80, priorWaist = 80): BodyProgressSnapshot[] {
  return [
    {
      id: 'body-current',
      date: commandDate,
      metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: latestWaist }],
      photos: [],
      createdAt: `${commandDate}T08:00:00.000Z`,
      updatedAt: `${commandDate}T08:00:00.000Z`,
    },
    {
      id: 'body-prior',
      date: addDays(commandDate, -14),
      metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: priorWaist }],
      photos: [],
      createdAt: `${addDays(commandDate, -14)}T08:00:00.000Z`,
      updatedAt: `${addDays(commandDate, -14)}T08:00:00.000Z`,
    },
  ]
}

function buildWorkoutSnapshot(
  overrides: Partial<WorkoutDashboardSnapshot> = {},
): WorkoutDashboardSnapshot {
  return {
    activeProgramCount: 1,
    completedSessionCount: 4,
    completedSessionCount7d: 2,
    totalSets7d: 20,
    volumeLoad7d: 10_000,
    pendingDecisionCount: 0,
    strengthRetention: {
      anchorLiftName: 'Squat',
      anchorLiftTrend: 'flat',
      volumeFloorStatus: 'met',
      sessionCompletionRate7d: 100,
      strengthRetentionScore: 92,
    },
    muscleGroupSetCounts: [],
    exerciseTrends: [],
    habits: [],
    weeklyTargetsProgress: [],
    recentRecords: [],
    range: '30d',
    actionCard: {
      action: 'hold',
      title: 'Hold planned work',
      summary: 'Training is preserved.',
      reasons: ['Anchor lift is stable.'],
      reasonOrder: ['anchor_lift'],
      source: 'computed',
      evaluatedAt: `${commandDate}T09:00:00.000Z`,
      readinessFresh: true,
      confidence: 'high',
      primaryCta: 'Open workouts',
      mode: 'directive',
      fuelDirective: 'Hold fuel.',
      volumeDirective: 'Hold volume.',
      preservationRisk: 'low',
      evidenceReasons: ['anchor_lift_trend'],
      confidenceReason: 'Signals align.',
      freshnessLabel: 'Fresh readiness',
    },
    ...overrides,
  }
}

function buildBaseSnapshot(overrides: Parameters<typeof buildCutOsSnapshot>[0] extends infer Input ? Partial<NonNullable<Input>> : never = {}) {
  const currentCheckIn = buildCheckIn(commandDate)
  const priorCheckIn = buildCheckIn(addDays(commandDate, -7), {
    id: 'checkin-prior',
    actualWeeklyRatePercent: -0.12,
    avgWeight: 199.9,
    priorAvgWeight: 200,
  })

  return buildCutOsSnapshot({
    enabled: true,
    date: commandDate,
    logsByDate: buildLogWindow(14),
    weights: buildWeights(8),
    currentCheckIn,
    checkInHistory: [currentCheckIn, priorCheckIn],
    coachingDecisionHistory: [],
    bodyProgressSnapshots: buildBodySnapshots(),
    dietPhases: [],
    dietPhaseEvents: [],
    cutDayPlan: {
      date: commandDate,
      dayType: 'standard_cut_day',
      macroIntentLabel: 'Standard cut targets',
      trainingIntentLabel: 'Train normally',
      whyToday: 'No special phase event is active today.',
    },
    workoutSnapshot: buildWorkoutSnapshot(),
    foodReviewQueue: [],
    now: `${commandDate}T10:00:00.000Z`,
    ...overrides,
  })
}

describe('Cut OS command engine', () => {
  it('returns setup_required below the minimum history threshold', () => {
    const snapshot = buildBaseSnapshot({
      logsByDate: buildLogWindow(13),
      weights: buildWeights(8),
    })

    expect(snapshot?.command.state).toBe('setup_required')
    expect(snapshot?.diagnosis.verdict).toBe('setup_required')
  })

  it('raises steps before calories after two clean slow windows', () => {
    const snapshot = buildBaseSnapshot()

    expect(snapshot?.diagnosis.scaleVerdict).toBe('true_stall')
    expect(snapshot?.command.primaryAction).toMatch(/Raise steps/i)
    expect(snapshot?.command.cta.target).toBe('coach')
  })

  it('protects against a refeed scale spike without a harder-cut CTA', () => {
    const verdict = buildScaleLieVerdict({
      date: commandDate,
      minimumHistoryMet: true,
      currentCheckIn: buildCheckIn(commandDate, { avgWeight: 200.3, priorAvgWeight: 199.8 }),
      priorCheckIn: buildCheckIn(addDays(commandDate, -7)),
      bodyProgressSnapshots: buildBodySnapshots(80, 80),
      dietPhases: [],
      dietPhaseEvents: [
        {
          id: 'refeed-yesterday',
          phaseId: 'phase-1',
          type: 'refeed_day',
          date: addDays(commandDate, -1),
          calorieTargetOverride: 2600,
          createdAt: `${addDays(commandDate, -1)}T08:00:00.000Z`,
          updatedAt: `${addDays(commandDate, -1)}T08:00:00.000Z`,
        },
      ],
      foodTrustVerdict: 'trusted_for_coaching',
    })

    expect(verdict).toBe('expected_spike')
  })

  it('makes training protection the primary CTA when a stall and training leak collide', () => {
    const snapshot = buildBaseSnapshot({
      workoutSnapshot: buildWorkoutSnapshot({
        strengthRetention: {
          anchorLiftName: 'Squat',
          anchorLiftTrend: 'down',
          volumeFloorStatus: 'missed',
          sessionCompletionRate7d: 50,
          strengthRetentionScore: 45,
        },
        actionCard: {
          ...buildWorkoutSnapshot().actionCard!,
          preservationRisk: 'high',
        },
      }),
    })

    expect(snapshot?.diagnosis.scaleVerdict).toBe('true_stall')
    expect(snapshot?.diagnosis.trainingVerdict).toBe('leaking')
    expect(snapshot?.command.cta.target).toBe('train')
  })

  it('blocks coaching proof when food truth has an unresolved review item', () => {
    const snapshot = buildBaseSnapshot({
      foodReviewQueue: [
        {
          id: 'review-1',
          status: 'pending',
          source: 'barcode',
          title: 'Review barcode food',
          reason: 'Serving basis is unknown.',
          linkedEntryDate: commandDate,
          createdAt: `${commandDate}T09:00:00.000Z`,
          updatedAt: `${commandDate}T09:00:00.000Z`,
        },
      ],
    })

    expect(snapshot?.diagnosis.foodTrustVerdict).toBe('review_required')
    expect(snapshot?.command.state).toBe('blocked')
    expect(snapshot?.command.cta.target).toBe('review_food')
  })

  it('suppresses the surface when the paid gate is disabled', () => {
    expect(buildBaseSnapshot({ enabled: false })).toBeNull()
  })
})

describe('MacroFactor replay report', () => {
  it('summarizes imported MacroFactor history and local overlap', () => {
    const preview: HistoryImportPreview = {
      provider: 'macrofactor',
      fileKinds: ['macrofactor_food_rows', 'macrofactor_weights'],
      counts: {
        logEntries: 1,
        logDays: 1,
        weights: 1,
        skippedRows: 0,
        supportedFiles: 2,
        unsupportedFiles: 0,
      },
      dateRange: { start: '2026-04-13', end: '2026-04-14' },
      warnings: [],
      payload: {
        provider: 'macrofactor',
        foodLogEntries: buildLogWindow(1)['2026-04-14'],
        weights: buildWeights(1),
      },
    }

    const report = buildMacrofactorReplayReport({
      preview,
      localDates: new Set(['2026-04-14']),
    })

    expect(report?.reconstructedCommands).toHaveLength(1)
    expect(report?.decisionDiffs[0]?.localWins).toBe(true)
  })
})
