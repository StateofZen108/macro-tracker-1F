export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type FoodSource = 'seed' | 'custom' | 'api' | 'recipe'
export type CatalogProvider = 'open_food_facts' | 'usda_fdc' | 'fatsecret'
export type FoodImportConfidence = 'direct_match' | 'weak_match' | 'manual_review_required'
export type FoodSourceQuality = 'high' | 'medium' | 'low'
export type TabId = 'dashboard' | 'log' | 'weight' | 'workouts' | 'coach' | 'settings'
export type PrimaryTabId = 'dashboard' | 'log' | 'weight' | 'workouts' | 'coach'
export type SettingsHubSectionId =
  | 'dashboard'
  | 'logging'
  | 'workouts'
  | 'body_progress'
  | 'data_sync'
export type WeightRange = '30' | '90' | 'all'
export type WeightUnit = 'lb' | 'kg'
export type BarcodeVerification = 'verified' | 'needsConfirmation'
export type NutritionBasis = 'serving' | '100g' | '100ml' | 'unknown'
export type ImportTrustLevel = 'exact_autolog' | 'exact_review' | 'blocked'
export type FoodReviewStatus = 'pending' | 'resolved' | 'dismissed'
export type FoodReviewSource = 'barcode' | 'ocr' | 'catalog_import' | 'orphaned_log_entry'
export type ServingBasisSource =
  | 'provider_serving'
  | 'provider_quantity'
  | 'label_metric'
  | 'label_parenthetical_metric'
  | 'per100g_fallback'
  | 'per100ml_fallback'
  | 'manual_review'
export type ImportTrustBlockingIssue =
  | 'missing_macros'
  | 'estimated_serving'
  | 'unknown_serving_basis'
  | 'per100_fallback'
  | 'provider_conflict'
  | 'low_ocr_confidence'
export type LabelNutritionFieldKey =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'sugars'
  | 'salt'
  | 'sodium'
export type LabelOcrLocale = 'us' | 'uk_eu' | 'mixed' | 'unknown'
export type LabelOcrProvider = 'gemini'
export type LabelOcrServingIssueCode =
  | 'estimated_serving'
  | 'unknown_serving_basis'
  | 'per100_fallback'
  | 'provider_conflict'
  | 'low_ocr_confidence'
export type LabelOcrServingInterpretationSource =
  | 'label'
  | 'provider'
  | 'label_and_provider'
  | 'manual'
export type LabelOcrServingInterpretationKind =
  | 'explicit_metric'
  | 'container_metric'
  | 'per100_metric'
  | 'manual'
export type RecoverableIssueScope =
  | 'foods'
  | 'weights'
  | 'settings'
  | 'logs'
  | 'migration'
  | 'activity'
  | 'checkins'
export type ImportMode = 'replace' | 'merge'
export type HistoryImportProvider = 'macrofactor' | 'renpho'
export type HistoryImportFileKind =
  | 'macrofactor_food_rows'
  | 'macrofactor_weights'
  | 'renpho_weights'
export type BulkApplyMode = 'append' | 'replaceTarget' | 'cancel'
export type NetworkStatus = 'online' | 'offline'
export type SyncScope =
  | 'foods'
  | 'food_log_entries'
  | 'weights'
  | 'day_meta'
  | 'activity'
  | 'wellness'
  | 'recovery_check_ins'
  | 'diet_phases'
  | 'diet_phase_events'
  | 'interventions'
  | 'meal_templates'
  | 'recipes'
  | 'favorite_foods'
  | 'weekly_check_ins'
  | 'coach_decisions'
  | 'settings_targets'
  | 'settings_preferences'
  | 'settings_coaching_runtime'
export type SyncStatus =
  | 'signedOut'
  | 'notConfigured'
  | 'authenticating'
  | 'bootstrapRequired'
  | 'syncing'
  | 'upToDate'
  | 'offlineChangesPending'
  | 'error'
  | 'reauthRequired'
export type GoalMode = 'lose' | 'maintain' | 'gain'
export type FatLossMode = 'standard_cut' | 'psmf' | 'carb_cycle'
export type CoachingConfidence = 'none' | 'low' | 'medium' | 'high'
export type CoachingTone = 'neutral' | 'under' | 'over' | 'onTrack'
export type DayStatus = 'unmarked' | 'complete' | 'partial' | 'fasting'
export type DayConfounderMarker = 'travel' | 'illness' | 'high_calorie_event'
export type InterventionCategory = 'supplement' | 'medication' | 'stimulant' | 'peptide' | 'other'
export type InterventionRoute = 'oral' | 'subcutaneous' | 'intramuscular' | 'topical' | 'other'
export type CardioType = 'walk' | 'incline_treadmill' | 'bike' | 'run' | 'other'
export type WellnessProvider = 'garmin'
export type ProgressPhotoPose = 'front' | 'side' | 'back'
export type GarminImportedWeightState = 'imported' | 'ignored_conflict'
export type DietPhaseType = 'psmf' | 'diet_break' | 'carb_cycle'
export type DietPhaseStatus = 'planned' | 'active' | 'expired' | 'completed' | 'cancelled'
export type DietPhaseEventType = 'refeed_day' | 'high_carb_day'
export type RecoverySeverity = 'green' | 'yellow' | 'red'
export type ComplianceRiskLevel = 'low' | 'medium' | 'high'
export type MicronutrientStatus = 'low' | 'adequate' | 'high' | 'limited'
export type NutrientGoalMode = 'auto' | 'custom' | 'none'
export type GarminHistoryWindow = '7d' | '30d' | '90d'
export type CommandSurfaceDensity = 'tight' | 'balanced' | 'fallback_stack'
export type MotionPresetId = 'fast' | 'standard' | 'sheet' | 'reduced'
export type LoggingToolbarStyle =
  | 'search_barcode'
  | 'search_barcode_custom'
  | 'four_custom'
  | 'none'
export type LoggingShortcutId = 'scanner' | 'ocr' | 'custom'
export type ToolbarColorToken = 'teal' | 'slate' | 'amber' | 'rose'
export type WorkoutAnalyticsRange = '7d' | '30d' | '90d' | '365d' | 'all'
export type WorkoutRecordMetric = 'volume' | 'reps' | 'estimated_1rm'
export type WorkoutAction = 'push' | 'hold' | 'back_off' | 'neutral'
export type CutDayType =
  | 'standard_cut_day'
  | 'psmf_day'
  | 'refeed_day'
  | 'diet_break_day'
  | 'high_carb_day'
export type BodyProgressCompareMode = 'side_by_side' | 'overlay'
export type BodyProgressScaleContext =
  | 'neutral'
  | 'expected_refeed_spike'
  | 'expected_diet_break_spike'
export type CaptureConsistency = 'tight' | 'mixed' | 'loose'
export type TemplateSeedReviewState = 'pending_review' | 'accepted' | 'rejected'
export type WorkoutEvidenceReason =
  | 'readiness_freshness'
  | 'anchor_lift_trend'
  | 'recent_records'
  | 'volume_floor'
  | 'completion_adherence'
export type CaptureChecklistItemId =
  | 'pose_match'
  | 'crop_match'
  | 'distance_match'
  | 'lighting_match'
export type CaptureChecklistStatus = 'pass' | 'watch' | 'missing'
export type BodyProgressGalleryMode = 'latest_vs_compare' | 'before_after'
export type WorkoutRestTimerSound = 'soft' | 'beep' | 'silent'
export type GarminConnectionStatus =
  | 'not_connected'
  | 'connected'
  | 'syncing'
  | 'rate_limited'
  | 'error'
  | 'reconnect_required'
export type CalibrationPhase = 'none' | 'collecting' | 'provisional' | 'calibrated'
export type CoachMode = 'standard' | 'deep'
export type CoachProvider = 'none' | 'gemini' | 'openai' | 'anthropic'
export type CoachState = 'ready' | 'offline' | 'queued' | 'sending' | 'failed' | 'notConfigured'
export type CoachModuleKind = 'partial_logging' | 'fasting' | 'logging_break' | 'program_update'
export type CoachInterventionKind =
  | 'logging_cleanup'
  | 'hold_target'
  | 'diet_break_prompt'
  | 'deload_prompt'
  | 'stay_the_course'
export type CoachAnswerType =
  | 'data-aware'
  | 'general-evidence'
  | 'insufficient-data'
  | 'safety-limited'
  | 'not-configured'
export type CoachClaimSource = 'Your data' | 'App inference' | 'Evidence'
export type CoachFeedbackRating = 'up' | 'down'
export type RepoWriteSource = 'ui' | 'sync' | 'bootstrap' | 'migration' | 'import' | 'system'
export type WorkoutGoal = 'strength_preservation' | 'hypertrophy' | 'general_strength'
export type WorkoutMuscleGroup =
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'glutes'
  | 'core'
  | 'full_body'
  | 'cardio'
export type ProgressionDecisionType = 'increase_load' | 'increase_reps' | 'hold' | 'decrease_load'
export type EncryptedSyncEnvelopeStatus = 'queued' | 'replicated' | 'failed'
export type EncryptedSyncRecordKind =
  | 'food_review_queue'
  | 'garmin_imported_weights'
  | 'garmin_modifier_records'
  | 'garmin_workout_summaries'
  | 'workout_programs'
  | 'workout_sessions'
  | 'progression_decisions'
  | 'body_progress'
  | 'coaching_history'
export type RepoErrorCode =
  | 'validation'
  | 'notFound'
  | 'storageUnavailable'
  | 'conflict'
  | 'migrationFailed'
export type DiagnosticsSeverity = 'info' | 'warning' | 'error'
export type DiagnosticsEventType =
  | 'sync_push_failed'
  | 'sync_dead_letter_created'
  | 'sync_bootstrap_failed'
  | 'ocr_extract_failed'
  | 'storage_migration_failed'
  | 'storage_recovery_triggered'
  | 'food_identity_conflict'
  | 'food_catalog_search_failed'
  | 'saved_meal_apply_failed'
  | 'recipe_rollup_failed'
  | 'coaching_engine_blocked'
  | 'nutrient_roundtrip_failed'
  | 'saved_meal_import_alias_conflict'
  | 'coaching_decision_applied'
  | 'coaching_decision_overridden'
  | 'coaching_backtest_regression'
  | 'describe_food_draft_failed'
  | 'catalog_provider_unmapped_hit'
  | 'food_alias_trimmed'
  | 'coach_method_v2_diverged'
  | 'coach_history_roundtrip_failed'
  | 'feature_flag_dependency_invalid'
  | 'garmin_sync_failed'
  | 'garmin_sync_rate_limited'
  | 'garmin_reconnect_required'
  | 'garmin_sync_succeeded'
  | 'food_truth_v2_review_item_created'
  | 'food_truth_v2_review_item_creation_failed'
  | 'food_truth_v2_orphaned_entry_queued'
  | 'food_truth_v2_resolve_preempted_dismiss'
  | 'garmin_v2_sync_failed'
  | 'garmin_v2_sync_succeeded'
  | 'garmin_v2_local_weight_wins'
  | 'garmin_v2_activity_modifier_attached'
  | 'garmin_v2_activity_modifier_deferred'
  | 'workouts_v1_progression_applied'
  | 'workouts_v1_progression_failed'
  | 'sync_v2_replication_succeeded'
  | 'sync_v2_replication_failed'
  | 'sync_v2_replication_paused_flag_off'
  | 'benchmark_v1_suite_passed'
  | 'benchmark_v1_suite_failed'
  | 'benchmark_v1_claim_blocked'
  | 'barcode_lookup_completed'
  | 'barcode_lookup_downgraded'
  | 'barcode_lookup_blocked'
  | 'barcode_autolog_used'
  | 'ocr_review_opened'
  | 'ocr_review_saved'
  | 'ocr_review_blocked'
  | 'serving_basis_conflict_detected'
  | 'barcode_provider_failed'
  | 'food_truth_rollout_alert'
  | 'pwa_update_waiting_detected'
  | 'pwa_update_waiting_cleared'
  | 'pwa_update_auto_apply_deferred'
  | 'pwa_update_auto_apply_cancelled'
  | 'pwa_update_auto_apply_started'
  | 'pwa_update_auto_apply_suppressed'
  | 'pwa_update_auto_apply_confirmed'
  | 'pwa_update_manual_apply_started'
  | 'pwa_update_apply_failed'
  | 'coach_v3_packet_generated'
  | 'body_progress_snapshot_saved'
  | 'body_progress_snapshot_deleted'
  | 'body_progress_snapshot_failed'
export type CoachProposalType =
  | 'applyCalorieTarget'
  | 'applyMacroTargets'
  | 'setDayStatus'
  | 'dismissCoachingSuggestion'
  | 'openCopyPrevious'
  | 'openInterventionLog'
export type CheckInStatus =
  | 'ready'
  | 'applied'
  | 'kept'
  | 'overridden'
  | 'deferred'
  | 'insufficientData'

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export interface LabelNutritionField {
  normalizedKey?: LabelNutritionFieldKey
  rawLabel: string
  value: number | 'traces'
  unit: string
}

export interface ImportTrust {
  level: ImportTrustLevel
  servingBasis: NutritionBasis
  servingBasisSource: ServingBasisSource
  blockingIssues: ImportTrustBlockingIssue[]
  verifiedAt?: string
}

export interface LabelNutritionPanel {
  fields: LabelNutritionField[]
  servingSizeText?: string
  servingsPerContainer?: number
  locale: LabelOcrLocale
  source: 'label_ocr'
  reviewedAt: string
}

export interface Food {
  id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugars?: number
  salt?: number
  sodium?: number
  nutrients?: NutrientProfileV1
  labelNutrition?: LabelNutritionPanel
  source: FoodSource
  provider?: CatalogProvider
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  importTrust?: ImportTrust
  searchAliases?: string[]
  remoteReferences?: FoodRemoteReference[]
  usageCount: number
  createdAt: string
  barcode?: string
  archivedAt?: string
  lastUsedAt?: string
  lastServings?: number
  lastMealType?: MealType
  updatedAt?: string
}

export interface FoodDraft {
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugars?: number
  salt?: number
  sodium?: number
  nutrients?: NutrientProfileV1
  labelNutrition?: LabelNutritionPanel
  source: FoodSource
  provider?: CatalogProvider
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  importTrust?: ImportTrust
  searchAliases?: string[]
  remoteReferences?: FoodRemoteReference[]
  barcode?: string
}

export interface FoodRemoteReference {
  provider: CatalogProvider
  remoteKey: string
  barcode?: string
}

export interface LabelOcrFieldCandidate extends LabelNutritionField {
  sourceText: string
  confidence: number
  issueCodes?: LabelOcrServingIssueCode[]
}

export interface LabelOcrServingInterpretation {
  id: string
  kind: LabelOcrServingInterpretationKind
  label: string
  source: LabelOcrServingInterpretationSource
  servingSize?: number
  servingUnit?: string
  calorieSummary: string
  selectedByDefault?: boolean
}

export interface LabelOcrReviewSession {
  foodDraft: FoodDraft
  fieldCandidates: LabelOcrFieldCandidate[]
  unmappedFields: LabelOcrFieldCandidate[]
  warnings: string[]
  requiresReview: boolean
  provider: LabelOcrProvider
  topWarning?: string
  servingSizeText?: string
  servingsPerContainer?: number
  caloriesPerContainer?: number
  servingFieldIssueCodes?: LabelOcrServingIssueCode[]
  servingInterpretations?: LabelOcrServingInterpretation[]
}

export interface FoodSnapshot {
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  source: FoodSource
  barcode?: string
  nutrients?: NutrientProfileV1
}

export interface FoodLogEntry {
  id: string
  foodId?: string
  snapshot: FoodSnapshot
  date: string
  meal: MealType
  servings: number
  createdAt: string
  updatedAt?: string
  deletedAt?: string
  needsReview?: boolean
  reviewItemId?: string
}

export interface FoodReviewItem {
  id: string
  status: FoodReviewStatus
  source: FoodReviewSource
  title: string
  reason: string
  createdAt: string
  updatedAt: string
  linkedFoodId?: string
  linkedEntryId?: string
  linkedEntryDate?: string
  resolvedFoodId?: string
  barcode?: string
  trustLevel?: ImportTrustLevel
  resolvedAt?: string
  dismissedAt?: string
}

export interface WeightEntry {
  id: string
  date: string
  weight: number
  unit: WeightUnit
  createdAt: string
  updatedAt?: string
  deletedAt?: string
}

export interface NutrientGoalSetting {
  mode: NutrientGoalMode
  floor?: number
  target?: number
  ceiling?: number
}

export interface PinnedNutrientPreference {
  key: CanonicalNutrientKey
  order: number
}

export interface CoachModuleSetting {
  enabled: boolean
}

export interface FastCheckInPreference {
  enabled: boolean
  skipModuleDetails: boolean
  surfaceEntryPoint?: 'dashboard' | 'coach'
  postResultModuleSummary?: boolean
}

export interface LoggingShortcutPreference {
  barcodeFirst: boolean
  autologExactBarcodeHits: boolean
  prioritizeRecents: boolean
  prioritizeFavorites: boolean
  prioritizeSavedMeals: boolean
  enabledShortcutIds: LoggingShortcutId[]
  shortcutOrder: LoggingShortcutId[]
  mealAwareLane: boolean
  toolbarStyle?: LoggingToolbarStyle
  topShortcutId?: LoggingShortcutId
}

export interface ToolbarShortcutConfig {
  id: LoggingShortcutId
  order: number
  colorToken: ToolbarColorToken
  visible: boolean
}

export interface WorkoutActionOverride {
  date: string
  action: WorkoutAction
  updatedAt: string
}

export interface CustomExerciseDefinition {
  id: string
  name: string
  muscleGroup: WorkoutMuscleGroup
  equipment: string[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface GymProfile {
  id: string
  name: string
  availableEquipment: string[]
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

export interface UserSettings {
  calorieTarget: number
  proteinTarget: number
  carbTarget: number
  fatTarget: number
  weightUnit: WeightUnit
  goalMode: GoalMode
  fatLossMode?: FatLossMode
  coachingEnabled: boolean
  checkInWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  targetWeeklyRatePercent: number
  dailyStepTarget?: number
  weeklyCardioMinuteTarget?: number
  coachingMinCalories?: number
  tdeeEstimate?: number
  lastImportAt?: string
  coachingDismissedAt?: string
  goalModeChangedAt?: string
  goalModeChangedFrom?: GoalMode
  fatLossModeChangedAt?: string
  askCoachEnabled?: boolean
  shareInterventionsWithCoach?: boolean
  coachCitationsExpanded?: boolean
  coachConsentAt?: string
  nutrientGoals?: Partial<Record<CanonicalNutrientKey, NutrientGoalSetting>>
  pinnedNutrients?: PinnedNutrientPreference[]
  focusedNutrientKey?: CanonicalNutrientKey
  coachModuleSettings?: Partial<Record<CoachModuleKind, CoachModuleSetting>>
  fastCheckInPreference?: FastCheckInPreference
  lastFastCheckInRun?: FastCheckInRun
  loggingShortcutPreference?: LoggingShortcutPreference
  customExercises?: CustomExerciseDefinition[]
  gymProfiles?: GymProfile[]
  activeGymProfileId?: string
  dashboardLayout?: DashboardSectionLayout
  dashboardInsights?: DashboardInsightSetting[]
  dashboardDefaultsVersionApplied?: number
  bodyMetricVisibility?: BodyMetricVisibilitySetting[]
  progressPhotoVisibility?: Partial<Record<ProgressPhotoPose, boolean>>
  bodyProgressFocusState?: BodyProgressFocusState
  workoutActionOverrides?: WorkoutActionOverride[]
  garminHistoryWindow?: GarminHistoryWindow
  phaseMealTemplates?: PhaseMealTemplate[]
  loggingToolbarStyle?: LoggingToolbarStyle
  loggingShortcuts?: ToolbarShortcutConfig[]
  featureSettingsVersionApplied?: number
  settingsHubVersionApplied?: number
}

export interface UiPrefs {
  keepOpenAfterAdd: boolean
  preferredAskCoachMode: CoachMode
  coachCitationsExpanded: boolean
  coachAutoSendQueuedWhenOnline: boolean
}

export interface DayMeta {
  date: string
  status: DayStatus
  markers?: DayConfounderMarker[]
  updatedAt: string
}

export interface InterventionEntry {
  id: string
  date: string
  name: string
  category: InterventionCategory
  dose: number
  unit: string
  route?: InterventionRoute
  takenAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface InterventionDraft {
  name: string
  category: InterventionCategory
  dose: number
  unit: string
  route?: InterventionRoute
  takenAt?: string
  notes?: string
}

export interface ActivityEntry {
  date: string
  steps?: number
  cardioMinutes?: number
  cardioType?: CardioType
  notes?: string
  updatedAt: string
  deletedAt?: string
}

export interface ActivityDraft {
  steps?: number
  cardioMinutes?: number
  cardioType?: CardioType
  notes?: string
}

export interface WellnessEntry {
  date: string
  provider: WellnessProvider
  steps?: number
  sleepMinutes?: number
  restingHeartRate?: number
  stressScore?: number
  bodyBatteryMax?: number
  intensityMinutes?: number
  derivedCardioMinutes?: number
  sourceUpdatedAt: string
  updatedAt: string
  deletedAt?: string
}

export interface WellnessDraft {
  provider: WellnessProvider
  steps?: number
  sleepMinutes?: number
  restingHeartRate?: number
  stressScore?: number
  bodyBatteryMax?: number
  intensityMinutes?: number
  derivedCardioMinutes?: number
  sourceUpdatedAt: string
}

export interface RecoveryCheckIn {
  date: string
  energyScore: 1 | 2 | 3 | 4 | 5
  hungerScore: 1 | 2 | 3 | 4 | 5
  sorenessScore: 1 | 2 | 3 | 4 | 5
  sleepQualityScore: 1 | 2 | 3 | 4 | 5
  notes?: string
  updatedAt: string
  deletedAt?: string
}

export interface RecoveryCheckInDraft {
  energyScore: 1 | 2 | 3 | 4 | 5
  hungerScore: 1 | 2 | 3 | 4 | 5
  sorenessScore: 1 | 2 | 3 | 4 | 5
  sleepQualityScore: 1 | 2 | 3 | 4 | 5
  notes?: string
}

export interface DietPhase {
  id: string
  type: DietPhaseType
  status: DietPhaseStatus
  startDate: string
  plannedEndDate: string
  actualEndDate?: string
  calorieTargetOverride?: number
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface DietPhaseDraft {
  type: DietPhaseType
  startDate: string
  plannedEndDate: string
  calorieTargetOverride?: number
  notes?: string
}

export interface DietPhaseEvent {
  id: string
  phaseId: string
  type: DietPhaseEventType
  date: string
  calorieTargetOverride: number
  notes?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface DietPhaseEventDraft {
  phaseId: string
  type: DietPhaseEventType
  date: string
  calorieTargetOverride: number
  notes?: string
}

export interface CutDayPlan {
  date: string
  dayType: CutDayType
  phaseId?: string
  eventId?: string
  macroIntentLabel: string
  trainingIntentLabel: string
  templateId?: string
  whyToday: string
}

export interface PhaseMealTemplateMeal {
  meal: MealType
  savedMealId?: string
}

export interface PhaseMealTemplate {
  id: string
  label: string
  dayType: CutDayType
  meals: PhaseMealTemplateMeal[]
  source: 'manual' | 'saved_meal_map'
  seedSource?: string
  seedReviewState?: TemplateSeedReviewState
  lastSeededAt?: string
  lastAppliedAt?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface RecoveryAssessment {
  date: string
  score: number
  severity: RecoverySeverity
  reasons: string[]
  baselineCoverage: number
}

export interface GarminConnectionInfo {
  status: GarminConnectionStatus
  lastSuccessfulSyncAt?: string
  retryAfterAt?: string
  staleData: boolean
}

export interface GarminImportedWeight {
  id: string
  provider: WellnessProvider
  date: string
  weight: number
  unit: WeightUnit
  sourceUpdatedAt: string
  importedAt: string
  state: GarminImportedWeightState
  conflictLocalWeightId?: string
}

export interface GarminModifierRecord {
  id: string
  provider: WellnessProvider
  date: string
  steps?: number
  sleepMinutes?: number
  restingHeartRate?: number
  activeCalories?: number
  derivedCardioMinutes?: number
  sourceUpdatedAt: string
  importedAt: string
}

export interface GarminWorkoutSummary {
  id: string
  provider: WellnessProvider
  date: string
  workoutName?: string
  startedAt?: string
  durationMinutes?: number
  activeCalories?: number
  averageHeartRate?: number
  sourceUpdatedAt: string
  importedAt: string
}

export interface CheckInMacroTargets {
  protein: number
  carbs: number
  fat: number
}

export interface CheckInRecord {
  id: string
  weekEndDate: string
  weekStartDate: string
  nextCheckInDate?: string
  priorWeekStartDate: string
  priorWeekEndDate: string
  goalMode: GoalMode
  targetWeeklyRatePercent: number
  actualWeeklyRatePercent: number
  avgCalories: number
  avgProtein: number
  avgSteps: number
  weeklyCardioMinutes: number
  stepAdherencePercent: number
  cardioAdherencePercent: number
  avgWeight: number
  priorAvgWeight: number
  recommendedCalorieDelta?: number
  recommendedCalorieTarget?: number
  recommendedMacroTargets?: CheckInMacroTargets
  recommendationReason: string
  recommendationExplanation?: string
  confidenceBand?: CoachingConfidence
  confidenceScore?: number | null
  decisionType?: CoachingDecisionType
  reasonCodes?: Array<CoachingReasonCode | LegacyCoachingCode>
  blockedReasons?: CoachingBlockedReason[]
  dataQuality?: DataQualityScore
  adherence?: AdherenceScore
  confounders?: ConfounderSet
  decisionRecordId?: string
  weeklyCheckInPacket?: WeeklyCheckInPacket
  status: CheckInStatus
  supersededByDecisionRecordId?: string
  createdAt: string
  appliedAt?: string
  updatedAt?: string
}

export interface NutritionOverviewMetric {
  key: CanonicalNutrientKey
  label: string
  unit: NutrientAmountV1['unit']
  value: number
  target: number
  status: MicronutrientStatus
  coveragePercent: number
  goalMode?: NutrientGoalMode
  floor?: number
  ceiling?: number
}

export type NutritionOverviewWindow = 'day' | '7d' | '30d' | '90d' | '365d'

export type DashboardSectionId =
  | 'coach'
  | 'nutrition'
  | 'garmin'
  | 'workouts'
  | 'body_progress'
  | 'food_review'
  | 'benchmark'

export interface FoodContributionRecord {
  id: string
  foodId?: string
  name: string
  brand?: string
  calories: number
  sharePercent: number
  nutrientLabels: string[]
}

export interface DeficiencyAlert {
  id: string
  window: NutritionOverviewWindow
  nutrientKey: CanonicalNutrientKey
  severity: 'info' | 'warning'
  title: string
  message: string
}

export interface NutritionOverviewDay {
  window: NutritionOverviewWindow
  label: string
  startDate: string
  endDate: string
  trackedDays: number
  totalCalories: number
  completenessPercent: number
  metrics: NutritionOverviewMetric[]
  contributors: FoodContributionRecord[]
  deficiencyAlerts: DeficiencyAlert[]
}

export interface SupportedNutrientCatalogEntry {
  key: CanonicalNutrientKey
  label: string
  unit: NutrientAmountV1['unit']
  category: 'macro' | 'label'
}

export interface NutritionDrilldownPoint {
  window: NutritionOverviewWindow
  label: string
  value: number
  target: number
  coveragePercent: number
  status: MicronutrientStatus
  contributors: FoodContributionRecord[]
}

export interface NutritionDrilldownSnapshot {
  key: CanonicalNutrientKey
  label: string
  unit: NutrientAmountV1['unit']
  goalMode: NutrientGoalMode
  points: NutritionDrilldownPoint[]
}

export interface NutritionFocusState {
  key: CanonicalNutrientKey
  range: NutritionOverviewWindow
}

export interface NutritionOverviewBundle {
  today: NutritionOverviewDay
  trailingWeek: NutritionOverviewDay
  trailingMonth?: NutritionOverviewDay
  trailingQuarter?: NutritionOverviewDay
  trailingYear?: NutritionOverviewDay
  pinnedMetrics: NutritionOverviewMetric[]
  supportedNutrients: SupportedNutrientCatalogEntry[]
  focusedNutrientKey?: CanonicalNutrientKey
  drilldowns: NutritionDrilldownSnapshot[]
}

export interface BodyMetricValue {
  key: string
  label: string
  unit: string
  value: number
}

export interface ProgressPhotoEntry {
  id: string
  pose: ProgressPhotoPose
  fileName: string
  contentType: string
  dataUrl: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}

export interface BodyProgressSnapshot {
  id: string
  date: string
  metrics: BodyMetricValue[]
  photos: ProgressPhotoEntry[]
  note?: string
  createdAt: string
  updatedAt: string
}

export interface BodyProgressSaveRequest {
  date: string
  metrics: BodyMetricValue[]
  note?: string
  clearedPoses?: ProgressPhotoPose[]
  photosByPose?: Partial<Record<ProgressPhotoPose, File>>
}

export interface WorkoutTemplate {
  id: string
  programId: string
  name: string
  slotKey: string
  exercises: Array<{
    id: string
    name: string
    muscleGroup?: WorkoutMuscleGroup
    equipment?: string[]
    customExerciseId?: string
    targetSets: number
    targetReps: number
    targetLoad?: number
    targetSeconds?: number
    rir?: number
    restSeconds?: number
  }>
  createdAt: string
  updatedAt: string
}

export interface WorkoutProgram {
  id: string
  name: string
  goal: WorkoutGoal
  gymProfileId?: string
  preservationDefaults?: WorkoutPreservationDefaults
  templates: WorkoutTemplate[]
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface WorkoutPreservationDefaults {
  defaultRestSeconds?: number
  defaultTargetRir?: number
  backOffCapPercent?: number
  restTimerSound?: WorkoutRestTimerSound
  smartWarmupsEnabled?: boolean
}

export interface WorkoutSession {
  id: string
  programId: string
  templateId: string
  slotKey: string
  date: string
  createdAt: string
  updatedAt: string
  completedAt: string
  notes?: string
  exercises: Array<{
    templateExerciseId: string
    name: string
    notes?: string
    sets: Array<{
      reps?: number
      load?: number
      seconds?: number
      rir?: number
    }>
  }>
}

export interface ProgressionDecision {
  id: string
  programId: string
  templateId: string
  slotKey: string
  decisionType: ProgressionDecisionType
  reason: string
  basedOnSessionIds: string[]
  createdAt: string
  adjustments: Array<{
    templateExerciseId: string
    loadDelta?: number
    repDelta?: number
  }>
}

export interface WorkoutHabitSnapshot {
  id: string
  label: string
  current: number
  target: number
  status: 'met' | 'at_risk' | 'missed'
}

export interface WorkoutExerciseTrend {
  id: string
  name: string
  muscleGroup: WorkoutMuscleGroup
  sessionCount: number
  totalVolume: number
  totalReps: number
  heaviestLoad: number
  lastCompletedAt?: string
}

export interface WorkoutRecordSnapshot {
  id: string
  label: string
  metric: WorkoutRecordMetric
  value: number
  unit: 'kg' | 'lb' | 'reps' | 'volume'
  achievedAt: string
  exerciseId?: string
}

export interface WorkoutExerciseDrilldown {
  exerciseId: string
  name: string
  range: WorkoutAnalyticsRange
  totalVolume: number
  totalReps: number
  totalSets: number
  heaviestLoad: number
  sessionCount: number
}

export interface WorkoutDashboardSnapshot {
  activeProgramCount: number
  completedSessionCount: number
  completedSessionCount7d: number
  totalSets7d: number
  volumeLoad7d: number
  pendingDecisionCount: number
  latestCompletedAt?: string
  strengthRetention: StrengthRetentionSnapshot
  muscleGroupSetCounts: Array<{
    muscleGroup: WorkoutMuscleGroup
    setCount7d: number
  }>
  exerciseTrends: WorkoutExerciseTrend[]
  habits: WorkoutHabitSnapshot[]
  weeklyTargetsProgress: WorkoutHabitSnapshot[]
  recentRecords: WorkoutRecordSnapshot[]
  range: WorkoutAnalyticsRange
  exerciseDrilldown?: WorkoutExerciseDrilldown
  actionCard?: WorkoutActionCard
  steps7d?: number
  activeGymProfileId?: string
}

export interface DashboardSectionLayout {
  order: DashboardSectionId[]
  hiddenSectionIds: DashboardSectionId[]
  updatedAt: string
}

export interface DashboardInsightSetting {
  id: string
  sectionId: DashboardSectionId
  label: string
  visible: boolean
  required?: boolean
  order: number
  updatedAt: string
}

export interface GarminSurfaceSnapshot {
  importedWeightCount: number
  ignoredConflictCount: number
  modifierDayCount7d: number
  workoutSummaryCount7d: number
  latestImportedWeightDate?: string
  averageSleepMinutes7d?: number
  averageRestingHeartRate7d?: number
  totalSteps7d?: number
  totalActiveCalories7d?: number
  readiness: RecoveryReadiness
  historyWindow: GarminHistoryWindow
  history: Array<{
    window: GarminHistoryWindow
    modifierDayCount: number
    workoutSummaryCount: number
    averageSleepMinutes?: number
    averageRestingHeartRate?: number
    totalSteps?: number
    totalActiveCalories?: number
  }>
  visibleConflictDates: string[]
  syncStatus?: GarminConnectionStatus
}

export interface RapidLogPreset {
  id: string
  label: string
  source: 'barcode' | 'recent' | 'favorite' | 'saved_meal'
  foodId?: string
  servings?: number
}

export interface CoachModuleCandidate {
  kind: CoachModuleKind
  title: string
  unresolved: boolean
  reason: string
}

export interface CoachInterventionCard {
  id: string
  kind: CoachInterventionKind
  title: string
  summary: string
  severity: ComplianceRiskLevel
  reasons: string[]
}

export interface RecoveryReadinessSignal {
  id: 'sleep' | 'resting_heart_rate' | 'step_load' | 'workout_load'
  label: string
  status: 'baseline' | 'degraded'
  detail: string
}

export interface RecoveryReadiness {
  state: RecoverySeverity
  evaluatedDate: string
  reasons: string[]
  signals: RecoveryReadinessSignal[]
}

export type BodyProgressComparePreset = 'same_day' | '7d' | '30d' | 'custom'

export interface BodyProgressGalleryItem {
  snapshotId: string
  photoId: string
  pose: ProgressPhotoPose
  date: string
  fileName: string
  dataUrl: string
  metricCount: number
  note?: string
}

export interface BodyMetricVisibilitySetting {
  key: string
  visible: boolean
  updatedAt: string
}

export interface BodyProgressFocusState {
  focusedMetricKey?: string
  comparePreset: BodyProgressComparePreset
  lastSelectedPose?: ProgressPhotoPose
  compareMode?: BodyProgressCompareMode
  galleryMode?: BodyProgressGalleryMode
}

export type MorningCommandTarget = 'log' | 'train' | 'progress' | 'review_queue'

export type CommandConfidence = 'high' | 'medium' | 'low'

export type CaptureConvenienceSource = 'voice' | 'meal_photo'

export interface MorningStatusItem {
  id:
    | 'manual_override_active'
    | 'garmin_readiness_stale'
    | 'review_required_logging_blocked'
    | 'compare_photo_missing'
  label: string
  detail: string
  tone: 'neutral' | 'warning'
}

export interface RepeatLogRecommendation {
  meal: MealType
  label: string
  count: number
  source: 'saved_meal' | 'favorite' | 'shortcut'
  entryContext: 'meal_slot' | 'global_add'
  autocommitAction: 'none' | 'use_last_amount' | 'saved_meal_review'
  preserveQueryOnBatchAdd: boolean
  templateId?: string
  templateLabel?: string
  batchAction: 'none' | 'fill_meal' | 'fill_day'
}

export type ProgressStoryTone = 'on_track' | 'watch' | 'stalled'

export interface WorkoutActionCard {
  action: WorkoutAction
  title: string
  summary: string
  reasons: string[]
  reasonOrder: Array<'readiness' | 'anchor_lift' | 'records' | 'completion'>
  source: 'computed' | 'manual_override'
  evaluatedAt: string
  readinessFresh: boolean
  confidence: CommandConfidence
  stalenessReason?: string
  primaryCta: string
  mode: 'directive' | 'review_first'
  secondaryNote?: string
  fuelDirective: string
  volumeDirective: string
  preservationRisk: 'low' | 'medium' | 'high'
  evidenceReasons: WorkoutEvidenceReason[]
  confidenceReason: string
  freshnessLabel: 'Fresh readiness' | 'Stale readiness' | 'No readiness'
}

export interface CaptureChecklistItem {
  id: CaptureChecklistItemId
  label: string
  status: CaptureChecklistStatus
  detail: string
}

export interface BodyProgressQuickCompare {
  preset: BodyProgressComparePreset
  pose: ProgressPhotoPose
  compareMode: BodyProgressCompareMode
  galleryMode: BodyProgressGalleryMode
  latestDate?: string
  compareDate?: string
  metricKey?: string
  metricLabel?: string
  metricUnit?: string
  metricCurrentValue?: number
  metricCompareValue?: number
  metricDeltaLabel?: string
  latestPhotoDataUrl?: string
  comparePhotoDataUrl?: string
  missingPhoto: boolean
  storyTone: ProgressStoryTone
  waistTrendLabel?: string
  storySummary: string
  nextActionPrompt?: string
  missingSignals: Array<'compare_photo' | 'waist_metric' | 'weight_compare'>
  scaleContext: BodyProgressScaleContext
  captureConsistency: CaptureConsistency
  captureChecklist: CaptureChecklistItem[]
  shareEnabled: boolean
}

export interface CaptureConvenienceDraft {
  id: string
  source: CaptureConvenienceSource
  confidence: CommandConfidence
  rawLabel: string
  suggestedName: string
  suggestedAmount?: number
  suggestedUnit?: string
  photoPreviewUrl?: string
  createdAt: string
}

export interface MorningPhoneSnapshot {
  meal?: MealType
  laneLabel: string
  laneCount: number
  repeatLog?: RepeatLogRecommendation
  workoutAction?: WorkoutActionCard
  bodyProgress?: BodyProgressQuickCompare
  cutDayPlan?: CutDayPlan
  primaryTarget: MorningCommandTarget
  primaryLabel: string
  secondaryTarget?: MorningCommandTarget
  secondaryLabel?: string
  secondaryReason?: string
  whyNow: string
  blockingStatusIds: string[]
  confidence: CommandConfidence
  statusItems: MorningStatusItem[]
  deepLinkTarget: MorningCommandTarget
  reasonStack: string[]
  surfaceDensity: CommandSurfaceDensity
}

export interface StrengthRetentionSnapshot {
  anchorLiftName?: string
  anchorLiftTrend: 'up' | 'flat' | 'down'
  volumeFloorStatus: 'met' | 'missed' | 'at_risk'
  sessionCompletionRate7d: number
  strengthRetentionScore: number
}

export interface CutCockpitTargetCard {
  key: 'calories' | 'protein' | 'fiber' | 'sodium' | 'potassium'
  label: string
  consumed: number
  target: number
  remaining: number
  unit: string
}

export interface CutCockpitSnapshot {
  dailyQuestion: string
  remainingTargets: CutCockpitTargetCard[]
  readiness: RecoveryReadiness
  weeklyIntervention?: CoachInterventionCard
  strengthRetention: StrengthRetentionSnapshot
  latestBodyProgressDate?: string
  compareBodyProgressDate?: string
  comparedMetricCount: number
  comparedPhotoCount: number
}

export interface FastCheckInRun {
  id: string
  createdAt: string
  checkInId: string
  surface: 'dashboard' | 'coach'
  decisionType: CoachingDecisionType
  recommendationSummary: string
  unresolvedModules: CoachModuleCandidate[]
}

export interface EncryptedSyncEnvelope {
  id: string
  recordKind: EncryptedSyncRecordKind
  recordId: string
  updatedAt: string
  createdAt: string
  status: EncryptedSyncEnvelopeStatus
  ivBase64: string
  cipherTextBase64: string
  errorMessage?: string
}

export interface BenchmarkScenario {
  id: string
  name: string
  flowKey?: string
  required: boolean
  baselineActionCount: number
  baselineElapsedMs: number
  actualActionCount: number
  actualElapsedMs: number
  correctnessPassed: boolean
  createdAt: string
}

export interface BenchmarkReport {
  id: string
  createdAt: string
  passed: boolean
  blockedReason?: string
  scenarios: BenchmarkScenario[]
}

export interface CoreClaimSnapshot {
  evaluatedAt: string
  passed: boolean
  blockedReason?: string
  reportId?: string
  latestBenchmarkCreatedAt?: string
  scenarioCount: number
  readiness: {
    fastCheckInSurfaceReady: boolean
    nutritionDepthReady: boolean
    loggingSurfaceReady: boolean
    workoutsAnalyticsDepthReady: boolean
    bodyProgressSurfaceReady: boolean
    dashboardClaimReady: boolean
    recoverableGapClosureData: boolean
  }
}

export interface RecoveryExportPackManifest {
  id: string
  exportedAt: string
  schemaVersion: number
  recordCounts: {
    foods: number
    weights: number
    logDays: number
    logEntries: number
    foodReviewQueue: number
    garminImportedWeights: number
    garminModifierRecords: number
    garminWorkoutSummaries: number
    bodyProgressSnapshots: number
    workoutPrograms: number
    workoutSessions: number
    progressionDecisions: number
    benchmarkReports: number
  }
  media: {
    photoCount: number
    totalBytes: number
    hashes: Array<{
      snapshotId: string
      photoId: string
      hash: string
    }>
  }
}

export interface RecoveryExportAudit {
  restoredAt: string
  sourceExportedAt: string
  restoredCounts: RecoveryExportPackManifest['recordCounts']
  mediaHashesVerified: boolean
}

export interface NutritionTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface ResolvedFoodLogEntry extends FoodLogEntry {
  sourceFood: Food | null
  nutrition: NutritionTotals
}

export interface MacroProgress {
  percent: number
  tone: 'under' | 'near' | 'over'
  remaining: number
}

export interface WeightChartPoint {
  date: string
  label: string
  weight: number | null
  trend: number | null
}

export interface ImportedFoodCandidate {
  provider: CatalogProvider
  remoteKey?: string
  barcode: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  source: 'api'
  verification: BarcodeVerification
  nutritionBasis: NutritionBasis
  importTrust?: ImportTrust
  importConfidence: FoodImportConfidence
  sourceQuality: FoodSourceQuality
  note?: string
}

export interface BarcodeLookupResult {
  candidate: ImportedFoodCandidate
  missingFields: Array<'calories' | 'protein' | 'carbs' | 'fat'>
  providerFailures?: Array<{
    provider: CatalogProvider
    code: string
    message?: string
    retryAfterSeconds?: number
  }>
}

export interface AppActionError {
  code: string
  message: string
}

export interface RepoError {
  code: RepoErrorCode
  message: string
  retryable: boolean
}

export type ActionResult<T = void> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: AppActionError
    }

export interface RecoverableDataIssue {
  id: string
  key: string
  scope: RecoverableIssueScope
  message: string
}

export interface RepoError {
  code: RepoErrorCode
  message: string
  retryable: boolean
}

export interface BackupFile {
  schemaVersion: number
  exportedAt: string
  recoveryManifest?: RecoveryExportPackManifest
  settings: UserSettings
  uiPrefs?: UiPrefs
  foods: Food[]
  weights: WeightEntry[]
  logsByDate: Record<string, FoodLogEntry[]>
  mealTemplates?: MealTemplate[]
  savedMeals?: SavedMeal[]
  recipes?: Recipe[]
  favoriteFoods?: FavoriteFood[]
  dayMeta: DayMeta[]
  activityLog: ActivityEntry[]
  wellness?: WellnessEntry[]
  recoveryCheckIns?: RecoveryCheckIn[]
  dietPhases?: DietPhase[]
  dietPhaseEvents?: DietPhaseEvent[]
  interventions: InterventionEntry[]
  weeklyCheckIns?: CheckInRecord[]
  checkInHistory: CheckInRecord[]
  coachDecisions?: CoachingDecisionRecord[]
  coachingCalibration: CoachingCalibrationRecord[]
  coachThread?: CoachThreadState
  coachFeedback?: CoachFeedback[]
  coachQueue?: CoachQueuedQuestion[]
  coachConfig?: CoachProviderConfig
  foodReviewQueue?: FoodReviewItem[]
  garminImportedWeights?: GarminImportedWeight[]
  garminModifierRecords?: GarminModifierRecord[]
  garminWorkoutSummaries?: GarminWorkoutSummary[]
  bodyProgressSnapshots?: BodyProgressSnapshot[]
  workoutPrograms?: WorkoutProgram[]
  workoutSessions?: WorkoutSession[]
  progressionDecisions?: ProgressionDecision[]
  encryptedSyncQueue?: EncryptedSyncEnvelope[]
  benchmarkReports?: BenchmarkReport[]
}

export interface BackupPreview {
  backup: BackupFile
  counts: {
    foods: number
    weights: number
    logDays: number
    logEntries: number
    foodReviewQueue: number
    wellness: number
    recoveryCheckIns: number
    dietPhases: number
    dietPhaseEvents: number
    garminImportedWeights: number
    garminModifierRecords: number
    garminWorkoutSummaries: number
    bodyProgressSnapshots: number
    workoutPrograms: number
    workoutSessions: number
    progressionDecisions: number
    benchmarkReports: number
  }
}

export interface HistoryImportWarning {
  code: string
  message: string
  fileName?: string
}

export interface ParsedHistoryPayload {
  provider: HistoryImportProvider
  foodLogEntries: FoodLogEntry[]
  weights: WeightEntry[]
}

export interface HistoryImportPreview {
  provider: HistoryImportProvider
  fileKinds: HistoryImportFileKind[]
  counts: {
    logEntries: number
    logDays: number
    weights: number
    skippedRows: number
    supportedFiles: number
    unsupportedFiles: number
  }
  dateRange?: {
    start: string
    end: string
  }
  warnings: HistoryImportWarning[]
  payload: ParsedHistoryPayload
}

export interface UndoQueueItem {
  id: string
  title: string
  description?: string
  actionLabel: string
}

export interface MealTemplateEntry {
  id: string
  foodId?: string
  snapshot: FoodSnapshot
  servings: number
  createdAt: string
}

export interface MealTemplate {
  id: string
  name: string
  defaultMeal?: MealType
  entries: MealTemplateEntry[]
  usageCount: number
  lastUsedAt?: string
  notes?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export type SavedMealEntry = MealTemplateEntry

export interface SavedMeal extends Omit<MealTemplate, 'entries'> {
  entries: SavedMealEntry[]
}

export interface FavoriteFood {
  foodId: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface RecipeIngredient {
  id: string
  foodId: string
  snapshot: FoodSnapshot
  servings: number
  createdAt: string
}

export interface Recipe {
  id: string
  name: string
  yieldServings: number
  yieldLabel?: string
  ingredients: RecipeIngredient[]
  usageCount: number
  lastUsedAt?: string
  nutrients?: NutrientProfileV1
  notes?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface CatalogFood {
  id: string
  remoteKey: string
  provider: CatalogProvider
  name: string
  brand?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  barcode?: string
  imageUrl?: string
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  importTrust?: ImportTrust
  nutrients?: NutrientProfileV1
  cachedAt: string
  staleAt: string
  lastUsedAt?: string
  updatedAt: string
}

export interface RemoteCatalogHit {
  remoteKey: string
  provider: CatalogProvider
  name: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  imageUrl?: string
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  importTrust?: ImportTrust
}

export type UnifiedFoodSearchResultSource =
  | 'local_food'
  | 'recipe'
  | 'saved_meal'
  | 'favorite'
  | 'off_cached'
  | 'off_remote'

export type UnifiedFoodSearchMatchKind = 'barcode' | 'exact' | 'prefix' | 'fuzzy'

export interface UnifiedFoodSearchResult {
  source: UnifiedFoodSearchResultSource
  matchKind: UnifiedFoodSearchMatchKind
  id: string
  name: string
  brand?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  score: number
  provider?: CatalogProvider
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  importTrust?: ImportTrust
  lastUsedAt?: string
  updatedAt?: string
  stale?: boolean
  record: Food | SavedMeal | Recipe | CatalogFood | FavoriteFood
}

export interface FoodIdentityMatch {
  strategy: 'barcode' | 'localId' | 'remoteKey' | 'normalized'
  localFoodId?: string
  remoteKey?: string
  message?: string
}

export interface SyncCounts {
  foods: number
  logDays: number
  logEntries: number
  weights: number
  dayMeta: number
  activity: number
  wellness: number
  recoveryCheckIns: number
  dietPhases: number
  dietPhaseEvents: number
  interventions: number
  savedMeals: number
  recipes: number
  favoriteFoods: number
}

export interface SyncRecordEnvelope {
  scope: SyncScope
  recordId: string
  payload: Record<string, unknown>
  deletedAt?: string
  serverVersion: number
  serverUpdatedAt: string
}

export interface SyncMutation {
  mutationId: string
  scope: SyncScope
  recordId: string
  operation: 'upsert' | 'delete'
  payload: Record<string, unknown> | null
  baseServerVersion: number | null
  queuedAt: string
  attemptCount: number
  lastAttemptAt?: string | null
}

export interface SyncDeadLetterItem {
  mutation: SyncMutation
  code: string
  message: string
  movedAt: string
}

export interface SyncPushResponse {
  applied: Array<{
    mutationId: string
    scope: SyncScope
    recordId: string
    serverVersion: number
    serverUpdatedAt: string
    deletedAt?: string
  }>
  deadLetters: Array<{
    mutationId: string
    scope: SyncScope
    recordId: string
    code: string
    message: string
  }>
  highWatermark: number
}

export interface SyncPullResponse {
  records: SyncRecordEnvelope[]
  highWatermark: number
  bootstrapCompletedAt?: string | null
}

export type BootstrapResolution =
  | 'useCloudOnThisDevice'
  | 'mergeThisDeviceIntoCloud'
  | 'replaceCloudWithThisDevice'

export interface BootstrapStatusSummary {
  localCounts: SyncCounts
  cloudCounts: SyncCounts
  localEmpty: boolean
  cloudEmpty: boolean
  bootstrapCompleted: boolean
}

export interface RemoteCatalogResponse {
  query: string
  providers: CatalogProvider[]
  remoteStatus: 'ok' | 'unavailable'
  nextCursor?: string
  results: RemoteCatalogHit[]
}

export interface NormalizedFoodTruthHit {
  remoteKey: string
  provider: CatalogProvider
  name: string
  brand?: string
  barcode?: string
  servingSize?: number
  servingUnit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  imageUrl?: string
  importConfidence?: FoodImportConfidence
  sourceQuality?: FoodSourceQuality
  sourceQualityNote?: string
  importTrust?: ImportTrust
}

export type NormalizedCatalogSearchHit = NormalizedFoodTruthHit

export interface NormalizedCatalogSearchPage {
  query: string
  providers: CatalogProvider[]
  remoteStatus: 'ok' | 'unavailable'
  nextCursor?: string
  results: NormalizedCatalogSearchHit[]
}

export interface NormalizedBarcodeLookupResult {
  hit: NormalizedCatalogSearchHit
  missingFields: Array<'calories' | 'protein' | 'carbs' | 'fat'>
}

export interface CatalogProviderAdapter {
  provider: CatalogProvider
  search(input: {
    query: string
    locale: 'en-GB' | 'en-US'
    limit: number
    cursor?: string
  }): Promise<NormalizedCatalogSearchPage>
  lookupBarcode(input: {
    barcode: string
    locale: 'en-GB' | 'en-US'
  }): Promise<NormalizedBarcodeLookupResult | null>
}

export interface SyncState {
  status: SyncStatus
  deviceId: string
  pendingMutationCount: number
  deadLetterCount: number
  consecutiveFailures: number
  highWatermark: number
  bootstrapResolvedForUserId?: string
  currentUserId?: string
  lastSyncedAt?: string
  lastSyncError?: string
  blockingMessage?: string
  authEmail?: string
  recordVersions: Record<string, number>
  localRecordUpdatedAt?: Record<string, string>
}

export interface SaveOptions {
  source: RepoWriteSource
  expectedVersion?: number | null
}

export interface SaveResult<T> {
  record: T
  changed: boolean
  version: number
}

export interface ChangeEvent<K> {
  scope: SyncScope | 'diagnostics'
  keys: K[]
  reason: RepoWriteSource
}

export interface CollectionRepository<T, K, Q> {
  loadAll(): Promise<T[]>
  loadByKey(key: K): Promise<T | null>
  query(query: Q): Promise<T[]>
  save(record: T, options: SaveOptions): Promise<SaveResult<T>>
  saveMany(records: T[], options: SaveOptions): Promise<SaveResult<T>[]>
  replaceAll(records: T[], source: RepoWriteSource): Promise<void>
  subscribe(listener: (event: ChangeEvent<K>) => void): () => void
}

export interface DiagnosticsEvent {
  id: string
  eventType: DiagnosticsEventType
  createdAt: string
  severity: DiagnosticsSeverity
  scope: SyncScope | 'diagnostics' | 'ocr' | 'storage'
  recordKey?: string
  message: string
  payload?: Record<string, unknown>
}

export interface FoodTruthMetricsSummary {
  barcodeLookupCount: number
  barcodeLookupSuccessRate: number
  exactAutologEligibilityRate: number
  barcodeBlockedRate: number
  ocrBlockedRate: number
  providerConflictRate: number
  localRescanWinRate: number
  downgradeRateByIssue: Partial<Record<ImportTrustBlockingIssue, number>>
  providerFailureRateByProvider: Partial<Record<CatalogProvider, number>>
}

export interface FoodTruthAlertSummary {
  id: string
  message: string
  threshold: string
}

export interface DiagnosticsSummary {
  totalCount: number
  lastEventAt?: string
  lastError?: DiagnosticsEvent
  counts: Partial<Record<DiagnosticsEventType, number>>
  foodTruth?: {
    metrics: FoodTruthMetricsSummary
    alerts: FoodTruthAlertSummary[]
  }
}

export interface BulkApplyPreview {
  targetDate: string
  targetMeal?: MealType
  existingEntryCount: number
  incomingEntryCount: number
  existingCalories: number
  incomingCalories: number
  possibleOverlapCount: number
  modeRecommendation: BulkApplyMode
}

export interface WeeklyReviewSnapshot {
  windowStart: string
  windowEnd: string
  avgCalories: number | null
  avgProtein: number | null
  avgWeight: number | null
  weightChange: number | null
  adherenceSummary: string
  fastingDays: number
  partialDays: number
  interventionConfounders: string[]
}

export interface SyncIntegrityState {
  orphanedFavoriteFoodIds: string[]
  invalidRecipeIds: string[]
  invalidRecipeMissingFoodIds: Record<string, string[]>
  updatedAt: string
}

export type DescribeFoodReviewMode = 'local_match' | 'remote_match' | 'manual_only'

export interface DescribeFoodDraftItemV1 {
  name: string
  amount?: number
  unit?: string
  brand?: string
  candidateLocalFoodId?: string
  candidateRemoteKey?: string
  candidateRemoteProvider?: CatalogProvider
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

export interface DescribeFoodDraftV1 {
  id: string
  rawText: string
  locale: 'en-GB' | 'en-US'
  confidence: 'high' | 'medium' | 'low'
  reviewMode: DescribeFoodReviewMode
  item: DescribeFoodDraftItemV1
  createdAt: string
}

export type CanonicalNutrientKey =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'sugars'
  | 'addedSugars'
  | 'sodium'
  | 'salt'
  | 'saturates'
  | 'cholesterol'
  | 'potassium'
  | 'calcium'
  | 'magnesium'
  | 'iron'
  | 'vitaminC'
  | 'vitaminD'
  | 'vitaminB12'
  | 'caffeine'
  | 'monounsaturatedFat'
  | 'polyunsaturatedFat'
  | 'transFat'
  | 'omega3'
  | 'omega6'
  | 'folate'
  | 'vitaminA'
  | 'vitaminE'
  | 'vitaminK'
  | 'thiamin'
  | 'riboflavin'
  | 'niacin'
  | 'vitaminB6'
  | 'biotin'
  | 'pantothenicAcid'
  | 'phosphorus'
  | 'zinc'
  | 'selenium'
  | 'copper'
  | 'manganese'
  | 'iodine'
  | 'chromium'
  | 'molybdenum'
  | 'choline'
  | 'chloride'
  | 'fluoride'
  | 'boron'
  | 'betaCarotene'
  | 'lutein'
  | 'lycopene'
  | 'alcohol'

export interface NutrientAmountV1 {
  key: CanonicalNutrientKey
  unit: 'kcal' | 'g' | 'mg' | 'mcg'
  value: number
}

export interface NutrientProfileV1 {
  basis: Exclude<NutritionBasis, 'unknown'>
  values: Partial<Record<CanonicalNutrientKey, NutrientAmountV1>>
}

export interface DailyCoachingSeriesV1 {
  date: string
  intakeState: 'complete' | 'partial' | 'fasting' | 'untracked'
  explicitDayState: boolean
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  steps?: number
  cardioMinutes?: number
  cardioType?: CardioType
  weighIn?: WeightEntry
  recentImport: boolean
  confounders: string[]
}

export interface CoachingInputV1 {
  windowStart: string
  windowEnd: string
  goalMode: GoalMode
  targetWeeklyRatePercent: number
  calorieTarget: number
  proteinTarget: number
  carbTarget: number
  fatTarget: number
  dailyStepTarget?: number
  weeklyCardioMinuteTarget?: number
  series: DailyCoachingSeriesV1[]
}

export interface CoachingBlockedReason {
  code: CoachingBlockedReasonCode | LegacyCoachingCode
  message: string
}

export type CoachingBlockedReasonCode =
  | 'insufficient_eligible_days'
  | 'insufficient_weighins'
  | 'low_data_quality'
  | 'trend_unavailable'
  | 'explicit_day_confounder'
  | 'recent_import'
  | 'intervention_change'
  | 'recovery_issues'
  | 'travel'
  | 'illness'
  | 'high_calorie_event'
  | 'goal_mode_recently_changed'
  | 'fat_loss_mode_recently_changed'
  | 'eligible_days_low'
  | 'weighins_low'
  | 'explicit_days_low'
  | 'partial_logging_high'
  | 'unmarked_logging_high'
  | 'adherence_low'
  | 'protein_low'
  | 'step_adherence_low'
  | 'cardio_adherence_low'
  | 'psmf_phase_required'
  | 'psmf_phase_expired'
  | 'diet_break_active'
  | 'recovery_hold'

export type CoachingReasonCode =
  | 'insufficient_eligible_days'
  | 'insufficient_weighins'
  | 'low_data_quality'
  | 'trend_unavailable'
  | 'explicit_day_confounder'
  | 'recent_import'
  | 'intervention_change'
  | 'recovery_issues'
  | 'travel'
  | 'illness'
  | 'high_calorie_event'
  | 'goal_mode_recently_changed'
  | 'fat_loss_mode_recently_changed'
  | 'eligible_days_low'
  | 'weighins_low'
  | 'explicit_days_low'
  | 'partial_logging_high'
  | 'unmarked_logging_high'
  | 'adherence_low'
  | 'protein_low'
  | 'step_adherence_low'
  | 'cardio_adherence_low'
  | 'loss_faster_than_target'
  | 'loss_slower_than_target'
  | 'rate_on_target'
  | 'maintenance_on_target'
  | 'maintenance_weight_down'
  | 'maintenance_weight_up'
  | 'gain_faster_than_target'
  | 'gain_slower_than_target'
  | 'calorieFloorApplied'
  | 'personal_floor_applied'
  | 'psmf_no_further_decrease'
  | 'manual_override'
  | 'coach_override'
  | 'diet_break'
  | 'recovery_adjustment'
  | 'travel_reset'
  | 'adherence_reset'
  | 'recovery_watch'
  | 'refeed_scheduled'
  | 'diet_break_review_recommended'

export type LegacyCoachingCode = `legacy:${string}`

export interface DataQualityScore {
  score: number
  band: CoachingConfidence
  eligibleDays: number
  weighInDays: number
  explicitEligibleDays: number
  completeDays: number
  partialDays: number
  fastingDays: number
  unmarkedLoggedDays: number
  markedConfounderDays: number
  recentlyImported: boolean
  recoveryIssueCount: number
}

export interface AdherenceScore {
  isAdequate: boolean
  calorieDeviationPercent: number | null
  proteinHitRate: number | null
  stepAdherencePercent?: number
  cardioAdherencePercent?: number
  reasons: string[]
}

export interface ConfounderSet {
  reasons: string[]
  explicitMarkers: DayConfounderMarker[]
  hasRecentImport: boolean
  hasInterventionChange: boolean
  hasRecoveryIssues: boolean
  hasPartialLogging: boolean
  hasMissingWeighIns: boolean
  hasTravel: boolean
  hasIllness: boolean
  hasHighCalorieEvent: boolean
  highCalorieEventDays: number
}

export type CoachingDecisionType =
  | 'keep_targets'
  | 'increase_calories'
  | 'decrease_calories'
  | 'hold_for_more_data'
  | 'ignore_period_due_to_confounders'

export type CoachingDecisionSource = 'engine_v1' | 'engine_v2' | 'manual_override'

export interface CoachingTargetSet {
  calorieTarget: number
  proteinTarget: number
  carbTarget: number
  fatTarget: number
}

export interface EnergyModelSnapshot {
  estimatedTdee: number | null
  averageLoggedCalories: number
  currentCalorieTarget: number
  proposedCalorieTarget?: number
  calorieDelta?: number
  targetWeeklyRatePercent: number
  observedWeeklyRatePercent: number
  averageSteps: number
  weeklyCardioMinutes: number
}

export type CoachingEvidenceTone = 'positive' | 'neutral' | 'caution'

export interface CoachingEvidenceCard {
  id: string
  title: string
  summary: string
  tone: CoachingEvidenceTone
  details: string[]
}

export interface GarminModifierWindow {
  windowStart: string
  windowEnd: string
  importedDays: number
  averageSleepMinutes: number | null
  averageRestingHeartRate: number | null
  averageSteps: number | null
  totalDerivedCardioMinutes: number
  nextWindowOnly: true
}

export interface WeeklyCheckInPacket {
  id: string
  source: CoachingDecisionSource
  generatedAt: string
  recommendationReason: string
  recommendationExplanation?: string
  confidenceBand: CoachingConfidence
  confidenceScore: number | null
  decisionType: CoachingDecisionType
  nextCheckInDate: string
  targetDelta?: number
  previousTargets: CoachingTargetSet
  proposedTargets?: CoachingTargetSet
  energyModel: EnergyModelSnapshot
  garminModifierWindow?: GarminModifierWindow
  evidenceCards: CoachingEvidenceCard[]
  interventions?: CoachInterventionCard[]
  moduleOutputs?: Array<{
    kind: CoachModuleKind
    enabled: boolean
    summary: string
  }>
  unresolvedModuleCandidates?: CoachModuleCandidate[]
  fastCheckInEquivalent?: boolean
}

export interface CoachingDecisionRecord {
  id: string
  source: CoachingDecisionSource
  status: 'pending' | 'applied' | 'kept' | 'deferred' | 'overridden'
  decisionType: CoachingDecisionType
  windowStart: string
  windowEnd: string
  effectiveDate: string
  confidenceBand: CoachingConfidence
  confidenceScore: number | null
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
  blockedReasons: CoachingBlockedReason[]
  explanation: string
  previousTargets: CoachingTargetSet
  proposedTargets?: CoachingTargetSet
  weeklyCheckInPacket?: WeeklyCheckInPacket
  createdAt: string
  appliedAt?: string
  overriddenAt?: string
  updatedAt: string
}

export interface CoachDecisionSyncRecord {
  id: string
  updatedAt: string
  payload: CoachingDecisionRecord
}

export interface WeeklyCheckInSyncRecord {
  id: string
  updatedAt: string
  payload: CheckInRecord
}

export interface CoachingRecommendationV1 {
  decisionType: CoachingDecisionType
  recommendedCalories: number | null
  recommendedMacros?: CheckInMacroTargets
  confidenceScore: number | null
  confidenceBand: CoachingConfidence
  estimatedTdee: number | null
  windowSummary: {
    days: number
    intakeDays: number
    weighInDays: number
    completeDays: number
    partialDays: number
    fastingDays: number
    eligibleDays: number
  }
  previousTargets: CoachingTargetSet
  proposedTargets?: CoachingTargetSet
  effectiveDate: string
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
  blockedReasons: CoachingBlockedReason[]
  dataQuality: DataQualityScore
  adherence: AdherenceScore
  confounders: ConfounderSet
  blockedBy: string[]
}

export interface CoachingExplanationV1 {
  reason: string
  explanation: string
  reasons: string[]
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
  confounders: string[]
}

export interface CoachingInsight {
  confidence: CoachingConfidence
  confidenceBand: CoachingConfidence
  confidenceScore: number | null
  goalMode: GoalMode
  isReady: boolean
  reason: string
  explanation: string
  avgDailyCalories: number | null
  avgDailyProtein: number | null
  estimatedTdee: number | null
  recommendedCalories: number | null
  allDayRecommendedCalories: number | null
  eatingDayRecommendedCalories: number | null
  weightChange: number | null
  weightChangeUnit: WeightUnit
  adherenceTone: CoachingTone
  windowDays: number
  weighInDays: number
  intakeDays: number
  completeDays: number
  partialDays: number
  fastingDays: number
  unmarkedLoggedDays: number
  eligibleDays: number
  confounders: string[]
  calibrationPhase: CalibrationPhase
  calibratedConfidencePercent: number | null
}

export interface CoachingCalibrationRecord {
  id: string
  windowStart: string
  windowEnd: string
  predictedTdee: number
  allDayRecommendedCalories: number
  eatingDayRecommendedCalories?: number
  goalMode: GoalMode
  confidenceScore: number
  eligibleDays: number
  fastingDays: number
  partialDays: number
  hasInterventionConfounder: boolean
  validated: boolean
  observedTdee?: number
  tdeeError?: number
  within150?: boolean
  within250?: boolean
  createdAt: string
  validatedAt?: string
}

export interface CoachCitation {
  id: string
  label: string
  title: string
  source: string
  year?: number
  summary: string
  sourceType: CoachClaimSource
  href?: string
}

export interface CoachActionProposal {
  id: string
  type: CoachProposalType
  title: string
  description: string
  payload?: Record<string, unknown>
}

export interface CoachSafetyFlag {
  id: string
  severity: 'info' | 'warning' | 'blocked'
  message: string
}

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  mode?: CoachMode
  state?: CoachState
  answerType?: CoachAnswerType
  citations?: CoachCitation[]
  proposals?: CoachActionProposal[]
  safetyFlags?: CoachSafetyFlag[]
  contextUsed?: string[]
}

export interface CoachContextSnapshot {
  generatedAt: string
  selectedDate: string
  goalMode: GoalMode
  settings: Pick<
    UserSettings,
    | 'calorieTarget'
    | 'proteinTarget'
    | 'carbTarget'
    | 'fatTarget'
    | 'weightUnit'
    | 'goalMode'
    | 'coachingEnabled'
    | 'askCoachEnabled'
    | 'shareInterventionsWithCoach'
  >
  selectedDayStatus: DayStatus
  selectedDayTotals: NutritionTotals
  recentDailyCalories: Array<{ date: string; calories: number; protein: number }>
  recentWeights: Array<{ date: string; weight: number; unit: WeightUnit }>
  recentDayStates: DayMeta[]
  recentInterventions: InterventionEntry[]
  coachingInsight: CoachingInsight
  recentThreadSummary: string[]
}

export interface CoachThreadState {
  messages: CoachMessage[]
  updatedAt: string
}

export interface CoachFeedback {
  messageId: string
  rating: CoachFeedbackRating
  appliedActions: string[]
  createdAt: string
}

export interface CoachQueuedQuestion {
  id: string
  question: string
  mode: CoachMode
  createdAt: string
}

export interface CoachProviderConfig {
  provider: CoachProvider
  configuredAt?: string
  autoSendQueuedWhenOnline?: boolean
}

export interface CoachResponse {
  answer: string
  answerType: CoachAnswerType
  citations: CoachCitation[]
  proposals: CoachActionProposal[]
  safetyFlags: CoachSafetyFlag[]
  contextUsed: string[]
}
