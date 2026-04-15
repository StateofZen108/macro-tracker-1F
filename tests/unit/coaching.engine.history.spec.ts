import { describe, expect, it } from 'vitest'
import type { CoachingDecisionRecord } from '../../src/types'
import { upsertCoachingDecisionRecord } from '../../src/domain/coaching/engine/history'

describe('coaching decision history', () => {
  it('does not churn updatedAt when the decision payload is logically unchanged', () => {
    const existingRecord: CoachingDecisionRecord = {
      id: 'engine_v1:2026-03-17:2026-04-06',
      source: 'engine_v1',
      status: 'pending',
      decisionType: 'decrease_calories',
      windowStart: '2026-03-17',
      windowEnd: '2026-04-06',
      effectiveDate: '2026-04-07',
      confidenceBand: 'high',
      confidenceScore: 86,
      reasonCodes: ['slower_than_target'],
      blockedReasons: [],
      explanation: 'Loss was slower than target, so calories should come down slightly.',
      previousTargets: {
        calorieTarget: 2000,
        proteinTarget: 180,
        carbTarget: 200,
        fatTarget: 60,
      },
      proposedTargets: {
        calorieTarget: 1900,
        proteinTarget: 180,
        carbTarget: 180,
        fatTarget: 60,
      },
      createdAt: '2026-04-06T09:00:00.000Z',
      updatedAt: '2026-04-06T09:00:00.000Z',
    }

    const nextRecord: CoachingDecisionRecord = {
      ...existingRecord,
      createdAt: '2026-04-13T09:00:00.000Z',
      updatedAt: '2026-04-13T09:00:00.000Z',
    }

    expect(upsertCoachingDecisionRecord([existingRecord], nextRecord)).toEqual([existingRecord])
  })
})
