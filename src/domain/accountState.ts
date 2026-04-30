import type { AccountStateSnapshot, PaidAccountState } from '../types.js'

export interface BillingEventInput {
  type:
    | 'trial_started'
    | 'subscription_active'
    | 'payment_failed'
    | 'subscription_cancelled'
    | 'support_lock'
  customerId?: string
  subscriptionId?: string
  trialEndsAt?: string
  currentPeriodEndsAt?: string
  occurredAt?: string
}

export function reduceAccountState(
  current: AccountStateSnapshot | null,
  event: BillingEventInput,
): AccountStateSnapshot {
  const nextStateByEvent: Record<BillingEventInput['type'], PaidAccountState> = {
    trial_started: 'trial_active',
    subscription_active: 'subscribed',
    payment_failed: 'past_due',
    subscription_cancelled: 'cancelled',
    support_lock: 'support_locked',
  }

  return {
    state: nextStateByEvent[event.type],
    customerId: event.customerId ?? current?.customerId,
    subscriptionId: event.subscriptionId ?? current?.subscriptionId,
    trialEndsAt: event.trialEndsAt ?? current?.trialEndsAt,
    currentPeriodEndsAt: event.currentPeriodEndsAt ?? current?.currentPeriodEndsAt,
    updatedAt: event.occurredAt ?? new Date().toISOString(),
  }
}

export function getPaidCloudFeatureLockReason(account: AccountStateSnapshot | null): string | null {
  if (!account || account.state === 'anonymous_local') {
    return 'Create an account or start a trial to unlock paid cloud features.'
  }

  if (account.state === 'past_due') {
    return 'Update billing to unlock paid cloud features.'
  }

  if (account.state === 'cancelled' || account.state === 'support_locked') {
    return 'Subscription is not active.'
  }

  return null
}
