import { describe, expect, it } from 'vitest'
import { buildCoachProofAnswer } from '../../src/domain/coachProofAnswer'
import type { CoachContextSnapshot, CutOsSurfaceModel, UserSettings } from '../../src/types'

function contextSnapshot(): CoachContextSnapshot {
  return {
    generatedAt: '2026-04-28T08:00:00.000Z',
    selectedDate: '2026-04-28',
    goalMode: 'lose',
    settings: {
      calorieTarget: 2200,
      proteinTarget: 190,
      carbTarget: 180,
      fatTarget: 70,
      weightUnit: 'lb',
      goalMode: 'lose',
      coachingEnabled: true,
      askCoachEnabled: true,
      shareInterventionsWithCoach: true,
    } satisfies Pick<
      UserSettings,
      | 'calorieTarget'
      | 'proteinTarget'
      | 'carbTarget'
      | 'fatTarget'
      | 'weightUnit'
      | 'goalMode'
      | 'coachingEnabled'
      | 'askCoachEnabled'
      | 'shareInterventionsWithCoach'
    >,
    selectedDayStatus: 'complete',
    selectedDayTotals: { calories: 2110, protein: 188, carbs: 172, fat: 62, fiber: 24 },
    recentDailyCalories: [{ date: '2026-04-28', calories: 2110, protein: 188 }],
    recentWeights: [{ date: '2026-04-28', weight: 201.2, unit: 'lb' }],
    recentDayStates: [{ date: '2026-04-28', status: 'complete', updatedAt: '2026-04-28T07:00:00.000Z' }],
    recentInterventions: [],
    coachingInsight: {
      confidence: 'high',
      confidenceBand: 'high',
      confidenceScore: 85,
      goalMode: 'lose',
      isReady: true,
      reason: 'trend_usable',
      explanation: 'Trend is usable.',
      avgDailyCalories: 2110,
      avgDailyProtein: 188,
      estimatedTdee: 2900,
      recommendedCalories: 2200,
      allDayRecommendedCalories: 2200,
      eatingDayRecommendedCalories: 2200,
      weightChange: -1.1,
      weightChangeUnit: 'lb',
      adherenceTone: 'onTrack',
      windowDays: 14,
      weighInDays: 10,
      intakeDays: 14,
      completeDays: 13,
      partialDays: 1,
      fastingDays: 0,
      unmarkedLoggedDays: 0,
      eligibleDays: 13,
      confounders: [],
      calibrationPhase: 'calibrated',
      calibratedConfidencePercent: 85,
    },
    recentThreadSummary: [],
  }
}

function actionableSurface(): CutOsSurfaceModel {
  return {
    command: {
      date: '2026-04-28',
      state: 'command_issued',
      primaryAction: 'Increase steps before cutting calories',
      urgency: 'medium',
      confidence: 'high',
      diagnosisId: 'diagnosis-true-stall',
      proofIds: ['proof-scale', 'proof-training'],
      cta: { label: 'Apply +1200 steps', target: 'log', payload: { stepDelta: 1200 } },
      secondaryActions: [{ label: 'Hold calories', target: 'hold', reason: 'Protect training' }],
    },
    diagnosis: {
      verdict: 'true_stall',
      reasonCodes: ['two_clean_slow_windows'],
      blockedBy: [],
      scaleVerdict: 'true_stall',
      trainingVerdict: 'preserved',
      phaseVerdict: 'standard_cut',
      foodTrustVerdict: 'trusted_for_coaching',
    },
    proofs: [
      {
        id: 'proof-scale',
        source: 'scale',
        title: 'Two clean slow windows',
        summary: 'Scale rate was below target twice with waist flat.',
        evidenceWindow: { start: '2026-04-14', end: '2026-04-28' },
        strength: 'high',
        blocking: false,
      },
      {
        id: 'proof-training',
        source: 'training',
        title: 'Training preserved',
        summary: 'Anchor lifts stayed inside the preservation contract.',
        evidenceWindow: { start: '2026-04-21', end: '2026-04-28' },
        strength: 'medium',
        blocking: false,
      },
    ],
    setup: [],
    actionHistory: [
      {
        id: 'action-1',
        commandId: 'diagnosis-true-stall-2026-04-28',
        diagnosisId: 'diagnosis-true-stall',
        date: '2026-04-28',
        actionTarget: 'log',
        status: 'proposed',
        createdAt: '2026-04-28T08:05:00.000Z',
        updatedAt: '2026-04-28T08:05:00.000Z',
      },
    ],
    activeAction: null,
  }
}

describe('coach proof answer', () => {
  it('answers from the current Cut OS packet with proof citations and no hidden mutations', () => {
    const answer = buildCoachProofAnswer({
      question: 'What do I do today?',
      mode: 'standard',
      contextSnapshot: contextSnapshot(),
      cutOsSurface: actionableSurface(),
    })

    expect(answer.answerType).toBe('data-aware')
    expect(answer.answer).toContain('Cut OS proof packet')
    expect(answer.answer).toContain('Apply +1200 steps')
    expect(answer.answer).toContain('I am not changing targets')
    expect(answer.citations.map((citation) => citation.id)).toEqual(['proof-scale', 'proof-training'])
    expect(answer.proposals).toEqual([])
  })

  it('blocks fat-loss escalation when the Cut OS packet is missing', () => {
    const answer = buildCoachProofAnswer({
      question: 'Should I cut calories?',
      mode: 'deep',
      contextSnapshot: contextSnapshot(),
      cutOsSurface: null,
    })

    expect(answer.answerType).toBe('insufficient-data')
    expect(answer.answer).toContain('cannot issue a harder-cut recommendation')
    expect(answer.safetyFlags.some((flag) => flag.severity === 'blocked')).toBe(true)
    expect(answer.proposals).toEqual([])
  })

  it('adds a safety flag instead of citing missing proof IDs', () => {
    const surface = actionableSurface()
    surface.command.proofIds = ['proof-scale', 'proof-missing']

    const answer = buildCoachProofAnswer({
      question: 'Why this action?',
      mode: 'standard',
      contextSnapshot: contextSnapshot(),
      cutOsSurface: surface,
    })

    expect(answer.citations.map((citation) => citation.id)).toEqual(['proof-scale'])
    expect(answer.safetyFlags.map((flag) => flag.id)).toContain('cut-os-proof-citation-missing')
  })

  it('returns a repair answer instead of escalation when a daily guardrail is active', () => {
    const surface = actionableSurface()
    surface.dailyGuardrails = {
      date: '2026-04-28',
      commandId: '2026-04-28:diagnosis-true-stall',
      readiness: 'blocked',
      primaryGuardrail: {
        id: 'food-repair:2026-04-28',
        date: '2026-04-28',
        severity: 'block',
        source: 'food',
        title: 'Repair food trust before escalation',
        reason: 'One logged item cannot support coaching proof because serving basis is not verified.',
        cta: { label: 'Review food', route: 'log', targetId: 'entry-1' },
        proofIds: ['proof-food'],
      },
      guardrails: [],
      trustRepairs: [
        {
          id: 'trust-repair:2026-04-28:entry-1',
          logEntryId: 'entry-1',
          source: 'custom',
          reasonCode: 'missing_serving_basis',
          status: 'open',
          blockingCoachProof: true,
        },
      ],
      surfaceConsistency: {
        checkedAt: '2026-04-28T08:00:00.000Z',
        status: 'verified',
        surfaces: [],
        mismatchReasons: [],
      },
    }

    const answer = buildCoachProofAnswer({
      question: 'Should I cut calories?',
      mode: 'deep',
      contextSnapshot: contextSnapshot(),
      cutOsSurface: surface,
    })

    expect(answer.answerType).toBe('safety-limited')
    expect(answer.answer).toContain('Review food')
    expect(answer.answer).not.toContain('Use the explicit Cut OS action button')
    expect(answer.safetyFlags.some((flag) => flag.severity === 'blocked')).toBe(true)
  })
})
