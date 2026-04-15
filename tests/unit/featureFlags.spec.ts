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
      describeFood: false,
      catalogProviderV2: false,
      personalLibraryV1: false,
      coachMethodV2: false,
      weeklyDecisionSync: false,
      psmfPhaseV2: false,
      recoveryLayerV1: false,
      garminConnectV1: false,
      recoveryHybridGates: false,
      importTrustV1: false,
      barcodeTruthUiV1: false,
      labelOcrTrustV1: false,
      barcodeProviderFatsecretV1: false,
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
      describeFood: true,
      catalogProviderV2: true,
      personalLibraryV1: true,
      coachMethodV2: true,
      weeklyDecisionSync: true,
      psmfPhaseV2: true,
      recoveryLayerV1: true,
      garminConnectV1: true,
      recoveryHybridGates: true,
      importTrustV1: true,
      barcodeTruthUiV1: true,
      labelOcrTrustV1: true,
      barcodeProviderFatsecretV1: true,
    })
  })

  it('honors explicit flag overrides', () => {
    expect(resolveFeatureFlag('off', 'development')).toBe(false)
    expect(resolveFeatureFlag('on', 'production')).toBe(true)
    expect(resolveFeatureFlag(true, 'production')).toBe(true)
    expect(resolveFeatureFlag(false, 'development')).toBe(false)
  })

  it('downgrades dependent flags when prerequisites are disabled', () => {
    expect(
      buildFeatureFlags({
        MODE: 'production',
        VITE_FF_FOOD_CATALOG_SEARCH: 'false',
        VITE_FF_CATALOG_PROVIDER_V2: 'true',
        VITE_FF_DESCRIBE_FOOD: 'true',
        VITE_FF_PERSONAL_LIBRARY_V1: 'true',
        VITE_FF_COACH_ENGINE_V1: 'false',
        VITE_FF_COACH_METHOD_V2: 'true',
        VITE_FF_WEEKLY_DECISION_SYNC: 'true',
        VITE_FF_WEEKLY_DECISION_CARD: 'true',
        VITE_FF_IMPORT_TRUST_V1: 'false',
        VITE_FF_BARCODE_TRUTH_UI_V1: 'true',
        VITE_FF_LABEL_OCR_TRUST_V1: 'true',
        VITE_FF_BARCODE_PROVIDER_FATSECRET_V1: 'true',
      }),
    ).toEqual({
      foodCatalogSearch: false,
      recipes: false,
      savedMeals: false,
      favoriteFoods: false,
      coachEngineV1: false,
      weeklyDecisionCard: false,
      describeFood: false,
      catalogProviderV2: true,
      personalLibraryV1: true,
      coachMethodV2: false,
      weeklyDecisionSync: false,
      psmfPhaseV2: false,
      recoveryLayerV1: false,
      garminConnectV1: false,
      recoveryHybridGates: false,
      importTrustV1: false,
      barcodeTruthUiV1: false,
      labelOcrTrustV1: false,
      barcodeProviderFatsecretV1: false,
    })
  })
})
