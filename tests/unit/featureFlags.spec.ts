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
      safeAutoUpdatePwa: false,
      nutritionOverviewV1: false,
      coachEngineV3: false,
      nutritionOverviewV2: false,
      foodTruthV2: false,
      garminIntelligenceV2: false,
      bodyMetricsV1: false,
      progressPhotosV1: false,
      workoutsV1: false,
      encryptedSyncV2: false,
      coachEvidenceAI: false,
      benchmarkSuiteV1: false,
      recoveryPacksV1: false,
      dashboardV1: false,
      coachModulesV1: false,
      bodyProgressGalleryV2: false,
      cutModeV1: false,
      nutrientGoalsV1: false,
      fastCheckInV1: false,
      loggingShortcutsV1: false,
      workoutsAnalyticsV2: false,
      bodyProgressCompareV1: false,
      dashboardInsightsV2: false,
      nutritionCatalogV3: false,
      workoutRecordsV1: false,
      bodyMetricVisibilityV1: false,
      claimGateV1: false,
      commandHomeV1: false,
      cutDayOsV1: false,
      repeatLoggingV2: false,
      phaseTemplatesV1: false,
      trainingGuidanceV2: false,
      trainingPreservationV1: false,
      progressStoryV1: false,
      progressProofV2: false,
      quietSettingsV1: false,
      quietPowerV1: false,
      captureConvenienceV1: false,
      commandSurfaceV2: false,
      loggingMaturityV1: false,
      trainingTrustV1: false,
      progressProofFinishV1: false,
      cohesionFinishV1: false,
      premiumDesignV1: false,
      premiumUiV1: false,
      premiumLogSummaryV2: false,
      premiumFastLogToolbarV2: false,
      premiumMealLedgerV2: false,
      premiumProofStripV1: false,
      mobileIaV1: false,
      commandSurfacePolishV1: false,
      screenFinishV1: false,
      settingsHubV1: false,
      motionSystemV1: false,
      adaptiveCutIntelligenceV1: false,
      adaptiveCutReviewSurfaceV1: false,
      paidCutOsV1: false,
      cutOsImportFocusV1: false,
      coachProofAnswerV1: false,
      macroFactorCorpusGateV1: false,
      standaloneCutNineV1: false,
      foodTrustConfidenceV3: false,
      firstTenMinuteActivationV1: false,
      coachProofDefaultV2: false,
      cutOsReplayValidationV1: false,
      serverFunctionTypecheckGateV1: false,
      macroFactorSurpassV1: false,
      unifiedLoggerV1: false,
      aiMealCaptureV1: false,
      foodDatabaseTrustV1: false,
      cutOsExpenditureValidationV1: false,
      coachLiveProviderV1: false,
      trainingPreservationOsV1: false,
      nativeDeviceProofV1: false,
      paidAccountOpsV1: false,
      supportOpsV1: false,
      mistakeProofCutV1: false,
      dailyGuardrailsV1: false,
      foodTrustRepairV1: false,
      coachMistakeProofV1: false,
      surfaceConsistencyGuardV1: false,
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
      safeAutoUpdatePwa: true,
      nutritionOverviewV1: true,
      coachEngineV3: true,
      nutritionOverviewV2: true,
      foodTruthV2: true,
      garminIntelligenceV2: true,
      bodyMetricsV1: true,
      progressPhotosV1: true,
      workoutsV1: true,
      encryptedSyncV2: true,
      coachEvidenceAI: true,
      benchmarkSuiteV1: true,
      recoveryPacksV1: true,
      dashboardV1: true,
      coachModulesV1: true,
      bodyProgressGalleryV2: true,
      cutModeV1: true,
      nutrientGoalsV1: true,
      fastCheckInV1: true,
      loggingShortcutsV1: true,
      workoutsAnalyticsV2: true,
      bodyProgressCompareV1: true,
      dashboardInsightsV2: true,
      nutritionCatalogV3: true,
      workoutRecordsV1: true,
      bodyMetricVisibilityV1: true,
      claimGateV1: true,
      commandHomeV1: true,
      cutDayOsV1: true,
      repeatLoggingV2: true,
      phaseTemplatesV1: true,
      trainingGuidanceV2: true,
      trainingPreservationV1: true,
      progressStoryV1: true,
      progressProofV2: true,
      quietSettingsV1: true,
      quietPowerV1: true,
      captureConvenienceV1: true,
      commandSurfaceV2: true,
      loggingMaturityV1: true,
      trainingTrustV1: true,
      progressProofFinishV1: true,
      cohesionFinishV1: true,
      premiumDesignV1: true,
      premiumUiV1: true,
      premiumLogSummaryV2: true,
      premiumFastLogToolbarV2: true,
      premiumMealLedgerV2: true,
      premiumProofStripV1: true,
      mobileIaV1: true,
      commandSurfacePolishV1: true,
      screenFinishV1: true,
      settingsHubV1: true,
      motionSystemV1: true,
      adaptiveCutIntelligenceV1: true,
      adaptiveCutReviewSurfaceV1: true,
      paidCutOsV1: true,
      cutOsImportFocusV1: true,
      coachProofAnswerV1: true,
      macroFactorCorpusGateV1: true,
      standaloneCutNineV1: true,
      foodTrustConfidenceV3: true,
      firstTenMinuteActivationV1: true,
      coachProofDefaultV2: true,
      cutOsReplayValidationV1: true,
      serverFunctionTypecheckGateV1: true,
      macroFactorSurpassV1: true,
      unifiedLoggerV1: true,
      aiMealCaptureV1: false,
      foodDatabaseTrustV1: true,
      cutOsExpenditureValidationV1: true,
      coachLiveProviderV1: true,
      trainingPreservationOsV1: true,
      nativeDeviceProofV1: true,
      paidAccountOpsV1: true,
      supportOpsV1: true,
      mistakeProofCutV1: true,
      dailyGuardrailsV1: true,
      foodTrustRepairV1: true,
      coachMistakeProofV1: true,
      surfaceConsistencyGuardV1: true,
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
      safeAutoUpdatePwa: false,
      nutritionOverviewV1: false,
      coachEngineV3: false,
      nutritionOverviewV2: false,
      foodTruthV2: false,
      garminIntelligenceV2: false,
      bodyMetricsV1: false,
      progressPhotosV1: false,
      workoutsV1: false,
      encryptedSyncV2: false,
      coachEvidenceAI: false,
      benchmarkSuiteV1: false,
      recoveryPacksV1: false,
      dashboardV1: false,
      coachModulesV1: false,
      bodyProgressGalleryV2: false,
      cutModeV1: false,
      nutrientGoalsV1: false,
      fastCheckInV1: false,
      loggingShortcutsV1: false,
      workoutsAnalyticsV2: false,
      bodyProgressCompareV1: false,
      dashboardInsightsV2: false,
      nutritionCatalogV3: false,
      workoutRecordsV1: false,
      bodyMetricVisibilityV1: false,
      claimGateV1: false,
      commandHomeV1: false,
      cutDayOsV1: false,
      repeatLoggingV2: false,
      phaseTemplatesV1: false,
      trainingGuidanceV2: false,
      trainingPreservationV1: false,
      progressStoryV1: false,
      progressProofV2: false,
      quietSettingsV1: false,
      quietPowerV1: false,
      captureConvenienceV1: false,
      commandSurfaceV2: false,
      loggingMaturityV1: false,
      trainingTrustV1: false,
      progressProofFinishV1: false,
      cohesionFinishV1: false,
      premiumDesignV1: false,
      premiumUiV1: false,
      premiumLogSummaryV2: false,
      premiumFastLogToolbarV2: false,
      premiumMealLedgerV2: false,
      premiumProofStripV1: false,
      mobileIaV1: false,
      commandSurfacePolishV1: false,
      screenFinishV1: false,
      settingsHubV1: false,
      motionSystemV1: false,
      adaptiveCutIntelligenceV1: false,
      adaptiveCutReviewSurfaceV1: false,
      paidCutOsV1: false,
      cutOsImportFocusV1: false,
      coachProofAnswerV1: false,
      macroFactorCorpusGateV1: false,
      standaloneCutNineV1: false,
      foodTrustConfidenceV3: false,
      firstTenMinuteActivationV1: false,
      coachProofDefaultV2: false,
      cutOsReplayValidationV1: false,
      serverFunctionTypecheckGateV1: false,
      macroFactorSurpassV1: false,
      unifiedLoggerV1: false,
      aiMealCaptureV1: false,
      foodDatabaseTrustV1: false,
      cutOsExpenditureValidationV1: false,
      coachLiveProviderV1: false,
      trainingPreservationOsV1: false,
      nativeDeviceProofV1: false,
      paidAccountOpsV1: false,
      supportOpsV1: false,
      mistakeProofCutV1: false,
      dailyGuardrailsV1: false,
      foodTrustRepairV1: false,
      coachMistakeProofV1: false,
      surfaceConsistencyGuardV1: false,
    })
  })

  it('disables cut mode when dashboard or coach engine v3 are off', () => {
    expect(
      buildFeatureFlags({
        MODE: 'production',
        VITE_FF_DASHBOARD_V1: 'true',
        VITE_FF_COACH_ENGINE_V3: 'false',
        VITE_FF_CUT_MODE_V1: 'true',
      }).cutModeV1,
    ).toBe(false)

    expect(
      buildFeatureFlags({
        MODE: 'production',
        VITE_FF_DASHBOARD_V1: 'false',
        VITE_FF_COACH_ENGINE_V3: 'true',
        VITE_FF_CUT_MODE_V1: 'true',
      }).cutModeV1,
    ).toBe(false)
  })

  it('downgrades new dependent flags when their prerequisites are disabled', () => {
    const flags = buildFeatureFlags({
      MODE: 'production',
      VITE_FF_NUTRITION_OVERVIEW_V2: 'false',
      VITE_FF_NUTRIENT_GOALS_V1: 'true',
      VITE_FF_COACH_ENGINE_V3: 'false',
      VITE_FF_FAST_CHECK_IN_V1: 'true',
      VITE_FF_FOOD_TRUTH_V2: 'false',
      VITE_FF_LOGGING_SHORTCUTS_V1: 'true',
      VITE_FF_WORKOUTS_V1: 'false',
      VITE_FF_WORKOUTS_ANALYTICS_V2: 'true',
      VITE_FF_BODY_METRICS_V1: 'false',
      VITE_FF_PROGRESS_PHOTOS_V1: 'false',
      VITE_FF_BODY_PROGRESS_COMPARE_V1: 'true',
      VITE_FF_DASHBOARD_V1: 'false',
      VITE_FF_DASHBOARD_INSIGHTS_V2: 'true',
      VITE_FF_NUTRITION_CATALOG_V3: 'true',
      VITE_FF_WORKOUT_RECORDS_V1: 'true',
      VITE_FF_BODY_METRIC_VISIBILITY_V1: 'true',
      VITE_FF_CLAIM_GATE_V1: 'true',
      VITE_FF_COMMAND_HOME_V1: 'true',
      VITE_FF_REPEAT_LOGGING_V2: 'true',
      VITE_FF_TRAINING_GUIDANCE_V2: 'true',
      VITE_FF_PROGRESS_STORY_V1: 'true',
      VITE_FF_QUIET_SETTINGS_V1: 'true',
      VITE_FF_ADAPTIVE_CUT_INTELLIGENCE_V1: 'true',
      VITE_FF_ADAPTIVE_CUT_REVIEW_SURFACE_V1: 'true',
      VITE_FF_PAID_CUT_OS_V1: 'true',
    })

    expect(flags.nutrientGoalsV1).toBe(false)
    expect(flags.nutritionCatalogV3).toBe(false)
    expect(flags.fastCheckInV1).toBe(false)
    expect(flags.loggingShortcutsV1).toBe(false)
    expect(flags.workoutsAnalyticsV2).toBe(false)
    expect(flags.workoutRecordsV1).toBe(false)
    expect(flags.bodyProgressCompareV1).toBe(false)
    expect(flags.bodyMetricVisibilityV1).toBe(false)
    expect(flags.dashboardInsightsV2).toBe(false)
    expect(flags.claimGateV1).toBe(false)
    expect(flags.commandHomeV1).toBe(false)
    expect(flags.repeatLoggingV2).toBe(false)
    expect(flags.trainingGuidanceV2).toBe(false)
    expect(flags.progressStoryV1).toBe(false)
    expect(flags.quietSettingsV1).toBe(false)
    expect(flags.adaptiveCutIntelligenceV1).toBe(false)
    expect(flags.adaptiveCutReviewSurfaceV1).toBe(false)
    expect(flags.paidCutOsV1).toBe(false)
    expect(flags.cutOsImportFocusV1).toBe(false)
    expect(flags.coachProofAnswerV1).toBe(false)
    expect(flags.macroFactorCorpusGateV1).toBe(false)
    expect(flags.standaloneCutNineV1).toBe(false)
    expect(flags.foodTrustConfidenceV3).toBe(false)
    expect(flags.firstTenMinuteActivationV1).toBe(false)
    expect(flags.coachProofDefaultV2).toBe(false)
    expect(flags.cutOsReplayValidationV1).toBe(false)
    expect(flags.mistakeProofCutV1).toBe(false)
    expect(flags.dailyGuardrailsV1).toBe(false)
    expect(flags.foodTrustRepairV1).toBe(false)
    expect(flags.coachMistakeProofV1).toBe(false)
    expect(flags.surfaceConsistencyGuardV1).toBe(false)
  })

  it('enables the paid Cut OS preview preset in production while keeping AI meal photo retired', () => {
    const flags = buildFeatureFlags({
      MODE: 'production',
      VITE_APP_FEATURE_PRESET: 'paid-cut-os-preview',
    })

    expect(flags.premiumUiV1).toBe(true)
    expect(flags.paidCutOsV1).toBe(true)
    expect(flags.standaloneCutNineV1).toBe(true)
    expect(flags.macroFactorSurpassV1).toBe(true)
    expect(flags.mistakeProofCutV1).toBe(true)
    expect(flags.dailyGuardrailsV1).toBe(true)
    expect(flags.foodTrustRepairV1).toBe(true)
    expect(flags.coachMistakeProofV1).toBe(true)
    expect(flags.surfaceConsistencyGuardV1).toBe(true)
    expect(flags.aiMealCaptureV1).toBe(false)
  })

  it('downgrades premium finish flags when their prerequisites are disabled', () => {
    const flags = buildFeatureFlags({
      MODE: 'production',
      VITE_FF_PREMIUM_DESIGN_V1: 'false',
      VITE_FF_PREMIUM_UI_V1: 'false',
      VITE_FF_PREMIUM_LOG_SUMMARY_V2: 'true',
      VITE_FF_PREMIUM_FAST_LOG_TOOLBAR_V2: 'true',
      VITE_FF_PREMIUM_MEAL_LEDGER_V2: 'true',
      VITE_FF_PREMIUM_PROOF_STRIP_V1: 'true',
      VITE_FF_MOBILE_IA_V1: 'true',
      VITE_FF_MOTION_SYSTEM_V1: 'true',
      VITE_FF_COMMAND_HOME_V1: 'false',
      VITE_FF_COMMAND_SURFACE_V2: 'true',
      VITE_FF_COMMAND_SURFACE_POLISH_V1: 'true',
      VITE_FF_PHASE_TEMPLATES_V1: 'false',
      VITE_FF_LOGGING_MATURITY_V1: 'true',
      VITE_FF_TRAINING_PRESERVATION_V1: 'false',
      VITE_FF_TRAINING_TRUST_V1: 'true',
      VITE_FF_PROGRESS_PROOF_V2: 'false',
      VITE_FF_PROGRESS_PROOF_FINISH_V1: 'true',
      VITE_FF_SCREEN_FINISH_V1: 'true',
      VITE_FF_COHESION_FINISH_V1: 'false',
      VITE_FF_SETTINGS_HUB_V1: 'true',
    })

    expect(flags.mobileIaV1).toBe(false)
    expect(flags.motionSystemV1).toBe(false)
    expect(flags.commandSurfaceV2).toBe(false)
    expect(flags.commandSurfacePolishV1).toBe(false)
    expect(flags.loggingMaturityV1).toBe(false)
    expect(flags.trainingTrustV1).toBe(false)
    expect(flags.progressProofFinishV1).toBe(false)
    expect(flags.screenFinishV1).toBe(false)
    expect(flags.settingsHubV1).toBe(false)
    expect(flags.premiumLogSummaryV2).toBe(false)
    expect(flags.premiumFastLogToolbarV2).toBe(false)
    expect(flags.premiumMealLedgerV2).toBe(false)
    expect(flags.premiumProofStripV1).toBe(false)
  })
})
