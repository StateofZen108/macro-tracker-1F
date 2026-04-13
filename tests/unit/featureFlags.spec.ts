import { describe, expect, it } from 'vitest'
import { buildFeatureFlags, resolveFeatureFlag } from '../../src/config/featureFlags'

describe('feature flags', () => {
  it('defaults flags off in production when unset', () => {
    expect(
      buildFeatureFlags({
        MODE: 'production',
      }),
    ).toEqual({
      foodCatalogSearch: false,
      recipes: false,
      savedMeals: false,
      favoriteFoods: false,
      coachEngineV1: false,
      weeklyDecisionCard: false,
    })
  })

  it('defaults flags on outside production when unset', () => {
    expect(
      buildFeatureFlags({
        MODE: 'development',
      }),
    ).toEqual({
      foodCatalogSearch: true,
      recipes: true,
      savedMeals: true,
      favoriteFoods: true,
      coachEngineV1: true,
      weeklyDecisionCard: true,
    })
  })

  it('honors explicit flag overrides', () => {
    expect(resolveFeatureFlag('off', 'development')).toBe(false)
    expect(resolveFeatureFlag('on', 'production')).toBe(true)
    expect(resolveFeatureFlag(true, 'production')).toBe(true)
    expect(resolveFeatureFlag(false, 'development')).toBe(false)
  })
})
