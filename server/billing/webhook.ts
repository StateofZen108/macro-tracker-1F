import { reduceAccountState, type BillingEventInput } from '../../src/domain/accountState.js'
import type { AccountStateSnapshot } from '../../src/types.js'

export function handleBillingWebhook(
  current: AccountStateSnapshot | null,
  event: BillingEventInput,
): AccountStateSnapshot {
  return reduceAccountState(current, event)
}
