import { describe, expect, it } from 'vitest'
import { buildFoodAuditEvents, buildFoodProofSummary } from '../../src/domain/foodAudit'
import type { FoodLogEntry, TrustRepairTask } from '../../src/types'

function entry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
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
      trustEvidence: {
        source: 'custom',
        sourceId: 'food-1',
        status: 'trusted',
        confidence: 1,
        servingBasis: 'verified',
        macroCompleteness: 'complete',
        providerConflict: false,
        reasons: [],
        proofEligible: true,
      },
    },
    ...overrides,
  }
}

describe('food proof summary', () => {
  it('separates trusted calories from review-required calories', () => {
    const reviewEntry = entry({
      id: 'entry-2',
      snapshot: {
        ...entry().snapshot,
        name: 'Imported bowl',
        calories: 300,
        trustEvidence: {
          source: 'import',
          sourceId: 'entry-2',
          status: 'review_required',
          confidence: 0.7,
          servingBasis: 'inferred',
          macroCompleteness: 'complete',
          providerConflict: false,
          reasons: ['estimated_serving'],
          proofEligible: false,
        },
      },
      needsReview: true,
    })
    const repairs: TrustRepairTask[] = [
      {
        id: 'repair-1',
        logEntryId: 'entry-2',
        source: 'import',
        reasonCode: 'missing_serving_basis',
        status: 'open',
        blockingCoachProof: true,
      },
    ]

    const summary = buildFoodProofSummary({
      date: '2026-04-29',
      entries: [entry(), reviewEntry],
      trustRepairs: repairs,
      auditEvents: buildFoodAuditEvents({
        date: '2026-04-29',
        beforeEntries: [],
        afterEntries: [entry(), reviewEntry],
        actor: 'import',
        operationId: 'op-1',
        createdAt: '2026-04-29T08:01:00.000Z',
      }),
    })

    expect(summary).toMatchObject({
      caloriesTotal: 400,
      caloriesTrusted: 100,
      caloriesReviewRequired: 300,
      trustedEntryCount: 1,
      reviewRequiredEntryCount: 1,
      repairTaskCount: 1,
      proofEligible: false,
      auditEventCount: 2,
    })
  })
})
