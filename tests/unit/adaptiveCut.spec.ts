import { describe, expect, it } from 'vitest'
import { buildAdaptiveCutOutcome } from '../../src/domain/adaptiveCut'
import type {
  BodyProgressSnapshot,
  CheckInRecord,
  CoachingTargetSet,
  DietPhase,
  DietPhaseEvent,
  RecoveryReadiness,
  StrengthRetentionSnapshot,
  UserSettings,
} from '../../src/types'

const baseSettings: Pick<UserSettings, 'dailyStepTarget'> = {
  dailyStepTarget: 9000,
}

const baseTargets: CoachingTargetSet = {
  calorieTarget: 2000,
  proteinTarget: 180,
  carbTarget: 200,
  fatTarget: 60,
  dailyStepTarget: 9000,
}

const readinessGreen: RecoveryReadiness = {
  state: 'green',
  evaluatedDate: '2026-04-14',
  reasons: [],
  signals: [],
}

const readinessRed: RecoveryReadiness = {
  state: 'red',
  evaluatedDate: '2026-04-14',
  reasons: ['sleep debt'],
  signals: [],
}

const strengthStable: StrengthRetentionSnapshot = {
  anchorLiftTrend: 'flat',
  volumeFloorStatus: 'met',
  sessionCompletionRate7d: 100,
  strengthRetentionScore: 100,
}

const strengthRisk: StrengthRetentionSnapshot = {
  anchorLiftTrend: 'down',
  volumeFloorStatus: 'at_risk',
  sessionCompletionRate7d: 71,
  strengthRetentionScore: 58,
}

function makeCheckInRecord(
  weekEndDate: string,
  overrides: Partial<CheckInRecord> = {},
): CheckInRecord {
  return {
    id: `checkin:${weekEndDate}`,
    weekEndDate,
    weekStartDate: '2026-04-08',
    nextCheckInDate: '2026-04-21',
    priorWeekStartDate: '2026-04-01',
    priorWeekEndDate: '2026-04-07',
    goalMode: 'lose',
    targetWeeklyRatePercent: -0.5,
    actualWeeklyRatePercent: -0.1,
    avgCalories: 2000,
    avgProtein: 180,
    avgSteps: 9300,
    weeklyCardioMinutes: 120,
    stepAdherencePercent: 90,
    cardioAdherencePercent: 100,
    avgWeight: 198.5,
    priorAvgWeight: 198.7,
    recommendationReason: 'Base engine hold',
    recommendationExplanation: 'Base engine explanation',
    confidenceBand: 'high',
    confidenceScore: 88,
    decisionType: 'keep_targets',
    reasonCodes: ['rate_on_target'],
    blockedReasons: [],
    dataQuality: {
      score: 94,
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
    status: 'ready',
    createdAt: `${weekEndDate}T09:00:00.000Z`,
    updatedAt: `${weekEndDate}T09:00:00.000Z`,
    ...overrides,
  }
}

function makeWaistSnapshots(
  latestDate: string,
  latestWaist: number,
  compareDate: string,
  compareWaist: number,
): BodyProgressSnapshot[] {
  return [
    {
      id: `body-${latestDate}`,
      date: latestDate,
      metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: latestWaist }],
      photos: [],
      createdAt: `${latestDate}T08:00:00.000Z`,
      updatedAt: `${latestDate}T08:00:00.000Z`,
    },
    {
      id: `body-${compareDate}`,
      date: compareDate,
      metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: compareWaist }],
      photos: [],
      createdAt: `${compareDate}T08:00:00.000Z`,
      updatedAt: `${compareDate}T08:00:00.000Z`,
    },
  ]
}

function makeDietPhase(type: DietPhase['type'], overrides: Partial<DietPhase> = {}): DietPhase {
  return {
    id: `${type}-phase`,
    type,
    status: 'active',
    startDate: '2026-04-01',
    plannedEndDate: '2026-04-30',
    createdAt: '2026-04-01T08:00:00.000Z',
    updatedAt: '2026-04-01T08:00:00.000Z',
    ...overrides,
  }
}

function makeDietPhaseEvent(
  type: DietPhaseEvent['type'],
  date: string,
  overrides: Partial<DietPhaseEvent> = {},
): DietPhaseEvent {
  return {
    id: `${type}-${date}`,
    phaseId: overrides.phaseId ?? 'phase-1',
    type,
    date,
    calorieTargetOverride: 2400,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    ...overrides,
  }
}

describe('adaptive cut verdict engine', () => {
  it('holds a confounded stall after a recent refeed spike with waist-down proof', () => {
    const current = makeCheckInRecord('2026-04-14')
    const prior = makeCheckInRecord('2026-04-07', {
      weekStartDate: '2026-04-01',
      nextCheckInDate: '2026-04-14',
      actualWeeklyRatePercent: -0.15,
    })

    const outcome = buildAdaptiveCutOutcome({
      enabled: true,
      current,
      prior,
      bodyProgressSnapshots: makeWaistSnapshots('2026-04-14', 79.5, '2026-03-31', 80.2),
      dietPhases: [],
      dietPhaseEvents: [makeDietPhaseEvent('refeed_day', '2026-04-14')],
      readiness: readinessGreen,
      strengthRetention: strengthStable,
      coachingDecisionHistory: [],
      settings: baseSettings,
      previousTargets: baseTargets,
      baseDecisionType: 'decrease_calories',
      baseReasonCodes: ['loss_slower_than_target'],
      baseRecommendationReason: 'Base engine cut harder',
      baseRecommendationExplanation: 'Base engine wanted a larger calorie cut.',
      baseProposedTargets: { ...baseTargets, calorieTarget: 1900, carbTarget: 175 },
    })

    expect(outcome?.reviewVerdict).toBe('confounded_stall')
    expect(outcome?.decisionType).toBe('hold_for_more_data')
    expect(outcome?.cutReviewCard?.lever).toBe('hold')
    expect(outcome?.reasonCodes).toContain('refeed_spike_expected')
    expect(outcome?.reasonCodes).toContain('waist_down_scale_confounded')
  })

  it('recommends raising steps first after two clean slow weeks', () => {
    const current = makeCheckInRecord('2026-04-14', {
      stepAdherencePercent: 90,
      avgSteps: 9200,
      actualWeeklyRatePercent: -0.12,
    })
    const prior = makeCheckInRecord('2026-04-07', {
      weekStartDate: '2026-04-01',
      nextCheckInDate: '2026-04-14',
      actualWeeklyRatePercent: -0.18,
      stepAdherencePercent: 91,
    })

    const outcome = buildAdaptiveCutOutcome({
      enabled: true,
      current,
      prior,
      bodyProgressSnapshots: makeWaistSnapshots('2026-04-14', 80.0, '2026-03-31', 80.0),
      dietPhases: [],
      dietPhaseEvents: [],
      readiness: readinessGreen,
      strengthRetention: strengthStable,
      coachingDecisionHistory: [],
      settings: baseSettings,
      previousTargets: baseTargets,
      baseDecisionType: 'decrease_calories',
      baseReasonCodes: ['loss_slower_than_target'],
      baseRecommendationReason: 'Base engine cut harder',
      baseRecommendationExplanation: 'Base engine wanted a calorie cut.',
      baseProposedTargets: { ...baseTargets, calorieTarget: 1900, carbTarget: 175 },
    })

    expect(outcome?.reviewVerdict).toBe('true_stall')
    expect(outcome?.decisionType).toBe('increase_steps')
    expect(outcome?.recommendedStepDelta).toBe(1500)
    expect(outcome?.recommendedStepTarget).toBe(10500)
    expect(outcome?.proposedTargets?.dailyStepTarget).toBe(10500)
    expect(outcome?.cutReviewCard?.lever).toBe('increase_steps')
  })

  it('holds when the stall is real but step adherence is below the activity floor', () => {
    const current = makeCheckInRecord('2026-04-14', {
      stepAdherencePercent: 70,
      avgSteps: 6300,
      actualWeeklyRatePercent: -0.12,
    })
    const prior = makeCheckInRecord('2026-04-07', {
      weekStartDate: '2026-04-01',
      nextCheckInDate: '2026-04-14',
      actualWeeklyRatePercent: -0.15,
      stepAdherencePercent: 72,
    })

    const outcome = buildAdaptiveCutOutcome({
      enabled: true,
      current,
      prior,
      bodyProgressSnapshots: makeWaistSnapshots('2026-04-14', 80.0, '2026-03-31', 80.0),
      dietPhases: [],
      dietPhaseEvents: [],
      readiness: readinessGreen,
      strengthRetention: strengthStable,
      coachingDecisionHistory: [],
      settings: { dailyStepTarget: 9000 },
      previousTargets: baseTargets,
      baseDecisionType: 'decrease_calories',
      baseReasonCodes: ['loss_slower_than_target'],
      baseRecommendationReason: 'Base engine cut harder',
      baseRecommendationExplanation: 'Base engine wanted a calorie cut.',
      baseProposedTargets: { ...baseTargets, calorieTarget: 1900, carbTarget: 175 },
    })

    expect(outcome?.reviewVerdict).toBe('true_stall')
    expect(outcome?.decisionType).toBe('hold_for_more_data')
    expect(outcome?.cutReviewCard?.lever).toBe('hold')
    expect(outcome?.cutReviewCard?.summary).toMatch(/activity floor/i)
  })

  it('routes to phase review when the step lever is exhausted and a high-carb day is scheduled', () => {
    const current = makeCheckInRecord('2026-04-14', {
      stepAdherencePercent: 95,
      actualWeeklyRatePercent: -0.14,
    })
    const prior = makeCheckInRecord('2026-04-07', {
      weekStartDate: '2026-04-01',
      nextCheckInDate: '2026-04-14',
      actualWeeklyRatePercent: -0.16,
      stepAdherencePercent: 94,
    })

    const outcome = buildAdaptiveCutOutcome({
      enabled: true,
      current,
      prior,
      bodyProgressSnapshots: makeWaistSnapshots('2026-04-14', 80.0, '2026-03-31', 80.0),
      dietPhases: [],
      dietPhaseEvents: [makeDietPhaseEvent('high_carb_day', '2026-04-20')],
      readiness: readinessGreen,
      strengthRetention: strengthStable,
      coachingDecisionHistory: [],
      settings: { dailyStepTarget: 12000 },
      previousTargets: { ...baseTargets, dailyStepTarget: 12000 },
      baseDecisionType: 'decrease_calories',
      baseReasonCodes: ['loss_slower_than_target'],
      baseRecommendationReason: 'Base engine cut harder',
      baseRecommendationExplanation: 'Base engine wanted a calorie cut.',
      baseProposedTargets: { ...baseTargets, calorieTarget: 1900, carbTarget: 175 },
    })

    expect(outcome?.reviewVerdict).toBe('true_stall')
    expect(outcome?.decisionType).toBe('review_phase_structure')
    expect(outcome?.cutReviewCard?.lever).toBe('review_phase_structure')
  })

  it('backs off when loss is too fast and recovery is red', () => {
    const current = makeCheckInRecord('2026-04-14', {
      actualWeeklyRatePercent: -0.9,
    })
    const prior = makeCheckInRecord('2026-04-07', {
      weekStartDate: '2026-04-01',
      nextCheckInDate: '2026-04-14',
      actualWeeklyRatePercent: -0.4,
    })

    const outcome = buildAdaptiveCutOutcome({
      enabled: true,
      current,
      prior,
      bodyProgressSnapshots: makeWaistSnapshots('2026-04-14', 80.4, '2026-03-31', 80.8),
      dietPhases: [makeDietPhase('psmf')],
      dietPhaseEvents: [],
      readiness: readinessRed,
      strengthRetention: strengthRisk,
      coachingDecisionHistory: [],
      settings: baseSettings,
      previousTargets: baseTargets,
      baseDecisionType: 'decrease_calories',
      baseReasonCodes: ['loss_slower_than_target'],
      baseRecommendationReason: 'Base engine cut harder',
      baseRecommendationExplanation: 'Base engine wanted a calorie cut.',
      baseProposedTargets: { ...baseTargets, calorieTarget: 1900, carbTarget: 175 },
    })

    expect(outcome?.reviewVerdict).toBe('too_fast_with_risk')
    expect(outcome?.decisionType).toBe('hold_for_more_data')
    expect(outcome?.cutReviewCard?.lever).toBe('diet_break')
  })
})
