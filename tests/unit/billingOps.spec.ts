import { describe, expect, it } from 'vitest'
import { getPaidCloudFeatureLockReason, reduceAccountState } from '../../src/domain/accountState'
import { handleBillingWebhook } from '../../server/billing/webhook'

describe('paid account operations', () => {
  it('reconciles Stripe-like billing events into paid account state', () => {
    const trial = reduceAccountState(null, {
      type: 'trial_started',
      customerId: 'cus_123',
      trialEndsAt: '2026-05-07T00:00:00.000Z',
      occurredAt: '2026-04-30T00:00:00.000Z',
    })
    const active = handleBillingWebhook(trial, {
      type: 'subscription_active',
      subscriptionId: 'sub_123',
      currentPeriodEndsAt: '2026-05-30T00:00:00.000Z',
      occurredAt: '2026-05-01T00:00:00.000Z',
    })

    expect(active).toMatchObject({
      state: 'subscribed',
      customerId: 'cus_123',
      subscriptionId: 'sub_123',
    })
    expect(getPaidCloudFeatureLockReason(active)).toBeNull()
  })

  it('locks paid cloud features for anonymous, past-due, cancelled, and support-locked states', () => {
    expect(getPaidCloudFeatureLockReason(null)).toMatch(/start a trial/i)
    expect(
      getPaidCloudFeatureLockReason({
        state: 'past_due',
        updatedAt: '2026-04-30T00:00:00.000Z',
      }),
    ).toMatch(/billing/i)
    expect(
      getPaidCloudFeatureLockReason({
        state: 'cancelled',
        updatedAt: '2026-04-30T00:00:00.000Z',
      }),
    ).toMatch(/not active/i)
  })
})
