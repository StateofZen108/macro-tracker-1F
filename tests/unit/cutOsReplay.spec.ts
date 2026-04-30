import { describe, expect, it } from 'vitest'
import { buildCutOsHistoricalReplayReport } from '../../src/domain/cutOsReplay'
import type { CutOsSurfaceModel } from '../../src/types'

function surface(overrides: Partial<CutOsSurfaceModel> = {}): CutOsSurfaceModel {
  const base: CutOsSurfaceModel = {
    generatedAt: '2026-04-28T08:00:00.000Z',
    command: {
      date: '2026-04-28',
      state: 'command_issued',
      primaryAction: 'Raise steps before cutting calories',
      urgency: 'medium',
      confidence: 'high',
      diagnosisId: 'diagnosis-1',
      proofIds: ['proof-scale'],
      cta: { label: 'Apply step increase', target: 'coach' },
      secondaryActions: [],
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
        title: 'True stall',
        summary: 'Two clean slow windows.',
        evidenceWindow: { start: '2026-04-14', end: '2026-04-28' },
        strength: 'high',
        blocking: false,
      },
    ],
    setup: [],
    actionHistory: [],
    activeAction: null,
  }

  return {
    ...base,
    ...overrides,
    command: { ...base.command, ...overrides.command },
    diagnosis: { ...base.diagnosis, ...overrides.diagnosis },
  }
}

describe('Cut OS historical replay', () => {
  it('counts true stalls, spike suppression, training precedence, and food trust blocks', () => {
    const report = buildCutOsHistoricalReplayReport({
      buildId: 'cut-os-9-test',
      checkedAt: '2026-04-30T09:00:00.000Z',
      surfaces: [
        surface(),
        surface({
          command: {
            date: '2026-04-29',
            state: 'blocked',
            primaryAction: 'Hold the cut; scale signal is confounded',
          } as Partial<CutOsSurfaceModel['command']> as CutOsSurfaceModel['command'],
          diagnosis: {
            verdict: 'blocked',
            blockedBy: ['food_trust'],
            scaleVerdict: 'expected_spike',
            foodTrustVerdict: 'review_required',
          } as Partial<CutOsSurfaceModel['diagnosis']> as CutOsSurfaceModel['diagnosis'],
        }),
        surface({
          command: {
            date: '2026-04-30',
            state: 'blocked',
            primaryAction: 'Protect training before pushing fat loss harder',
          } as Partial<CutOsSurfaceModel['command']> as CutOsSurfaceModel['command'],
          diagnosis: {
            verdict: 'protect_training',
            scaleVerdict: 'true_stall',
            trainingVerdict: 'leaking',
          } as Partial<CutOsSurfaceModel['diagnosis']> as CutOsSurfaceModel['diagnosis'],
        }),
      ],
    })

    expect(report.reconstructedDays).toBe(3)
    expect(report.trueStallsDetected).toBe(2)
    expect(report.expectedSpikesSuppressed).toBe(1)
    expect(report.trainingLeaksPrioritized).toBe(1)
    expect(report.foodTrustBlocksCaught).toBe(1)
    expect(report.falseEscalations).toBe(0)
    expect(report.missedActionableDays).toBe(1)
  })
})
