import { describe, expect, it } from 'vitest'
import {
  buildFoodDatabaseTrustSummary,
  evaluateFoodDatabaseTrustGate,
  providerObservationFromTrustEvidence,
} from '../../src/domain/foodDatabaseTrust'
import type { FoodTrustEvidence } from '../../src/types'

const trustedEvidence: FoodTrustEvidence = {
  source: 'barcode',
  sourceId: 'barcode:123',
  status: 'trusted',
  confidence: 0.94,
  servingBasis: 'verified',
  macroCompleteness: 'complete',
  providerConflict: false,
  reasons: [],
}

describe('food database trust scoring', () => {
  it('passes corpus coverage when hit and trusted-hit rates clear the paid threshold', () => {
    const observations = [
      ...Array.from({ length: 80 }, () => providerObservationFromTrustEvidence('open_food_facts', trustedEvidence)),
      ...Array.from({ length: 10 }, () => ({
        provider: 'open_food_facts' as const,
        hit: true,
        trusted: false,
        conflict: true,
      })),
      ...Array.from({ length: 10 }, () => ({
        provider: 'open_food_facts' as const,
        hit: false,
        trusted: false,
        conflict: false,
      })),
    ]

    const summary = buildFoodDatabaseTrustSummary({
      provider: 'open_food_facts',
      observations,
      checkedAt: '2026-04-30T00:00:00.000Z',
      locale: 'en-GB',
    })

    expect(summary.hitRate).toBe(0.9)
    expect(summary.trustedHitRate).toBe(0.8)
    expect(summary.conflictRate).toBe(0.1)
    expect(evaluateFoodDatabaseTrustGate([summary])).toEqual({ passed: true, failures: [] })
  })

  it('fails loudly when a provider has no corpus or weak trust coverage', () => {
    const empty = buildFoodDatabaseTrustSummary({
      provider: 'usda',
      observations: [],
      checkedAt: '2026-04-30T00:00:00.000Z',
    })

    const result = evaluateFoodDatabaseTrustGate([empty])

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual([
      'usda has no corpus attempts',
      'usda hit rate 0 is below 0.9',
      'usda trusted hit rate 0 is below 0.8',
    ])
  })
})
