export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type FoodSource = 'seed' | 'custom' | 'api' | 'recipe'
export type CatalogProvider = 'open_food_facts'
export type FoodImportConfidence = 'direct_match' | 'weak_match' | 'manual_review_required'
export type FoodSourceQuality = 'high' | 'medium' | 'low'
export type TabId = 'log' | 'weight' | 'coach' | 'settings'
export type WeightRange = '30' | '90' | 'all'
export type WeightUnit = 'lb' | 'kg'
export type BarcodeVerification = 'verified' | 'needsConfirmation'
export type NutritionBasis = 'serving' | '100g' | '100ml' | 'unknown'
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
export type RecoverableIssueScope =
  | 'foods'
  | 'weights'
  | 'settings'
  | 'logs'
  | 'migration'
  | 'activity'
  | 'checkins'
export type ImportMode = 'replace' | 'merge'
export type BulkApplyMode = 'append' | 'replaceTarget' | 'cancel'
export type NetworkStatus = 'online' | 'offline'
export type SyncScope =
  | 'foods'
  | 'food_log_entries'
  | 'weights'
  | 'day_meta'
  | 'activity'
  | 'interventions'
  | 'meal_templates'
  | 'recipes'
  | 'favorite_foods'
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
export type CoachingConfidence = 'none' | 'low' | 'medium' | 'high'
export type CoachingTone = 'neutral' | 'under' | 'over' | 'onTrack'
export type DayStatus = 'unmarked' | 'complete' | 'partial' | 'fasting'
export type DayConfounderMarker = 'travel' | 'illness' | 'high_calorie_event'
export type InterventionCategory = 'supplement' | 'medication' | 'stimulant' | 'peptide' | 'other'
export type InterventionRoute = 'oral' | 'subcutaneous' | 'intramuscular' | 'topical' | 'other'
export type CardioType = 'walk' | 'incline_treadmill' | 'bike' | 'run' | 'other'
export type CalibrationPhase = 'none' | 'collecting' | 'provisional' | 'calibrated'
export type CoachMode = 'standard' | 'deep'
export type CoachProvider = 'none' | 'gemini' | 'openai' | 'anthropic'
export type CoachState = 'ready' | 'offline' | 'queued' | 'sending' | 'failed' | 'notConfigured'
export type CoachAnswerType =
  | 'data-aware'
  | 'general-evidence'
  | 'insufficient-data'
  | 'safety-limited'
  | 'not-configured'
export type CoachClaimSource = 'Your data' | 'App inference' | 'Evidence'
export type CoachFeedbackRating = 'up' | 'down'
export type RepoWriteSource = 'ui' | 'sync' | 'bootstrap' | 'migration' | 'import' | 'system'
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
export type CoachProposalType =
  | 'applyCalorieTarget'
  | 'applyMacroTargets'
  | 'setDayStatus'
  | 'dismissCoachingSuggestion'
  | 'openCopyPrevious'
  | 'openInterventionLog'
export type CheckInStatus = 'ready' | 'applied' | 'kept' | 'deferred' | 'insufficientData'

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

export interface LabelNutritionPanel {
  fields: LabelNutritionField[]
  servingSizeText?: string
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
  usageCount: number
  createdAt: string
  barcode?: string
  archivedAt?: string
  lastUsedAt?: string
  lastServings?: number
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
  barcode?: string
}

export interface LabelOcrFieldCandidate extends LabelNutritionField {
  sourceText: string
  confidence: number
}

export interface LabelOcrReviewSession {
  foodDraft: FoodDraft
  fieldCandidates: LabelOcrFieldCandidate[]
  unmappedFields: LabelOcrFieldCandidate[]
  warnings: string[]
  requiresReview: boolean
  provider: LabelOcrProvider
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

export interface UserSettings {
  calorieTarget: number
  proteinTarget: number
  carbTarget: number
  fatTarget: number
  weightUnit: WeightUnit
  goalMode: GoalMode
  coachingEnabled: boolean
  checkInWeekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  targetWeeklyRatePercent: number
  dailyStepTarget?: number
  weeklyCardioMinuteTarget?: number
  tdeeEstimate?: number
  lastImportAt?: string
  coachingDismissedAt?: string
  askCoachEnabled?: boolean
  shareInterventionsWithCoach?: boolean
  coachCitationsExpanded?: boolean
  coachConsentAt?: string
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

export interface CheckInMacroTargets {
  protein: number
  carbs: number
  fat: number
}

export interface CheckInRecord {
  id: string
  weekEndDate: string
  weekStartDate: string
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
  reasonCodes?: string[]
  blockedReasons?: CoachingBlockedReason[]
  dataQuality?: DataQualityScore
  adherence?: AdherenceScore
  confounders?: ConfounderSet
  decisionRecordId?: string
  status: CheckInStatus
  createdAt: string
  appliedAt?: string
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
  importConfidence: FoodImportConfidence
  sourceQuality: FoodSourceQuality
  note?: string
}

export interface BarcodeLookupResult {
  candidate: ImportedFoodCandidate
  missingFields: Array<'calories' | 'protein' | 'carbs' | 'fat'>
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
  interventions: InterventionEntry[]
  checkInHistory: CheckInRecord[]
  coachingCalibration: CoachingCalibrationRecord[]
  coachThread?: CoachThreadState
  coachFeedback?: CoachFeedback[]
  coachQueue?: CoachQueuedQuestion[]
  coachConfig?: CoachProviderConfig
}

export interface BackupPreview {
  backup: BackupFile
  counts: {
    foods: number
    weights: number
    logDays: number
    logEntries: number
  }
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
  provider: CatalogProvider
  remoteStatus: 'ok' | 'unavailable'
  nextCursor?: string
  results: RemoteCatalogHit[]
}

export interface SyncState {
  status: SyncStatus
  deviceId: string
  pendingMutationCount: number
  deadLetterCount: number
  consecutiveFailures: number
  highWatermark: number
  bootstrapCompletedForUserId?: string
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

export interface DiagnosticsSummary {
  totalCount: number
  lastEventAt?: string
  lastError?: DiagnosticsEvent
  counts: Partial<Record<DiagnosticsEventType, number>>
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
  | 'iron'
  | 'vitaminD'
  | 'caffeine'

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
  code: string
  message: string
}

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

export type CoachingDecisionSource = 'engine_v1' | 'manual_override'

export interface CoachingTargetSet {
  calorieTarget: number
  proteinTarget: number
  carbTarget: number
  fatTarget: number
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
  reasonCodes: string[]
  blockedReasons: CoachingBlockedReason[]
  explanation: string
  previousTargets: CoachingTargetSet
  proposedTargets?: CoachingTargetSet
  createdAt: string
  appliedAt?: string
  overriddenAt?: string
  updatedAt: string
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
  reasonCodes: string[]
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
  reasonCodes: string[]
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
