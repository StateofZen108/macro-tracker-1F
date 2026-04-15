export interface FeatureFlags {
  foodCatalogSearch: boolean
  recipes: boolean
  savedMeals: boolean
  favoriteFoods: boolean
  coachEngineV1: boolean
  weeklyDecisionCard: boolean
  describeFood: boolean
  catalogProviderV2: boolean
  personalLibraryV1: boolean
  coachMethodV2: boolean
  weeklyDecisionSync: boolean
  psmfPhaseV2: boolean
  recoveryLayerV1: boolean
  garminConnectV1: boolean
  recoveryHybridGates: boolean
  importTrustV1: boolean
  barcodeTruthUiV1: boolean
  labelOcrTrustV1: boolean
  barcodeProviderFatsecretV1: boolean
}

export function resolveFeatureFlag(
  value: string | boolean | undefined,
  mode: string,
): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return true
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'off') {
      return false
    }
  }

  return mode !== 'production'
}

export function buildFeatureFlags(env: Record<string, string | boolean | undefined>): FeatureFlags {
  const mode = typeof env.MODE === 'string' && env.MODE.trim() ? env.MODE : 'development'

  const resolvedFlags: FeatureFlags = {
    foodCatalogSearch: resolveFeatureFlag(env.VITE_FF_FOOD_CATALOG_SEARCH, mode),
    recipes: resolveFeatureFlag(env.VITE_FF_RECIPES, mode),
    savedMeals: resolveFeatureFlag(env.VITE_FF_SAVED_MEALS, mode),
    favoriteFoods: resolveFeatureFlag(env.VITE_FF_FAVORITE_FOODS, mode),
    coachEngineV1: resolveFeatureFlag(env.VITE_FF_COACH_ENGINE_V1, mode),
    weeklyDecisionCard: resolveFeatureFlag(env.VITE_FF_WEEKLY_DECISION_CARD, mode),
    describeFood: resolveFeatureFlag(env.VITE_FF_DESCRIBE_FOOD, mode),
    catalogProviderV2: resolveFeatureFlag(env.VITE_FF_CATALOG_PROVIDER_V2, mode),
    personalLibraryV1: resolveFeatureFlag(env.VITE_FF_PERSONAL_LIBRARY_V1, mode),
    coachMethodV2: resolveFeatureFlag(env.VITE_FF_COACH_METHOD_V2, mode),
    weeklyDecisionSync: resolveFeatureFlag(env.VITE_FF_WEEKLY_DECISION_SYNC, mode),
    psmfPhaseV2: resolveFeatureFlag(env.VITE_FF_PSMF_PHASE_V2, mode),
    recoveryLayerV1: resolveFeatureFlag(env.VITE_FF_RECOVERY_LAYER_V1, mode),
    garminConnectV1: resolveFeatureFlag(env.VITE_FF_GARMIN_CONNECT_V1, mode),
    recoveryHybridGates: resolveFeatureFlag(env.VITE_FF_RECOVERY_HYBRID_GATES, mode),
    importTrustV1: resolveFeatureFlag(env.VITE_FF_IMPORT_TRUST_V1, mode),
    barcodeTruthUiV1: resolveFeatureFlag(env.VITE_FF_BARCODE_TRUTH_UI_V1, mode),
    labelOcrTrustV1: resolveFeatureFlag(env.VITE_FF_LABEL_OCR_TRUST_V1, mode),
    barcodeProviderFatsecretV1: resolveFeatureFlag(env.VITE_FF_BARCODE_PROVIDER_FATSECRET_V1, mode),
  }

  if (!resolvedFlags.catalogProviderV2) {
    resolvedFlags.describeFood = false
  }

  if (!resolvedFlags.personalLibraryV1) {
    resolvedFlags.personalLibraryV1 = false
  }

  if (!resolvedFlags.foodCatalogSearch) {
    resolvedFlags.describeFood = false
  }

  if (!resolvedFlags.coachEngineV1) {
    resolvedFlags.coachMethodV2 = false
    resolvedFlags.weeklyDecisionSync = false
    if (mode === 'production') {
      resolvedFlags.weeklyDecisionCard = false
    }
  }

  if (mode === 'production' && !resolvedFlags.weeklyDecisionSync) {
    resolvedFlags.weeklyDecisionCard = false
  }

  if (!resolvedFlags.psmfPhaseV2) {
    resolvedFlags.recoveryLayerV1 = false
  }

  if (!resolvedFlags.recoveryLayerV1) {
    resolvedFlags.garminConnectV1 = false
    resolvedFlags.recoveryHybridGates = false
  }

  if (!resolvedFlags.garminConnectV1) {
    resolvedFlags.recoveryHybridGates = false
  }

  if (!resolvedFlags.importTrustV1) {
    resolvedFlags.barcodeTruthUiV1 = false
    resolvedFlags.labelOcrTrustV1 = false
    resolvedFlags.barcodeProviderFatsecretV1 = false
  }

  return resolvedFlags
}

export const FEATURE_FLAGS = buildFeatureFlags(import.meta.env as Record<string, string | boolean | undefined>)
