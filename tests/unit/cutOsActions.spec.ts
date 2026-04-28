import { describe, expect, it } from 'vitest'
import {
  buildCutOsSurfaceModel,
  createCutOsActionRecord,
  markCutOsActionApplied,
  markCutOsActionDeferred,
  markCutOsActionFailed,
} from '../../src/domain/cutOsActions'
import type { CutOsSnapshot } from '../../src/types'

const snapshot: CutOsSnapshot = {
  generatedAt: '2026-04-27T08:00:00.000Z',
  diagnosis: {
    verdict: 'true_stall',
    reasonCodes: ['true_stall'],
    blockedBy: [],
    scaleVerdict: 'true_stall',
    trainingVerdict: 'preserved',
    phaseVerdict: 'standard_cut',
    foodTrustVerdict: 'trusted_for_coaching',
  },
  proofs: [
    {
      id: 'scale:2026-04-27:true_stall',
      source: 'scale',
      title: 'Scale-lie detector',
      summary: 'Two clean windows point to a real stall.',
      evidenceWindow: { start: '2026-04-14', end: '2026-04-27' },
      strength: 'high',
      blocking: false,
    },
  ],
  command: {
    date: '2026-04-27',
    state: 'command_issued',
    primaryAction: 'Raise steps before lowering calories',
    urgency: 'medium',
    confidence: 'high',
    diagnosisId: 'cut-os:2026-04-27:true_stall:true_stall',
    proofIds: ['scale:2026-04-27:true_stall'],
    cta: { label: 'Review weekly decision', target: 'coach' },
    secondaryActions: [],
  },
}

describe('cutOsActions', () => {
  it('promotes one action record through proposed, applied, deferred, and failed statuses', () => {
    const proposed = createCutOsActionRecord({
      command: snapshot.command,
      now: '2026-04-27T08:01:00.000Z',
    })

    expect(proposed).toMatchObject({
      commandId: '2026-04-27:cut-os:2026-04-27:true_stall:true_stall',
      diagnosisId: snapshot.command.diagnosisId,
      actionTarget: 'coach',
      status: 'proposed',
    })

    expect(markCutOsActionApplied(proposed, '2026-04-27T08:02:00.000Z')).toMatchObject({
      id: proposed.id,
      status: 'applied',
      appliedAt: '2026-04-27T08:02:00.000Z',
    })

    expect(markCutOsActionDeferred(proposed, '2026-04-27T08:03:00.000Z')).toMatchObject({
      id: proposed.id,
      status: 'deferred',
      deferredAt: '2026-04-27T08:03:00.000Z',
    })

    expect(
      markCutOsActionFailed(
        proposed,
        { code: 'save_failed', message: 'Unable to save action.' },
        '2026-04-27T08:04:00.000Z',
      ),
    ).toMatchObject({
      id: proposed.id,
      status: 'failed',
      failureCode: 'save_failed',
      failureMessage: 'Unable to save action.',
    })
  })

  it('assembles the shared surface model with latest matching active action', () => {
    const older = createCutOsActionRecord({
      command: snapshot.command,
      now: '2026-04-27T08:00:00.000Z',
    })
    const latest = markCutOsActionApplied(
      createCutOsActionRecord({
        command: snapshot.command,
        now: '2026-04-27T08:10:00.000Z',
      }),
      '2026-04-27T08:11:00.000Z',
    )

    const model = buildCutOsSurfaceModel({
      snapshot,
      setup: [],
      actionHistory: [older, latest],
    })

    expect(model?.activeAction).toEqual(latest)
    expect(model?.command.diagnosisId).toBe(snapshot.command.diagnosisId)
    expect(model?.proofs).toHaveLength(1)
  })
})
