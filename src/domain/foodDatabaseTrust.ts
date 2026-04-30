import type { FoodDataProviderTrust, FoodDataProviderTrustProvider, FoodTrustEvidence } from '../types'

export interface FoodDatabaseTrustObservation {
  provider: FoodDataProviderTrustProvider
  hit: boolean
  trusted: boolean
  conflict: boolean
}

export function buildFoodDatabaseTrustSummary(input: {
  provider: FoodDataProviderTrustProvider
  observations: FoodDatabaseTrustObservation[]
  locale?: string
  checkedAt?: string
}): FoodDataProviderTrust {
  const providerObservations = input.observations.filter((item) => item.provider === input.provider)
  const attempts = providerObservations.length
  const count = (predicate: (item: FoodDatabaseTrustObservation) => boolean) =>
    attempts > 0 ? providerObservations.filter(predicate).length / attempts : 0

  return {
    provider: input.provider,
    coverageWindow: {
      checkedAt: input.checkedAt ?? new Date().toISOString(),
      locale: input.locale ?? 'en-US',
    },
    lookupAttempts: attempts,
    hitRate: count((item) => item.hit),
    trustedHitRate: count((item) => item.hit && item.trusted),
    conflictRate: count((item) => item.conflict),
  }
}

export function providerObservationFromTrustEvidence(
  provider: FoodDataProviderTrustProvider,
  evidence: FoodTrustEvidence | null | undefined,
): FoodDatabaseTrustObservation {
  return {
    provider,
    hit: Boolean(evidence),
    trusted: evidence?.status === 'trusted',
    conflict: evidence?.providerConflict === true,
  }
}

export function evaluateFoodDatabaseTrustGate(summaries: FoodDataProviderTrust[]): {
  passed: boolean
  failures: string[]
} {
  const failures = summaries.flatMap((summary) => {
    const currentFailures: string[] = []
    if (summary.lookupAttempts === 0) {
      currentFailures.push(`${summary.provider} has no corpus attempts`)
    }
    if (summary.hitRate < 0.9) {
      currentFailures.push(`${summary.provider} hit rate ${summary.hitRate} is below 0.9`)
    }
    if (summary.trustedHitRate < 0.8) {
      currentFailures.push(`${summary.provider} trusted hit rate ${summary.trustedHitRate} is below 0.8`)
    }
    return currentFailures
  })

  return {
    passed: failures.length === 0,
    failures,
  }
}
