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
  safeAutoUpdatePwa: boolean
  nutritionOverviewV1: boolean
  coachEngineV3: boolean
  nutritionOverviewV2: boolean
  foodTruthV2: boolean
  garminIntelligenceV2: boolean
  bodyMetricsV1: boolean
  progressPhotosV1: boolean
  workoutsV1: boolean
  encryptedSyncV2: boolean
  coachEvidenceAI: boolean
  benchmarkSuiteV1: boolean
  recoveryPacksV1: boolean
  dashboardV1: boolean
  coachModulesV1: boolean
  bodyProgressGalleryV2: boolean
  cutModeV1: boolean
  nutrientGoalsV1: boolean
  fastCheckInV1: boolean
  loggingShortcutsV1: boolean
  workoutsAnalyticsV2: boolean
  bodyProgressCompareV1: boolean
  dashboardInsightsV2: boolean
  nutritionCatalogV3: boolean
  workoutRecordsV1: boolean
  bodyMetricVisibilityV1: boolean
  claimGateV1: boolean
  commandHomeV1: boolean
  repeatLoggingV2: boolean
  trainingGuidanceV2: boolean
  progressStoryV1: boolean
  quietSettingsV1: boolean
  captureConvenienceV1: boolean
  cutDayOsV1: boolean
  phaseTemplatesV1: boolean
  trainingPreservationV1: boolean
  progressProofV2: boolean
  quietPowerV1: boolean
  commandSurfaceV2: boolean
  loggingMaturityV1: boolean
  trainingTrustV1: boolean
  progressProofFinishV1: boolean
  cohesionFinishV1: boolean
  premiumDesignV1: boolean
  premiumUiV1: boolean
  premiumLogSummaryV2: boolean
  premiumFastLogToolbarV2: boolean
  premiumMealLedgerV2: boolean
  premiumProofStripV1: boolean
  mobileIaV1: boolean
  commandSurfacePolishV1: boolean
  screenFinishV1: boolean
  settingsHubV1: boolean
  motionSystemV1: boolean
  adaptiveCutIntelligenceV1: boolean
  adaptiveCutReviewSurfaceV1: boolean
  paidCutOsV1: boolean
  cutOsImportFocusV1: boolean
  coachProofAnswerV1: boolean
  macroFactorCorpusGateV1: boolean
  standaloneCutNineV1: boolean
  foodTrustConfidenceV3: boolean
  firstTenMinuteActivationV1: boolean
  coachProofDefaultV2: boolean
  cutOsReplayValidationV1: boolean
  serverFunctionTypecheckGateV1: boolean
  macroFactorSurpassV1: boolean
  unifiedLoggerV1: boolean
  aiMealCaptureV1: boolean
  foodDatabaseTrustV1: boolean
  cutOsExpenditureValidationV1: boolean
  coachLiveProviderV1: boolean
  trainingPreservationOsV1: boolean
  nativeDeviceProofV1: boolean
  paidAccountOpsV1: boolean
  supportOpsV1: boolean
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
    safeAutoUpdatePwa: resolveFeatureFlag(env.VITE_FF_SAFE_AUTO_UPDATE_PWA, mode),
    nutritionOverviewV1: resolveFeatureFlag(env.VITE_FF_NUTRITION_OVERVIEW_V1, mode),
    coachEngineV3: resolveFeatureFlag(env.VITE_FF_COACH_ENGINE_V3, mode),
    nutritionOverviewV2: resolveFeatureFlag(env.VITE_FF_NUTRITION_OVERVIEW_V2, mode),
    foodTruthV2: resolveFeatureFlag(env.VITE_FF_FOOD_TRUTH_V2, mode),
    garminIntelligenceV2: resolveFeatureFlag(env.VITE_FF_GARMIN_INTELLIGENCE_V2, mode),
    bodyMetricsV1: resolveFeatureFlag(env.VITE_FF_BODY_METRICS_V1, mode),
    progressPhotosV1: resolveFeatureFlag(env.VITE_FF_PROGRESS_PHOTOS_V1, mode),
    workoutsV1: resolveFeatureFlag(env.VITE_FF_WORKOUTS_V1, mode),
    encryptedSyncV2: resolveFeatureFlag(env.VITE_FF_ENCRYPTED_SYNC_V2, mode),
    coachEvidenceAI: resolveFeatureFlag(env.VITE_FF_COACH_EVIDENCE_AI, mode),
    benchmarkSuiteV1: resolveFeatureFlag(env.VITE_FF_BENCHMARK_SUITE_V1, mode),
    recoveryPacksV1: resolveFeatureFlag(env.VITE_FF_RECOVERY_PACKS_V1, mode),
    dashboardV1: resolveFeatureFlag(env.VITE_FF_DASHBOARD_V1, mode),
    coachModulesV1: resolveFeatureFlag(env.VITE_FF_COACH_MODULES_V1, mode),
    bodyProgressGalleryV2: resolveFeatureFlag(env.VITE_FF_BODY_PROGRESS_GALLERY_V2, mode),
    cutModeV1: resolveFeatureFlag(env.VITE_FF_CUT_MODE_V1, mode),
    nutrientGoalsV1: resolveFeatureFlag(env.VITE_FF_NUTRIENT_GOALS_V1, mode),
    fastCheckInV1: resolveFeatureFlag(env.VITE_FF_FAST_CHECK_IN_V1, mode),
    loggingShortcutsV1: resolveFeatureFlag(env.VITE_FF_LOGGING_SHORTCUTS_V1, mode),
    workoutsAnalyticsV2: resolveFeatureFlag(env.VITE_FF_WORKOUTS_ANALYTICS_V2, mode),
    bodyProgressCompareV1: resolveFeatureFlag(env.VITE_FF_BODY_PROGRESS_COMPARE_V1, mode),
    dashboardInsightsV2: resolveFeatureFlag(env.VITE_FF_DASHBOARD_INSIGHTS_V2, mode),
    nutritionCatalogV3: resolveFeatureFlag(env.VITE_FF_NUTRITION_CATALOG_V3, mode),
    workoutRecordsV1: resolveFeatureFlag(env.VITE_FF_WORKOUT_RECORDS_V1, mode),
    bodyMetricVisibilityV1: resolveFeatureFlag(env.VITE_FF_BODY_METRIC_VISIBILITY_V1, mode),
    claimGateV1: resolveFeatureFlag(env.VITE_FF_CLAIM_GATE_V1, mode),
    commandHomeV1: resolveFeatureFlag(env.VITE_FF_COMMAND_HOME_V1, mode),
    repeatLoggingV2: resolveFeatureFlag(env.VITE_FF_REPEAT_LOGGING_V2, mode),
    trainingGuidanceV2: resolveFeatureFlag(env.VITE_FF_TRAINING_GUIDANCE_V2, mode),
    progressStoryV1: resolveFeatureFlag(env.VITE_FF_PROGRESS_STORY_V1, mode),
    quietSettingsV1: resolveFeatureFlag(env.VITE_FF_QUIET_SETTINGS_V1, mode),
    captureConvenienceV1: resolveFeatureFlag(env.VITE_FF_CAPTURE_CONVENIENCE_V1, mode),
    cutDayOsV1: resolveFeatureFlag(env.VITE_FF_CUT_DAY_OS_V1, mode),
    phaseTemplatesV1: resolveFeatureFlag(env.VITE_FF_PHASE_TEMPLATES_V1, mode),
    trainingPreservationV1: resolveFeatureFlag(env.VITE_FF_TRAINING_PRESERVATION_V1, mode),
    progressProofV2: resolveFeatureFlag(env.VITE_FF_PROGRESS_PROOF_V2, mode),
    quietPowerV1: resolveFeatureFlag(env.VITE_FF_QUIET_POWER_V1, mode),
    commandSurfaceV2: resolveFeatureFlag(env.VITE_FF_COMMAND_SURFACE_V2, mode),
    loggingMaturityV1: resolveFeatureFlag(env.VITE_FF_LOGGING_MATURITY_V1, mode),
    trainingTrustV1: resolveFeatureFlag(env.VITE_FF_TRAINING_TRUST_V1, mode),
    progressProofFinishV1: resolveFeatureFlag(env.VITE_FF_PROGRESS_PROOF_FINISH_V1, mode),
    cohesionFinishV1: resolveFeatureFlag(env.VITE_FF_COHESION_FINISH_V1, mode),
    premiumDesignV1: resolveFeatureFlag(env.VITE_FF_PREMIUM_DESIGN_V1, mode),
    premiumUiV1: resolveFeatureFlag(env.VITE_FF_PREMIUM_UI_V1, mode),
    premiumLogSummaryV2: resolveFeatureFlag(env.VITE_FF_PREMIUM_LOG_SUMMARY_V2, mode),
    premiumFastLogToolbarV2: resolveFeatureFlag(env.VITE_FF_PREMIUM_FAST_LOG_TOOLBAR_V2, mode),
    premiumMealLedgerV2: resolveFeatureFlag(env.VITE_FF_PREMIUM_MEAL_LEDGER_V2, mode),
    premiumProofStripV1: resolveFeatureFlag(env.VITE_FF_PREMIUM_PROOF_STRIP_V1, mode),
    mobileIaV1: resolveFeatureFlag(env.VITE_FF_MOBILE_IA_V1, mode),
    commandSurfacePolishV1: resolveFeatureFlag(env.VITE_FF_COMMAND_SURFACE_POLISH_V1, mode),
    screenFinishV1: resolveFeatureFlag(env.VITE_FF_SCREEN_FINISH_V1, mode),
    settingsHubV1: resolveFeatureFlag(env.VITE_FF_SETTINGS_HUB_V1, mode),
    motionSystemV1: resolveFeatureFlag(env.VITE_FF_MOTION_SYSTEM_V1, mode),
    adaptiveCutIntelligenceV1: resolveFeatureFlag(env.VITE_FF_ADAPTIVE_CUT_INTELLIGENCE_V1, mode),
    adaptiveCutReviewSurfaceV1: resolveFeatureFlag(env.VITE_FF_ADAPTIVE_CUT_REVIEW_SURFACE_V1, mode),
    paidCutOsV1: resolveFeatureFlag(env.VITE_FF_PAID_CUT_OS_V1, mode),
    cutOsImportFocusV1: resolveFeatureFlag(env.VITE_FF_CUT_OS_IMPORT_FOCUS_V1, mode),
    coachProofAnswerV1: resolveFeatureFlag(env.VITE_FF_COACH_PROOF_ANSWER_V1, mode),
    macroFactorCorpusGateV1: resolveFeatureFlag(env.VITE_FF_MACRO_FACTOR_CORPUS_GATE_V1, mode),
    standaloneCutNineV1: resolveFeatureFlag(env.VITE_FF_STANDALONE_CUT_NINE_V1, mode),
    foodTrustConfidenceV3: resolveFeatureFlag(env.VITE_FF_FOOD_TRUST_CONFIDENCE_V3, mode),
    firstTenMinuteActivationV1: resolveFeatureFlag(env.VITE_FF_FIRST_TEN_MINUTE_ACTIVATION_V1, mode),
    coachProofDefaultV2: resolveFeatureFlag(env.VITE_FF_COACH_PROOF_DEFAULT_V2, mode),
    cutOsReplayValidationV1: resolveFeatureFlag(env.VITE_FF_CUT_OS_REPLAY_VALIDATION_V1, mode),
    serverFunctionTypecheckGateV1: resolveFeatureFlag(env.VITE_FF_SERVER_FUNCTION_TYPECHECK_GATE_V1, mode),
    macroFactorSurpassV1: resolveFeatureFlag(env.VITE_FF_MACRO_FACTOR_SURPASS_V1, mode),
    unifiedLoggerV1: resolveFeatureFlag(env.VITE_FF_UNIFIED_LOGGER_V1, mode),
    aiMealCaptureV1: resolveFeatureFlag(env.VITE_FF_AI_MEAL_CAPTURE_V1, mode),
    foodDatabaseTrustV1: resolveFeatureFlag(env.VITE_FF_FOOD_DATABASE_TRUST_V1, mode),
    cutOsExpenditureValidationV1: resolveFeatureFlag(env.VITE_FF_CUT_OS_EXPENDITURE_VALIDATION_V1, mode),
    coachLiveProviderV1: resolveFeatureFlag(env.VITE_FF_COACH_LIVE_PROVIDER_V1, mode),
    trainingPreservationOsV1: resolveFeatureFlag(env.VITE_FF_TRAINING_PRESERVATION_OS_V1, mode),
    nativeDeviceProofV1: resolveFeatureFlag(env.VITE_FF_NATIVE_DEVICE_PROOF_V1, mode),
    paidAccountOpsV1: resolveFeatureFlag(env.VITE_FF_PAID_ACCOUNT_OPS_V1, mode),
    supportOpsV1: resolveFeatureFlag(env.VITE_FF_SUPPORT_OPS_V1, mode),
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

  if (!resolvedFlags.nutritionOverviewV1) {
    resolvedFlags.nutritionOverviewV2 = false
  }

  if (!resolvedFlags.garminConnectV1) {
    resolvedFlags.garminIntelligenceV2 = false
  }

  if (!resolvedFlags.coachEngineV3) {
    resolvedFlags.coachModulesV1 = false
    resolvedFlags.fastCheckInV1 = false
  }

  if (!resolvedFlags.bodyMetricsV1 && !resolvedFlags.progressPhotosV1) {
    resolvedFlags.bodyProgressGalleryV2 = false
    resolvedFlags.bodyProgressCompareV1 = false
  }

  if (!resolvedFlags.nutritionOverviewV2) {
    resolvedFlags.nutrientGoalsV1 = false
    resolvedFlags.nutritionCatalogV3 = false
  }

  if (!resolvedFlags.foodTruthV2) {
    resolvedFlags.loggingShortcutsV1 = false
  }

  if (!resolvedFlags.workoutsV1) {
    resolvedFlags.workoutsAnalyticsV2 = false
    resolvedFlags.workoutRecordsV1 = false
  }

  if (!resolvedFlags.dashboardV1) {
    resolvedFlags.dashboardInsightsV2 = false
    resolvedFlags.claimGateV1 = false
    resolvedFlags.commandHomeV1 = false
  }

  if (!resolvedFlags.workoutsAnalyticsV2) {
    resolvedFlags.workoutRecordsV1 = false
  }

  if (!resolvedFlags.bodyMetricsV1 && !resolvedFlags.progressPhotosV1) {
    resolvedFlags.bodyMetricVisibilityV1 = false
    resolvedFlags.progressStoryV1 = false
  }

  if (!resolvedFlags.benchmarkSuiteV1) {
    resolvedFlags.claimGateV1 = false
  }

  if (!resolvedFlags.dashboardV1 || !resolvedFlags.coachEngineV3) {
    resolvedFlags.cutModeV1 = false
  }

  if (!resolvedFlags.loggingShortcutsV1) {
    resolvedFlags.repeatLoggingV2 = false
  }

  if (!resolvedFlags.cutModeV1) {
    resolvedFlags.cutDayOsV1 = false
  }

  if (!resolvedFlags.repeatLoggingV2) {
    resolvedFlags.phaseTemplatesV1 = false
  }

  if (!resolvedFlags.workoutsAnalyticsV2 || !resolvedFlags.coachEngineV3) {
    resolvedFlags.trainingGuidanceV2 = false
  }

  if (!resolvedFlags.trainingGuidanceV2) {
    resolvedFlags.trainingPreservationV1 = false
  }

  if (!resolvedFlags.bodyProgressCompareV1) {
    resolvedFlags.progressStoryV1 = false
  }

  if (!resolvedFlags.progressStoryV1) {
    resolvedFlags.progressProofV2 = false
  }

  if (
    !resolvedFlags.loggingShortcutsV1 &&
    !resolvedFlags.workoutsAnalyticsV2 &&
    !resolvedFlags.bodyProgressCompareV1
  ) {
    resolvedFlags.quietSettingsV1 = false
  }

  if (!resolvedFlags.dashboardV1 || !resolvedFlags.loggingShortcutsV1) {
    resolvedFlags.captureConvenienceV1 = false
  }

  if (!resolvedFlags.quietSettingsV1) {
    resolvedFlags.quietPowerV1 = false
  }

  if (!resolvedFlags.commandHomeV1) {
    resolvedFlags.commandSurfaceV2 = false
  }

  if (!resolvedFlags.phaseTemplatesV1) {
    resolvedFlags.loggingMaturityV1 = false
  }

  if (!resolvedFlags.trainingPreservationV1) {
    resolvedFlags.trainingTrustV1 = false
  }

  if (!resolvedFlags.progressProofV2) {
    resolvedFlags.progressProofFinishV1 = false
  }

  if (
    !resolvedFlags.quietPowerV1 ||
    !resolvedFlags.commandSurfaceV2 ||
    !resolvedFlags.loggingMaturityV1 ||
    !resolvedFlags.trainingTrustV1 ||
    !resolvedFlags.progressProofFinishV1
  ) {
    resolvedFlags.cohesionFinishV1 = false
  }

  if (!resolvedFlags.premiumDesignV1) {
    resolvedFlags.mobileIaV1 = false
    resolvedFlags.motionSystemV1 = false
  }

  if (!resolvedFlags.premiumUiV1) {
    resolvedFlags.premiumLogSummaryV2 = false
    resolvedFlags.premiumFastLogToolbarV2 = false
    resolvedFlags.premiumMealLedgerV2 = false
    resolvedFlags.premiumProofStripV1 = false
  }

  if (!resolvedFlags.commandSurfaceV2) {
    resolvedFlags.commandSurfacePolishV1 = false
  }

  if (
    !resolvedFlags.loggingMaturityV1 ||
    !resolvedFlags.trainingTrustV1 ||
    !resolvedFlags.progressProofFinishV1
  ) {
    resolvedFlags.screenFinishV1 = false
  }

  if (!resolvedFlags.cohesionFinishV1) {
    resolvedFlags.settingsHubV1 = false
  }

  if (!resolvedFlags.coachEngineV3) {
    resolvedFlags.adaptiveCutIntelligenceV1 = false
  }

  if (!resolvedFlags.adaptiveCutIntelligenceV1) {
    resolvedFlags.adaptiveCutReviewSurfaceV1 = false
  }

  if (
    !resolvedFlags.commandSurfaceV2 ||
    !resolvedFlags.adaptiveCutIntelligenceV1 ||
    !resolvedFlags.trainingPreservationV1 ||
    !resolvedFlags.progressProofV2 ||
    !resolvedFlags.foodTruthV2 ||
    !resolvedFlags.cutDayOsV1
  ) {
    resolvedFlags.paidCutOsV1 = false
  }

  if (!resolvedFlags.paidCutOsV1) {
    resolvedFlags.cutOsImportFocusV1 = false
    resolvedFlags.coachProofAnswerV1 = false
    resolvedFlags.macroFactorCorpusGateV1 = false
    resolvedFlags.standaloneCutNineV1 = false
    resolvedFlags.firstTenMinuteActivationV1 = false
    resolvedFlags.coachProofDefaultV2 = false
    resolvedFlags.cutOsReplayValidationV1 = false
  }

  if (!resolvedFlags.foodTruthV2) {
    resolvedFlags.standaloneCutNineV1 = false
    resolvedFlags.foodTrustConfidenceV3 = false
  }

  if (!resolvedFlags.standaloneCutNineV1) {
    resolvedFlags.foodTrustConfidenceV3 = false
    resolvedFlags.firstTenMinuteActivationV1 = false
    resolvedFlags.coachProofDefaultV2 = false
    resolvedFlags.cutOsReplayValidationV1 = false
  }

  if (!resolvedFlags.standaloneCutNineV1) {
    resolvedFlags.macroFactorSurpassV1 = false
  }

  if (!resolvedFlags.macroFactorSurpassV1) {
    resolvedFlags.unifiedLoggerV1 = false
    resolvedFlags.aiMealCaptureV1 = false
    resolvedFlags.foodDatabaseTrustV1 = false
    resolvedFlags.cutOsExpenditureValidationV1 = false
    resolvedFlags.coachLiveProviderV1 = false
    resolvedFlags.trainingPreservationOsV1 = false
    resolvedFlags.nativeDeviceProofV1 = false
    resolvedFlags.paidAccountOpsV1 = false
    resolvedFlags.supportOpsV1 = false
  }

  if (!resolvedFlags.captureConvenienceV1) {
    resolvedFlags.aiMealCaptureV1 = false
  }

  if (!resolvedFlags.foodTrustConfidenceV3) {
    resolvedFlags.foodDatabaseTrustV1 = false
  }

  if (!resolvedFlags.cutOsReplayValidationV1) {
    resolvedFlags.cutOsExpenditureValidationV1 = false
  }

  if (!resolvedFlags.trainingPreservationV1) {
    resolvedFlags.trainingPreservationOsV1 = false
  }

  if (!resolvedFlags.coachProofDefaultV2) {
    resolvedFlags.coachLiveProviderV1 = false
  }

  return resolvedFlags
}

export const FEATURE_FLAGS = buildFeatureFlags(import.meta.env as Record<string, string | boolean | undefined>)
