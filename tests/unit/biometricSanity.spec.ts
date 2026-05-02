import { describe, expect, it } from 'vitest'
import {
  applyBodyMetricSanity,
  applyWeightSanity,
  isWeightProofEligible,
  sanitizeWeights,
  validateWeightValue,
} from '../../src/domain/biometricSanity'
import type { BodyMetricValue, WeightEntry } from '../../src/types'

function weight(overrides: Partial<WeightEntry> & Pick<WeightEntry, 'date' | 'weight'>): WeightEntry {
  return {
    id: overrides.id ?? `w-${overrides.date}`,
    date: overrides.date,
    weight: overrides.weight,
    unit: overrides.unit ?? 'lb',
    createdAt: overrides.createdAt ?? `${overrides.date}T07:00:00.000Z`,
    updatedAt: overrides.updatedAt,
    deletedAt: overrides.deletedAt,
    reviewedAt: overrides.reviewedAt,
  }
}

describe('biometric sanity validation', () => {
  it('blocks impossible absolute weight values', () => {
    const result = validateWeightValue({
      date: '2026-04-29',
      weight: 99999,
      unit: 'lb',
      source: 'manual_entry',
    })

    expect(result.status).toBe('blocked_invalid')
    expect(result.proofEligible).toBe(false)
    expect(result.issues[0]?.code).toBe('outside_absolute_range')
  })

  it('accepts documented boundary weights', () => {
    expect(validateWeightValue({ date: '2026-04-29', weight: 800, unit: 'lb', source: 'manual_entry' }).status).toBe('valid')
    expect(validateWeightValue({ date: '2026-04-29', weight: 22.7, unit: 'kg', source: 'manual_entry' }).status).toBe('valid')
  })

  it('quarantines plausible sudden weight jumps from proof', () => {
    const previous = weight({ date: '2026-04-28', weight: 200 })
    const next = applyWeightSanity(weight({ date: '2026-04-29', weight: 260 }), {
      source: 'manual_entry',
      existingWeights: [previous],
    })

    expect(next?.sanityStatus).toBe('outlier_review_required')
    expect(next?.proofEligible).toBe(false)
    expect(isWeightProofEligible(next as WeightEntry)).toBe(false)
  })

  it('keeps confirmed outliers proof eligible', () => {
    const previous = weight({ date: '2026-04-28', weight: 200 })
    const next = applyWeightSanity(
      weight({ date: '2026-04-29', weight: 260, reviewedAt: '2026-04-29T09:00:00.000Z' }),
      {
        source: 'manual_entry',
        existingWeights: [previous],
      },
    )

    expect(next?.sanityStatus).toBe('valid')
    expect(next?.proofEligible).toBe(true)
  })

  it('sanitizes a mixed stored weight set without promoting invalid proof', () => {
    const sanitized = sanitizeWeights([
      weight({ date: '2026-04-27', weight: 200 }),
      weight({ date: '2026-04-28', weight: 99999 }),
    ])

    expect(sanitized.blockedCount).toBe(1)
    expect(sanitized.weights[1]?.sanityStatus).toBe('blocked_invalid')
    expect(sanitized.weights[1]?.proofEligible).toBe(false)
  })

  it('blocks impossible known body metrics', () => {
    const metric: BodyMetricValue = {
      key: 'waist',
      label: 'Waist',
      unit: 'cm',
      value: 999,
    }

    const result = applyBodyMetricSanity(metric, {
      date: '2026-04-29',
      source: 'body_progress',
      blockInvalid: false,
    })

    expect(result?.sanityStatus).toBe('blocked_invalid')
    expect(result?.proofEligible).toBe(false)
  })
})
