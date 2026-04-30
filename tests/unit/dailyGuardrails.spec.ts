import { describe, expect, it } from 'vitest'
import { buildDailyMistakeProofModel } from '../../src/domain/dailyGuardrails'
import type { CutOsSurfaceModel, FoodLogEntry, WeightEntry } from '../../src/types'

function weight(date = '2026-04-29'): WeightEntry {
  return {
    id: `weight-${date}`,
    date,
    weight: 200,
    unit: 'lb',
    createdAt: `${date}T07:00:00.000Z`,
  }
}

function logEntry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: 'entry-1',
    date: '2026-04-29',
    meal: 'breakfast',
    servings: 1,
    createdAt: '2026-04-29T08:00:00.000Z',
    snapshot: {
      name: 'Greek yogurt',
      servingSize: 170,
      servingUnit: 'g',
      calories: 100,
      protein: 17,
      carbs: 6,
      fat: 0,
      source: 'custom',
    },
    ...overrides,
  }
}

function surface(overrides: Partial<CutOsSurfaceModel> = {}): CutOsSurfaceModel {
  return {
    generatedAt: '2026-04-29T08:00:00.000Z',
    command: {
      date: '2026-04-29',
      state: 'command_issued',
      primaryAction: 'Hold calories and keep logging clean',
      urgency: 'low',
      confidence: 'high',
      diagnosisId: 'diagnosis-on-track',
      proofIds: ['proof-scale', 'proof-food'],
      cta: { label: 'Open Coach', target: 'coach' },
      secondaryActions: [],
    },
    diagnosis: {
      verdict: 'on_track',
      reasonCodes: ['on_track'],
      blockedBy: [],
      scaleVerdict: 'on_track',
      trainingVerdict: 'preserved',
      phaseVerdict: 'standard_cut',
      foodTrustVerdict: 'trusted_for_coaching',
    },
    proofs: [
      {
        id: 'proof-scale',
        source: 'scale',
        title: 'Scale trend',
        summary: 'Trend is usable.',
        evidenceWindow: { start: '2026-04-15', end: '2026-04-29' },
        strength: 'high',
        blocking: false,
      },
      {
        id: 'proof-food',
        source: 'food_trust',
        title: 'Food trusted',
        summary: 'Food proof is coaching-grade.',
        evidenceWindow: { start: '2026-04-15', end: '2026-04-29' },
        strength: 'high',
        blocking: false,
      },
    ],
    setup: [],
    actionHistory: [],
    activeAction: null,
    ...overrides,
  }
}

describe('daily mistake-proof guardrails', () => {
  it('marks a clean day ready with one safe next action', () => {
    const model = buildDailyMistakeProofModel({
      date: '2026-04-29',
      surface: surface(),
      entries: [logEntry()],
      weights: [weight()],
    })

    expect(model.readiness).toBe('ready')
    expect(model.primaryGuardrail?.title).toBe('Safe next action is ready')
    expect(model.guardrails).toHaveLength(1)
  })

  it('creates a repair task and blocks escalation when food trust is incomplete', () => {
    const model = buildDailyMistakeProofModel({
      date: '2026-04-29',
      surface: surface({
        diagnosis: {
          ...surface().diagnosis,
          foodTrustVerdict: 'review_required',
        },
      }),
      entries: [
        logEntry({
          snapshot: {
            ...logEntry().snapshot,
            servingSize: 0,
            servingUnit: '',
            calories: Number.NaN,
          },
          needsReview: true,
        }),
      ],
      weights: [weight()],
    })

    expect(model.readiness).toBe('blocked')
    expect(model.trustRepairs[0]?.reasonCode).toBe('missing_macros')
    expect(model.primaryGuardrail?.source).toBe('food')
    expect(model.primaryGuardrail?.cta.route).toBe('log')
  })

  it('blocks when surfaces disagree about the daily command', () => {
    const model = buildDailyMistakeProofModel({
      date: '2026-04-29',
      surface: surface(),
      entries: [logEntry()],
      weights: [weight()],
      surfaceConsistency: {
        checkedAt: '2026-04-29T08:00:00.000Z',
        status: 'mismatch',
        surfaces: [],
        mismatchReasons: ['Coach primary action disagrees with Log.'],
      },
    })

    expect(model.readiness).toBe('blocked')
    expect(model.primaryGuardrail?.id).toBe('surface-mismatch:2026-04-29')
  })
})
