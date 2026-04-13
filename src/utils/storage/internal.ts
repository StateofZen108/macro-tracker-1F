import type {
  ActionResult,
  ActivityEntry,
  AppActionError,
  BackupFile,
  BackupPreview,
  CheckInRecord,
  CoachingCalibrationRecord,
  CoachFeedback,
  CoachProviderConfig,
  CoachQueuedQuestion,
  CoachThreadState,
  DayMeta,
  Food,
  FoodLogEntry,
  LabelNutritionField,
  LabelNutritionFieldKey,
  LabelNutritionPanel,
  FoodSnapshot,
  ImportMode,
  InterventionEntry,
  MealTemplate,
  MealType,
  RecoverableDataIssue,
  UiPrefs,
  UserSettings,
  WeightEntry,
  WeightUnit,
} from '../../types'
import {
  queueActivitySyncMutations,
  queueDayMetaSyncMutations,
  queueFoodLogSyncMutations,
  queueFoodSyncMutations,
  queueInterventionSyncMutations,
  queueMealTemplateSyncMutations,
  queueSettingsSyncMutations,
  queueWeightSyncMutations,
} from '../sync/storageQueue'
import {
  readIndexedDbCoreSnapshot,
  readIndexedDbMigrationState,
  writeIndexedDbCoreSnapshot,
  writeIndexedDbMigrationState,
} from './idb'
import { recordDiagnosticsEvent } from '../diagnostics'

export const STORAGE_KEYS = {
  schemaVersion: 'mt_schema_version',
  foods: 'mt_foods',
  weights: 'mt_weights',
  settings: 'mt_settings',
  uiPrefs: 'mt_ui_prefs',
  mealTemplates: 'mt_meal_templates',
  dayMeta: 'mt_day_meta',
  activityLog: 'mt_activity_log',
  interventions: 'mt_interventions',
  checkInHistory: 'mt_checkin_history',
  coachingCalibration: 'mt_coaching_calibration',
  coachThread: 'mt_coach_thread',
  coachFeedback: 'mt_coach_feedback',
  coachQueue: 'mt_coach_queue',
  coachConfig: 'mt_coach_config',
  recoveryBackup: 'mt_recovery_backup',
} as const

const CURRENT_SCHEMA_VERSION = 7
const SEED_CREATED_AT = '2026-01-01T00:00:00.000Z'
const LOG_KEY_PREFIX = 'mt_log_'
const VALID_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']
const STORAGE_SYNC_CHANNEL = 'macrotracker-storage'
const STORAGE_SYNC_SOURCE =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `macrotracker-${Date.now()}`

function getDefaultTargetWeeklyRatePercent(goalMode: UserSettings['goalMode']): number {
  if (goalMode === 'lose') {
    return -0.5
  }

  if (goalMode === 'gain') {
    return 0.25
  }

  return 0
}

export const DEFAULT_SETTINGS: UserSettings = {
  calorieTarget: 2000,
  proteinTarget: 150,
  carbTarget: 200,
  fatTarget: 65,
  weightUnit: 'lb',
  goalMode: 'maintain',
  coachingEnabled: true,
  checkInWeekday: 1,
  targetWeeklyRatePercent: getDefaultTargetWeeklyRatePercent('maintain'),
  askCoachEnabled: true,
  shareInterventionsWithCoach: true,
  coachCitationsExpanded: true,
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  keepOpenAfterAdd: true,
  preferredAskCoachMode: 'standard',
  coachCitationsExpanded: true,
  coachAutoSendQueuedWhenOnline: false,
}

export const DEFAULT_COACH_CONFIG: CoachProviderConfig = {
  provider: 'none',
  autoSendQueuedWhenOnline: false,
}

const SEED_FOODS: Food[] = [
  { id: 'seed-chicken-breast', name: 'Chicken Breast', servingSize: 100, servingUnit: 'g', calories: 165, protein: 31, carbs: 0, fat: 3.6, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-white-rice', name: 'White Rice (cooked)', servingSize: 1, servingUnit: 'cup', calories: 206, protein: 4.3, carbs: 45, fat: 0.4, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-whole-egg', name: 'Whole Egg', servingSize: 1, servingUnit: 'large', calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-egg-white', name: 'Egg White', servingSize: 1, servingUnit: 'large', calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-banana', name: 'Banana', servingSize: 1, servingUnit: 'medium', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-whole-milk', name: 'Whole Milk', servingSize: 1, servingUnit: 'cup', calories: 149, protein: 8, carbs: 12, fat: 8, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-greek-yogurt', name: 'Greek Yogurt (nonfat)', servingSize: 170, servingUnit: 'g', calories: 100, protein: 17, carbs: 6, fat: 0.7, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-oats', name: 'Oats (dry)', servingSize: 40, servingUnit: 'g', calories: 152, protein: 5.3, carbs: 27, fat: 2.6, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-peanut-butter', name: 'Peanut Butter', servingSize: 2, servingUnit: 'tbsp', calories: 188, protein: 8, carbs: 6, fat: 16, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-olive-oil', name: 'Olive Oil', servingSize: 1, servingUnit: 'tbsp', calories: 119, protein: 0, carbs: 0, fat: 14, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-sweet-potato', name: 'Sweet Potato', servingSize: 1, servingUnit: 'medium', calories: 103, protein: 2.3, carbs: 24, fat: 0.1, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-broccoli', name: 'Broccoli', servingSize: 1, servingUnit: 'cup', calories: 55, protein: 3.7, carbs: 11, fat: 0.6, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-salmon', name: 'Salmon (Atlantic)', servingSize: 100, servingUnit: 'g', calories: 208, protein: 20, carbs: 0, fat: 13, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-ground-beef', name: 'Ground Beef (85/15)', servingSize: 100, servingUnit: 'g', calories: 215, protein: 18.6, carbs: 0, fat: 15, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-avocado', name: 'Avocado', servingSize: 1, servingUnit: 'whole', calories: 322, protein: 4, carbs: 17, fat: 29, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-whole-wheat-bread', name: 'Bread (whole wheat)', servingSize: 1, servingUnit: 'slice', calories: 81, protein: 4, carbs: 14, fat: 1.1, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-cheddar-cheese', name: 'Cheddar Cheese', servingSize: 28, servingUnit: 'g', calories: 113, protein: 7, carbs: 0.4, fat: 9.3, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-whey', name: 'Protein Powder (whey)', servingSize: 1, servingUnit: 'scoop', calories: 120, protein: 24, carbs: 3, fat: 1.5, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-apple', name: 'Apple', servingSize: 1, servingUnit: 'medium', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
  { id: 'seed-almonds', name: 'Almonds', servingSize: 28, servingUnit: 'g', calories: 164, protein: 6, carbs: 6, fat: 14, source: 'seed', usageCount: 0, createdAt: SEED_CREATED_AT },
]
const EMPTY_LOG_ENTRIES: FoodLogEntry[] = []

interface StorageCache {
  initialized: boolean
  foods: Food[]
  settings: UserSettings
  uiPrefs: UiPrefs
  weights: WeightEntry[]
  mealTemplates: MealTemplate[]
  dayMeta: DayMeta[]
  activityLog: ActivityEntry[]
  interventions: InterventionEntry[]
  checkInHistory: CheckInRecord[]
  coachingCalibration: CoachingCalibrationRecord[]
  coachThread: CoachThreadState
  coachFeedback: CoachFeedback[]
  coachQueue: CoachQueuedQuestion[]
  coachConfig: CoachProviderConfig
  logsByDate: Record<string, FoodLogEntry[]>
  recoveryIssues: RecoverableDataIssue[]
  initializationError: AppActionError | null
  protectedKeys: Set<string>
}

interface ParsedJsonResult<T> {
  status: 'ok' | 'missing' | 'invalid'
  value: T | null
}

interface RawStorageSnapshot {
  schemaVersion: string | null
  foods: string | null
  settings: string | null
  uiPrefs: string | null
  weights: string | null
  mealTemplates: string | null
  dayMeta: string | null
  activityLog: string | null
  interventions: string | null
  checkInHistory: string | null
  coachingCalibration: string | null
  coachThread: string | null
  coachFeedback: string | null
  coachQueue: string | null
  coachConfig: string | null
  logsByKey: Record<string, string | null>
}

interface NormalizedStorageState {
  foods: Food[]
  settings: UserSettings
  uiPrefs: UiPrefs
  weights: WeightEntry[]
  mealTemplates: MealTemplate[]
  dayMeta: DayMeta[]
  activityLog: ActivityEntry[]
  interventions: InterventionEntry[]
  checkInHistory: CheckInRecord[]
  coachingCalibration: CoachingCalibrationRecord[]
  coachThread: CoachThreadState
  coachFeedback: CoachFeedback[]
  coachQueue: CoachQueuedQuestion[]
  coachConfig: CoachProviderConfig
  logsByDate: Record<string, FoodLogEntry[]>
}

type StorageListener = () => void

const storageCache: StorageCache = {
  initialized: false,
  foods: [],
  settings: DEFAULT_SETTINGS,
  uiPrefs: DEFAULT_UI_PREFS,
  weights: [],
  mealTemplates: [],
  dayMeta: [],
  activityLog: [],
  interventions: [],
  checkInHistory: [],
  coachingCalibration: [],
  coachThread: {
    messages: [],
    updatedAt: new Date(0).toISOString(),
  },
  coachFeedback: [],
  coachQueue: [],
  coachConfig: DEFAULT_COACH_CONFIG,
  logsByDate: {},
  recoveryIssues: [],
  initializationError: null,
  protectedKeys: new Set(),
}

const storageListeners = new Set<StorageListener>()
let storageSyncBound = false
let storageChannel: BroadcastChannel | null = null
let storageChangeScheduled = false
let storageInitializationPromise: Promise<void> | null = null

const INDEXED_DB_CORE_DOMAINS = ['foods', 'settings', 'weights', 'mealTemplates', 'logsByDate'] as const

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildIssue(scope: RecoverableDataIssue['scope'], key: string, message: string): RecoverableDataIssue {
  return {
    id: crypto.randomUUID(),
    scope,
    key,
    message,
  }
}

function recordIssue(scope: RecoverableDataIssue['scope'], key: string, message: string): void {
  storageCache.recoveryIssues.push(buildIssue(scope, key, message))
}

function getStorageError(error: unknown): AppActionError {
  if (error instanceof DOMException) {
    if (error.name === 'QuotaExceededError') {
      return {
        code: 'quota',
        message: 'Storage is full. Free up browser storage or remove older data before saving again.',
      }
    }

    if (error.name === 'SecurityError') {
      return {
        code: 'denied',
        message: 'Browser storage is unavailable in this mode. Disable private restrictions and try again.',
      }
    }
  }

  return {
    code: 'unknown',
    message: 'Something went wrong while saving to local storage.',
  }
}

function safeParse<T>(rawValue: string | null): ParsedJsonResult<T> {
  if (rawValue === null) {
    return {
      status: 'missing',
      value: null,
    }
  }

  try {
    return {
      status: 'ok',
      value: JSON.parse(rawValue) as T,
    }
  } catch {
    return {
      status: 'invalid',
      value: null,
    }
  }
}

function directWriteJson(key: string, value: unknown): ActionResult<void> {
  if (!canUseStorage()) {
    return fail('unavailable', 'Browser storage is not available in this environment.')
  }

  if (storageCache.initialized && storageCache.protectedKeys.has(key)) {
    return fail(
      'recoveryRequired',
      'Stored data for this section is unreadable. Review recovery issues in Settings before saving changes here.',
    )
  }

  return rawWriteJson(key, value)
}

function rawWriteJson(key: string, value: unknown): ActionResult<void> {
  if (!canUseStorage()) {
    return fail('unavailable', 'Browser storage is not available in this environment.')
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return ok(undefined)
  } catch (error) {
    return { ok: false, error: getStorageError(error) }
  }
}

function restoreRawValue(key: string, rawValue: string | null): void {
  if (!canUseStorage()) {
    return
  }

  if (rawValue === null) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, rawValue)
}

function captureRawStorageSnapshot(): RawStorageSnapshot {
  if (!canUseStorage()) {
    return {
      schemaVersion: null,
      foods: null,
      settings: null,
      uiPrefs: null,
      weights: null,
      mealTemplates: null,
      dayMeta: null,
      activityLog: null,
      interventions: null,
      checkInHistory: null,
      coachingCalibration: null,
      coachThread: null,
      coachFeedback: null,
      coachQueue: null,
      coachConfig: null,
      logsByKey: {},
    }
  }

  const logsByKey = Object.fromEntries(
    getAllLogKeys().map((key) => [key, window.localStorage.getItem(key)]),
  )

  return {
    schemaVersion: window.localStorage.getItem(STORAGE_KEYS.schemaVersion),
    foods: window.localStorage.getItem(STORAGE_KEYS.foods),
    settings: window.localStorage.getItem(STORAGE_KEYS.settings),
    uiPrefs: window.localStorage.getItem(STORAGE_KEYS.uiPrefs),
    weights: window.localStorage.getItem(STORAGE_KEYS.weights),
    mealTemplates: window.localStorage.getItem(STORAGE_KEYS.mealTemplates),
    dayMeta: window.localStorage.getItem(STORAGE_KEYS.dayMeta),
    activityLog: window.localStorage.getItem(STORAGE_KEYS.activityLog),
    interventions: window.localStorage.getItem(STORAGE_KEYS.interventions),
    checkInHistory: window.localStorage.getItem(STORAGE_KEYS.checkInHistory),
    coachingCalibration: window.localStorage.getItem(STORAGE_KEYS.coachingCalibration),
    coachThread: window.localStorage.getItem(STORAGE_KEYS.coachThread),
    coachFeedback: window.localStorage.getItem(STORAGE_KEYS.coachFeedback),
    coachQueue: window.localStorage.getItem(STORAGE_KEYS.coachQueue),
    coachConfig: window.localStorage.getItem(STORAGE_KEYS.coachConfig),
    logsByKey,
  }
}

function emitStorageChange(): void {
  if (storageChangeScheduled) {
    return
  }

  storageChangeScheduled = true
  Promise.resolve().then(() => {
    storageChangeScheduled = false
    for (const listener of storageListeners) {
      listener()
    }
  })
}

function broadcastStorageChange(): void {
  storageChannel?.postMessage({
    type: 'storage-updated',
    source: STORAGE_SYNC_SOURCE,
  })
}

function buildCoreIndexedDbSnapshot() {
  return {
    foods: storageCache.foods,
    settings: storageCache.settings,
    weights: storageCache.weights,
    mealTemplates: storageCache.mealTemplates,
    logsByDate: storageCache.logsByDate,
  }
}

function clearCoreProtectedKeys(): void {
  storageCache.protectedKeys.delete(STORAGE_KEYS.foods)
  storageCache.protectedKeys.delete(STORAGE_KEYS.settings)
  storageCache.protectedKeys.delete(STORAGE_KEYS.weights)
  storageCache.protectedKeys.delete(STORAGE_KEYS.mealTemplates)
  for (const key of [...storageCache.protectedKeys]) {
    if (key.startsWith(LOG_KEY_PREFIX)) {
      storageCache.protectedKeys.delete(key)
    }
  }
}

function clearCoreRecoveryIssues(): void {
  storageCache.recoveryIssues = storageCache.recoveryIssues.filter((issue) => {
    if (issue.key === STORAGE_KEYS.foods) {
      return false
    }

    if (issue.key === STORAGE_KEYS.settings) {
      return false
    }

    if (issue.key === STORAGE_KEYS.weights) {
      return false
    }

    if (issue.key === STORAGE_KEYS.mealTemplates) {
      return false
    }

    return !issue.key.startsWith(LOG_KEY_PREFIX)
  })
}

function syncCoreDomainsFromIndexedDb(
  snapshot: {
  foods: Food[]
  settings: UserSettings
  weights: WeightEntry[]
  mealTemplates: MealTemplate[]
  logsByDate: Record<string, FoodLogEntry[]>
},
  options?: {
    preserveRecoveryKeys?: Set<string>
  },
): void {
  storageCache.foods = sortFoodsByName(snapshot.foods.map(normalizeFoodRecord))
  storageCache.settings = normalizeSettings(snapshot.settings)
  storageCache.weights = dedupeWeightsByDate(snapshot.weights.map(normalizeWeightEntry))
  storageCache.mealTemplates = sortTemplatesByUsage(snapshot.mealTemplates.map(normalizeMealTemplate))
  storageCache.logsByDate = Object.fromEntries(
    Object.entries(snapshot.logsByDate).map(([date, entries]) => [
      date,
      sortLogEntries(entries.map((entry) => normalizeFoodLogEntry({ ...entry, date }))),
    ]),
  )

  if (!options?.preserveRecoveryKeys?.size) {
    clearCoreProtectedKeys()
    clearCoreRecoveryIssues()
  }
}

function applyNormalizedStateToCache(state: NormalizedStorageState): void {
  storageCache.foods = state.foods
  storageCache.settings = state.settings
  storageCache.uiPrefs = state.uiPrefs
  storageCache.weights = state.weights
  storageCache.mealTemplates = state.mealTemplates
  storageCache.dayMeta = state.dayMeta
  storageCache.activityLog = state.activityLog
  storageCache.interventions = state.interventions
  storageCache.checkInHistory = state.checkInHistory
  storageCache.coachingCalibration = state.coachingCalibration
  storageCache.coachThread = state.coachThread
  storageCache.coachFeedback = state.coachFeedback
  storageCache.coachQueue = state.coachQueue
  storageCache.coachConfig = state.coachConfig
  storageCache.logsByDate = state.logsByDate
  storageCache.initialized = true
}

async function persistCoreDomainsToIndexedDb(reason: string): Promise<void> {
  try {
    await writeIndexedDbCoreSnapshot(buildCoreIndexedDbSnapshot())
  } catch (error) {
    await recordDiagnosticsEvent({
      eventType: 'storage_migration_failed',
      severity: 'error',
      scope: 'storage',
      message: error instanceof Error ? error.message : 'Unable to persist IndexedDB data.',
      payload: {
        reason,
      },
    })
  }
}

function sortLogEntries(entries: FoodLogEntry[]): FoodLogEntry[] {
  return [...entries].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function dedupeWeightsByDate(weights: WeightEntry[]): WeightEntry[] {
  const byDate = new Map<string, WeightEntry>()

  for (const entry of weights) {
    const existingEntry = byDate.get(entry.date)
    const existingTimestamp = existingEntry?.deletedAt ?? existingEntry?.updatedAt ?? existingEntry?.createdAt ?? ''
    const nextTimestamp = entry.deletedAt ?? entry.updatedAt ?? entry.createdAt
    if (!existingEntry || existingTimestamp <= nextTimestamp) {
      byDate.set(entry.date, entry)
    }
  }

  return [...byDate.values()]
}

function reinitializeStorageFromDisk(): void {
  storageCache.initialized = false
  storageCache.protectedKeys = new Set()
  storageInitializationPromise = null
  void initializeStorage().finally(() => {
    emitStorageChange()
  })
}

function bindStorageSync(): void {
  if (storageSyncBound || typeof window === 'undefined') {
    return
  }

  storageSyncBound = true
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.recoveryBackup) {
      return
    }

    if (
      event.key === null ||
      event.key === STORAGE_KEYS.schemaVersion ||
      event.key?.startsWith(LOG_KEY_PREFIX) ||
      Object.values(STORAGE_KEYS).includes(event.key as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS])
    ) {
      reinitializeStorageFromDisk()
    }
  })

  if (typeof BroadcastChannel !== 'undefined') {
    storageChannel = new BroadcastChannel(STORAGE_SYNC_CHANNEL)
    storageChannel.addEventListener('message', (event: MessageEvent<{ type?: string; source?: string }>) => {
      if (event.data?.type !== 'storage-updated' || event.data.source === STORAGE_SYNC_SOURCE) {
        return
      }

      reinitializeStorageFromDisk()
    })
  }
}

function persistRecoveryBackup(
  snapshot: RawStorageSnapshot,
  reason = 'A raw recovery backup was saved before the app normalized stored data.',
  shouldRecordIssue = true,
): ActionResult<void> {
  const backupResult = rawWriteJson(STORAGE_KEYS.recoveryBackup, {
    createdAt: new Date().toISOString(),
    reason,
    snapshot,
  })

  if (!backupResult.ok) {
    storageCache.initializationError = backupResult.error
    recordIssue('migration', STORAGE_KEYS.recoveryBackup, backupResult.error.message)
    return backupResult
  }

  if (shouldRecordIssue) {
    recordIssue('migration', STORAGE_KEYS.recoveryBackup, reason)
    void recordDiagnosticsEvent({
      eventType: 'storage_recovery_triggered',
      severity: 'warning',
      scope: 'storage',
      message: reason,
      recordKey: STORAGE_KEYS.recoveryBackup,
      payload: { reason },
    })
  }

  return backupResult
}

function sortFoodsByName(foods: Food[]): Food[] {
  return [...foods].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name)
    if (nameComparison !== 0) {
      return nameComparison
    }

    return (left.brand ?? '').localeCompare(right.brand ?? '')
  })
}

function isValidLabelNutritionFieldKey(value: unknown): value is LabelNutritionFieldKey {
  return (
    value === 'calories' ||
    value === 'protein' ||
    value === 'carbs' ||
    value === 'fat' ||
    value === 'fiber' ||
    value === 'sugars' ||
    value === 'salt' ||
    value === 'sodium'
  )
}

function normalizeLabelNutritionField(field: LabelNutritionField): LabelNutritionField {
  return {
    normalizedKey: isValidLabelNutritionFieldKey(field.normalizedKey)
      ? field.normalizedKey
      : undefined,
    rawLabel: field.rawLabel.trim(),
    value: field.value === 'traces' ? 'traces' : field.value,
    unit: field.unit.trim(),
  }
}

function normalizeLabelNutritionPanel(
  panel: LabelNutritionPanel | null | undefined,
): LabelNutritionPanel | undefined {
  if (!panel || !Array.isArray(panel.fields)) {
    return undefined
  }

  const fields = panel.fields
    .filter(
      (field) =>
        typeof field.rawLabel === 'string' &&
        field.rawLabel.trim() &&
        (field.value === 'traces' || (typeof field.value === 'number' && Number.isFinite(field.value))) &&
        typeof field.unit === 'string' &&
        field.unit.trim(),
    )
    .map(normalizeLabelNutritionField)

  if (!fields.length) {
    return undefined
  }

  return {
    fields,
    servingSizeText: panel.servingSizeText?.trim() || undefined,
    locale:
      panel.locale === 'us' || panel.locale === 'uk_eu' || panel.locale === 'mixed'
        ? panel.locale
        : 'unknown',
    source: 'label_ocr',
    reviewedAt: panel.reviewedAt?.trim() || new Date().toISOString(),
  }
}

function readLabelNutritionNumber(
  panel: LabelNutritionPanel | undefined,
  key: LabelNutritionFieldKey,
): number | undefined {
  const matchedField = panel?.fields.find(
    (field) => field.normalizedKey === key && typeof field.value === 'number',
  )

  return matchedField && typeof matchedField.value === 'number' ? matchedField.value : undefined
}

function normalizeFoodRecord(food: Food): Food {
  const labelNutrition = normalizeLabelNutritionPanel(food.labelNutrition)
  const provider = food.provider === 'open_food_facts' ? 'open_food_facts' : undefined
  const importConfidence =
    food.importConfidence === 'direct_match' ||
    food.importConfidence === 'weak_match' ||
    food.importConfidence === 'manual_review_required'
      ? food.importConfidence
      : undefined
  const sourceQuality =
    food.sourceQuality === 'high' || food.sourceQuality === 'medium' || food.sourceQuality === 'low'
      ? food.sourceQuality
      : undefined

  return {
    ...food,
    name: food.name.trim(),
    brand: food.brand?.trim() || undefined,
    servingUnit: food.servingUnit.trim(),
    source: food.source ?? 'custom',
    provider,
    importConfidence,
    sourceQuality,
    sourceQualityNote: food.sourceQualityNote?.trim() || undefined,
    usageCount: Number.isFinite(food.usageCount) ? food.usageCount : 0,
    fiber: food.fiber ?? undefined,
    sugars: Number.isFinite(food.sugars) ? food.sugars : readLabelNutritionNumber(labelNutrition, 'sugars'),
    salt: Number.isFinite(food.salt) ? food.salt : readLabelNutritionNumber(labelNutrition, 'salt'),
    sodium: Number.isFinite(food.sodium)
      ? food.sodium
      : readLabelNutritionNumber(labelNutrition, 'sodium'),
    labelNutrition,
    barcode: food.barcode?.trim() || undefined,
    archivedAt: food.archivedAt?.trim() || undefined,
    lastUsedAt: food.lastUsedAt?.trim() || undefined,
    lastServings: Number.isFinite(food.lastServings) ? food.lastServings : undefined,
    updatedAt: food.updatedAt?.trim() || undefined,
  }
}

function normalizeSettings(settings: Partial<UserSettings> | null): UserSettings {
  const goalMode =
    settings?.goalMode === 'lose' || settings?.goalMode === 'gain' || settings?.goalMode === 'maintain'
      ? settings.goalMode
      : DEFAULT_SETTINGS.goalMode
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    weightUnit: settings?.weightUnit === 'kg' ? 'kg' : 'lb',
    goalMode,
    coachingEnabled: settings?.coachingEnabled ?? DEFAULT_SETTINGS.coachingEnabled,
    checkInWeekday:
      settings?.checkInWeekday !== undefined &&
      Number.isInteger(settings.checkInWeekday) &&
      settings.checkInWeekday >= 0 &&
      settings.checkInWeekday <= 6
        ? settings.checkInWeekday
        : DEFAULT_SETTINGS.checkInWeekday,
    targetWeeklyRatePercent:
      typeof settings?.targetWeeklyRatePercent === 'number' &&
      Number.isFinite(settings.targetWeeklyRatePercent)
        ? settings.targetWeeklyRatePercent
        : getDefaultTargetWeeklyRatePercent(goalMode),
    dailyStepTarget:
      typeof settings?.dailyStepTarget === 'number' && Number.isFinite(settings.dailyStepTarget)
        ? settings.dailyStepTarget
        : undefined,
    weeklyCardioMinuteTarget:
      typeof settings?.weeklyCardioMinuteTarget === 'number' &&
      Number.isFinite(settings.weeklyCardioMinuteTarget)
        ? settings.weeklyCardioMinuteTarget
        : undefined,
    lastImportAt: settings?.lastImportAt?.trim() || undefined,
    coachingDismissedAt: settings?.coachingDismissedAt?.trim() || undefined,
    askCoachEnabled: settings?.askCoachEnabled ?? DEFAULT_SETTINGS.askCoachEnabled,
    shareInterventionsWithCoach:
      settings?.shareInterventionsWithCoach ?? DEFAULT_SETTINGS.shareInterventionsWithCoach,
    coachCitationsExpanded:
      settings?.coachCitationsExpanded ?? DEFAULT_SETTINGS.coachCitationsExpanded,
    coachConsentAt: settings?.coachConsentAt?.trim() || undefined,
  }
}

function normalizeWeightEntry(entry: WeightEntry): WeightEntry {
  return {
    ...entry,
    unit: entry.unit === 'kg' ? 'kg' : 'lb',
    updatedAt: entry.updatedAt?.trim() || undefined,
    deletedAt: entry.deletedAt?.trim() || undefined,
  }
}

function normalizeUiPrefs(prefs: Partial<UiPrefs> | null): UiPrefs {
  return {
    ...DEFAULT_UI_PREFS,
    ...prefs,
    keepOpenAfterAdd: prefs?.keepOpenAfterAdd ?? DEFAULT_UI_PREFS.keepOpenAfterAdd,
    preferredAskCoachMode: prefs?.preferredAskCoachMode === 'deep' ? 'deep' : 'standard',
    coachCitationsExpanded:
      prefs?.coachCitationsExpanded ?? DEFAULT_UI_PREFS.coachCitationsExpanded,
    coachAutoSendQueuedWhenOnline:
      prefs?.coachAutoSendQueuedWhenOnline ?? DEFAULT_UI_PREFS.coachAutoSendQueuedWhenOnline,
  }
}

function normalizeSnapshot(snapshot: FoodSnapshot): FoodSnapshot {
  return {
    ...snapshot,
    name: snapshot.name.trim(),
    brand: snapshot.brand?.trim() || undefined,
    servingUnit: snapshot.servingUnit.trim(),
    source: snapshot.source ?? 'custom',
    fiber: snapshot.fiber ?? undefined,
    barcode: snapshot.barcode?.trim() || undefined,
  }
}

function sortDayMeta(dayMeta: DayMeta[]): DayMeta[] {
  return [...dayMeta].sort((left, right) => left.date.localeCompare(right.date))
}

function normalizeDayMarkers(markers: DayMeta['markers']): DayMeta['markers'] {
  if (!Array.isArray(markers)) {
    return undefined
  }

  const nextMarkers = [...new Set(
    markers.filter(
      (marker): marker is NonNullable<DayMeta['markers']>[number] =>
        marker === 'travel' || marker === 'illness' || marker === 'high_calorie_event',
    ),
  )]

  return nextMarkers.length ? nextMarkers : undefined
}

function normalizeDayMeta(entry: DayMeta): DayMeta {
  return {
    date: entry.date,
    status:
      entry.status === 'complete' || entry.status === 'partial' || entry.status === 'fasting'
        ? entry.status
        : 'unmarked',
    markers: normalizeDayMarkers(entry.markers),
    updatedAt: entry.updatedAt,
  }
}

function sortActivityLog(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((left, right) => left.date.localeCompare(right.date))
}

function normalizeActivityEntry(entry: ActivityEntry): ActivityEntry {
  return {
    date: entry.date,
    steps: Number.isFinite(entry.steps) ? Math.max(0, Math.round(entry.steps ?? 0)) : undefined,
    cardioMinutes:
      Number.isFinite(entry.cardioMinutes) ? Math.max(0, Math.round(entry.cardioMinutes ?? 0)) : undefined,
    cardioType:
      entry.cardioType === 'walk' ||
      entry.cardioType === 'incline_treadmill' ||
      entry.cardioType === 'bike' ||
      entry.cardioType === 'run' ||
      entry.cardioType === 'other'
        ? entry.cardioType
        : undefined,
    notes: entry.notes?.trim() || undefined,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt?.trim() || undefined,
  }
}

function sortInterventions(entries: InterventionEntry[]): InterventionEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date)
    }

    const leftTime = left.takenAt ?? ''
    const rightTime = right.takenAt ?? ''
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime)
    }

    return left.createdAt.localeCompare(right.createdAt)
  })
}

function normalizeInterventionEntry(entry: InterventionEntry): InterventionEntry {
  return {
    ...entry,
    name: entry.name.trim(),
    category:
      entry.category === 'medication' ||
      entry.category === 'stimulant' ||
      entry.category === 'peptide' ||
      entry.category === 'other'
        ? entry.category
        : 'supplement',
    unit: entry.unit.trim(),
    route:
      entry.route === 'subcutaneous' ||
      entry.route === 'intramuscular' ||
      entry.route === 'topical' ||
      entry.route === 'other' ||
      entry.route === 'oral'
        ? entry.route
        : undefined,
    takenAt: entry.takenAt?.trim() || undefined,
    notes: entry.notes?.trim() || undefined,
    deletedAt: entry.deletedAt?.trim() || undefined,
  }
}

function normalizeFoodLogEntry(entry: FoodLogEntry): FoodLogEntry {
  return {
    ...entry,
    foodId: entry.foodId?.trim() || undefined,
    snapshot: normalizeSnapshot(entry.snapshot),
    updatedAt: entry.updatedAt?.trim() || undefined,
    deletedAt: entry.deletedAt?.trim() || undefined,
    needsReview: entry.needsReview ?? undefined,
  }
}

function sortCheckInHistory(records: CheckInRecord[]): CheckInRecord[] {
  return [...records].sort((left, right) => {
    if (left.weekEndDate !== right.weekEndDate) {
      return right.weekEndDate.localeCompare(left.weekEndDate)
    }

    const leftTimestamp = left.appliedAt ?? left.createdAt
    const rightTimestamp = right.appliedAt ?? right.createdAt
    return rightTimestamp.localeCompare(leftTimestamp)
  })
}

function normalizeCheckInRecord(record: CheckInRecord): CheckInRecord {
  return {
    ...record,
    targetWeeklyRatePercent: Number.isFinite(record.targetWeeklyRatePercent)
      ? record.targetWeeklyRatePercent
      : getDefaultTargetWeeklyRatePercent(record.goalMode),
    actualWeeklyRatePercent: Number.isFinite(record.actualWeeklyRatePercent)
      ? record.actualWeeklyRatePercent
      : 0,
    avgCalories: Number.isFinite(record.avgCalories) ? record.avgCalories : 0,
    avgProtein: Number.isFinite(record.avgProtein) ? record.avgProtein : 0,
    avgSteps: Number.isFinite(record.avgSteps) ? record.avgSteps : 0,
    weeklyCardioMinutes: Number.isFinite(record.weeklyCardioMinutes) ? record.weeklyCardioMinutes : 0,
    stepAdherencePercent: Number.isFinite(record.stepAdherencePercent) ? record.stepAdherencePercent : 100,
    cardioAdherencePercent: Number.isFinite(record.cardioAdherencePercent) ? record.cardioAdherencePercent : 100,
    avgWeight: Number.isFinite(record.avgWeight) ? record.avgWeight : 0,
    priorAvgWeight: Number.isFinite(record.priorAvgWeight) ? record.priorAvgWeight : 0,
    recommendedCalorieDelta:
      Number.isFinite(record.recommendedCalorieDelta) ? record.recommendedCalorieDelta : undefined,
    recommendedCalorieTarget:
      Number.isFinite(record.recommendedCalorieTarget) ? record.recommendedCalorieTarget : undefined,
    recommendedMacroTargets:
      record.recommendedMacroTargets &&
      Number.isFinite(record.recommendedMacroTargets.protein) &&
      Number.isFinite(record.recommendedMacroTargets.carbs) &&
      Number.isFinite(record.recommendedMacroTargets.fat)
        ? record.recommendedMacroTargets
        : undefined,
    recommendationReason: record.recommendationReason.trim(),
    status:
      record.status === 'applied' ||
      record.status === 'kept' ||
      record.status === 'insufficientData' ||
      record.status === 'ready'
        ? record.status
        : 'insufficientData',
    appliedAt: record.appliedAt?.trim() || undefined,
  }
}

function sortCalibrationRecords(records: CoachingCalibrationRecord[]): CoachingCalibrationRecord[] {
  return [...records].sort((left, right) => left.windowStart.localeCompare(right.windowStart))
}

function normalizeCalibrationRecord(record: CoachingCalibrationRecord): CoachingCalibrationRecord {
  return {
    ...record,
    eatingDayRecommendedCalories: record.eatingDayRecommendedCalories ?? undefined,
    observedTdee: record.observedTdee ?? undefined,
    tdeeError: record.tdeeError ?? undefined,
    within150: record.within150 ?? undefined,
    within250: record.within250 ?? undefined,
    validatedAt: record.validatedAt?.trim() || undefined,
  }
}

function normalizeCoachThreadState(state: Partial<CoachThreadState> | null): CoachThreadState {
  if (!state?.messages || !Array.isArray(state.messages)) {
    return {
      messages: [],
      updatedAt: state?.updatedAt?.trim() || new Date(0).toISOString(),
    }
  }

  const messages = state.messages.flatMap((rawMessage) => {
    if (!isRecord(rawMessage)) {
      return []
    }

    const id = readString(rawMessage.id) ?? crypto.randomUUID()
    const role: CoachThreadState['messages'][number]['role'] =
      rawMessage.role === 'assistant' || rawMessage.role === 'system' ? rawMessage.role : 'user'
    const content = readString(rawMessage.content) ?? ''
    const createdAt = readString(rawMessage.createdAt) ?? new Date().toISOString()
    const mode: CoachThreadState['messages'][number]['mode'] =
      rawMessage.mode === 'deep' ? 'deep' : rawMessage.mode === 'standard' ? 'standard' : undefined
    const stateValue: CoachThreadState['messages'][number]['state'] =
      rawMessage.state === 'ready' ||
      rawMessage.state === 'offline' ||
      rawMessage.state === 'queued' ||
      rawMessage.state === 'sending' ||
      rawMessage.state === 'failed' ||
      rawMessage.state === 'notConfigured'
        ? rawMessage.state
        : undefined
    const answerType: CoachThreadState['messages'][number]['answerType'] =
      rawMessage.answerType === 'data-aware' ||
      rawMessage.answerType === 'general-evidence' ||
      rawMessage.answerType === 'insufficient-data' ||
      rawMessage.answerType === 'safety-limited' ||
      rawMessage.answerType === 'not-configured'
        ? rawMessage.answerType
        : undefined

    return [
      {
        id,
        role,
        content,
        createdAt,
        mode,
        state: stateValue,
        answerType,
        citations: Array.isArray(rawMessage.citations) ? rawMessage.citations : undefined,
        proposals: Array.isArray(rawMessage.proposals) ? rawMessage.proposals : undefined,
        safetyFlags: Array.isArray(rawMessage.safetyFlags) ? rawMessage.safetyFlags : undefined,
        contextUsed: Array.isArray(rawMessage.contextUsed)
          ? rawMessage.contextUsed.filter((value): value is string => typeof value === 'string')
          : undefined,
      },
    ]
  })

  return {
    messages: messages.sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    updatedAt: state.updatedAt?.trim() || messages.at(-1)?.createdAt || new Date(0).toISOString(),
  }
}

function normalizeCoachFeedback(entries: CoachFeedback[] | null): CoachFeedback[] {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }

    const messageId = readString(entry.messageId)
    if (!messageId) {
      return []
    }

    return [
      {
        messageId,
        rating: entry.rating === 'down' ? 'down' : 'up',
        appliedActions: Array.isArray(entry.appliedActions)
          ? entry.appliedActions.filter((value): value is string => typeof value === 'string')
          : [],
        createdAt: readString(entry.createdAt) ?? new Date().toISOString(),
      },
    ]
  })
}

function normalizeCoachQueue(entries: CoachQueuedQuestion[] | null): CoachQueuedQuestion[] {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }

    const question = readString(entry.question)
    if (!question) {
      return []
    }

    return [
      {
        id: readString(entry.id) ?? crypto.randomUUID(),
        question,
        mode: entry.mode === 'deep' ? 'deep' : 'standard',
        createdAt: readString(entry.createdAt) ?? new Date().toISOString(),
      },
    ]
  })
}

function normalizeCoachProviderConfig(
  config: Partial<CoachProviderConfig> | null,
): CoachProviderConfig {
  return {
    provider:
      config?.provider === 'gemini' ||
      config?.provider === 'openai' ||
      config?.provider === 'anthropic'
        ? config.provider
        : 'none',
    configuredAt: config?.configuredAt?.trim() || undefined,
    autoSendQueuedWhenOnline:
      config?.autoSendQueuedWhenOnline ?? DEFAULT_COACH_CONFIG.autoSendQueuedWhenOnline,
  }
}

function buildSnapshotFromFood(food: Food): FoodSnapshot {
  return normalizeSnapshot({
    name: food.name,
    brand: food.brand,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
    source: food.source,
    barcode: food.barcode,
  })
}

function buildLegacyMissingSnapshot(): FoodSnapshot {
  return {
    name: 'Deleted food (legacy)',
    servingSize: 1,
    servingUnit: 'serving',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    source: 'custom',
  }
}

function parseLabelNutritionPanelStrict(
  rawPanel: unknown,
  contextLabel: string,
): ActionResult<LabelNutritionPanel | undefined> {
  if (rawPanel === undefined) {
    return ok(undefined)
  }

  if (!isRecord(rawPanel) || !Array.isArray(rawPanel.fields)) {
    return fail('invalidBackup', `${contextLabel} contains an invalid labelNutrition panel.`)
  }

  const fields: LabelNutritionField[] = []
  for (const [fieldIndex, rawField] of rawPanel.fields.entries()) {
    if (!isRecord(rawField)) {
      return fail(
        'invalidBackup',
        `${contextLabel} contains a malformed labelNutrition field #${fieldIndex + 1}.`,
      )
    }

    const rawLabel = readString(rawField.rawLabel)
    const unit = readString(rawField.unit)
    const value = rawField.value === 'traces' ? 'traces' : readNumber(rawField.value)
    if (!rawLabel || !unit || value === null) {
      return fail(
        'invalidBackup',
        `${contextLabel} contains an incomplete labelNutrition field #${fieldIndex + 1}.`,
      )
    }

    fields.push({
      normalizedKey: isValidLabelNutritionFieldKey(rawField.normalizedKey)
        ? rawField.normalizedKey
        : undefined,
      rawLabel,
      value,
      unit,
    })
  }

  return ok(
    normalizeLabelNutritionPanel({
      fields,
      servingSizeText: readOptionalString(rawPanel.servingSizeText),
      locale:
        rawPanel.locale === 'us' || rawPanel.locale === 'uk_eu' || rawPanel.locale === 'mixed'
          ? rawPanel.locale
          : 'unknown',
      source: 'label_ocr',
      reviewedAt: readString(rawPanel.reviewedAt) ?? new Date().toISOString(),
    }),
  )
}

function parseFoodSnapshot(rawValue: unknown): FoodSnapshot | null {
  if (!isRecord(rawValue)) {
    return null
  }

  const name = readString(rawValue.name)
  const servingSize = readNumber(rawValue.servingSize)
  const servingUnit = readString(rawValue.servingUnit)
  const calories = readNumber(rawValue.calories)
  const protein = readNumber(rawValue.protein)
  const carbs = readNumber(rawValue.carbs)
  const fat = readNumber(rawValue.fat)
  const source = rawValue.source === 'seed' || rawValue.source === 'api' ? rawValue.source : 'custom'

  if (
    !name ||
    servingSize === null ||
    !servingUnit ||
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null
  ) {
    return null
  }

  return normalizeSnapshot({
    name,
    brand: readOptionalString(rawValue.brand),
    servingSize,
    servingUnit,
    calories,
    protein,
    carbs,
    fat,
    fiber: readNumber(rawValue.fiber) ?? undefined,
    source,
    barcode: readOptionalString(rawValue.barcode),
  })
}

function parseFoodRecordStrict(rawFood: unknown, index: number): ActionResult<Food> {
  if (!isRecord(rawFood)) {
    return fail('invalidBackup', `Backup food #${index + 1} is malformed.`)
  }

  const id = readString(rawFood.id) ?? crypto.randomUUID()
  const name = readString(rawFood.name)
  const servingSize = readNumber(rawFood.servingSize)
  const servingUnit = readString(rawFood.servingUnit)
  const calories = readNumber(rawFood.calories)
  const protein = readNumber(rawFood.protein)
  const carbs = readNumber(rawFood.carbs)
  const fat = readNumber(rawFood.fat)

  if (
    !name ||
    servingSize === null ||
    !servingUnit ||
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null
  ) {
    return fail('invalidBackup', `Backup food #${index + 1} is incomplete.`)
  }

  const labelNutritionResult = parseLabelNutritionPanelStrict(
    rawFood.labelNutrition,
    `Backup food #${index + 1}`,
  )
  if (!labelNutritionResult.ok) {
    return labelNutritionResult
  }

  return ok(
    normalizeFoodRecord({
      id,
      name,
      brand: readOptionalString(rawFood.brand),
      servingSize,
      servingUnit,
      calories,
      protein,
      carbs,
      fat,
      fiber: readNumber(rawFood.fiber) ?? undefined,
      sugars: readNumber(rawFood.sugars) ?? undefined,
      salt: readNumber(rawFood.salt) ?? undefined,
      sodium: readNumber(rawFood.sodium) ?? undefined,
      labelNutrition: labelNutritionResult.data,
      source: rawFood.source === 'seed' || rawFood.source === 'api' ? rawFood.source : 'custom',
      provider: rawFood.provider === 'open_food_facts' ? 'open_food_facts' : undefined,
      importConfidence:
        rawFood.importConfidence === 'direct_match' ||
        rawFood.importConfidence === 'weak_match' ||
        rawFood.importConfidence === 'manual_review_required'
          ? rawFood.importConfidence
          : undefined,
      sourceQuality:
        rawFood.sourceQuality === 'high' ||
        rawFood.sourceQuality === 'medium' ||
        rawFood.sourceQuality === 'low'
          ? rawFood.sourceQuality
          : undefined,
      sourceQualityNote: readOptionalString(rawFood.sourceQualityNote),
      usageCount: readNumber(rawFood.usageCount) ?? 0,
      createdAt: readString(rawFood.createdAt) ?? new Date().toISOString(),
      updatedAt: readOptionalString(rawFood.updatedAt),
      barcode: readOptionalString(rawFood.barcode),
      archivedAt: readOptionalString(rawFood.archivedAt),
      lastUsedAt: readOptionalString(rawFood.lastUsedAt),
      lastServings: readNumber(rawFood.lastServings) ?? undefined,
    }),
  )
}

function normalizeTemplateEntry(entry: MealTemplate['entries'][number]): MealTemplate['entries'][number] {
  return {
    ...entry,
    foodId: entry.foodId?.trim() || undefined,
    snapshot: normalizeSnapshot(entry.snapshot),
    servings: Number.isFinite(entry.servings) ? entry.servings : 1,
  }
}

function normalizeMealTemplate(template: MealTemplate): MealTemplate {
  return {
    ...template,
    name: template.name.trim(),
    notes: template.notes?.trim() || undefined,
    archivedAt: template.archivedAt?.trim() || undefined,
    defaultMeal: VALID_MEALS.includes(template.defaultMeal as MealType)
      ? (template.defaultMeal as MealType)
      : undefined,
    entries: template.entries.map(normalizeTemplateEntry),
    usageCount: Number.isFinite(template.usageCount) ? template.usageCount : 0,
    deletedAt: template.deletedAt?.trim() || undefined,
  }
}

function sortTemplatesByUsage(templates: MealTemplate[]): MealTemplate[] {
  return [...templates].sort((left, right) => {
    if (left.usageCount !== right.usageCount) {
      return right.usageCount - left.usageCount
    }

    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

function parseMealTemplateEntry(rawEntry: unknown, index: number): MealTemplate['entries'][number] | null {
  if (!isRecord(rawEntry)) {
    recordIssue('migration', STORAGE_KEYS.mealTemplates, `Skipped malformed template entry #${index + 1}.`)
    return null
  }

  const snapshot = parseFoodSnapshot(rawEntry.snapshot)
  const servings = readNumber(rawEntry.servings)
  if (!snapshot || servings === null || servings <= 0) {
    recordIssue('migration', STORAGE_KEYS.mealTemplates, `Skipped incomplete template entry #${index + 1}.`)
    return null
  }

  return normalizeTemplateEntry({
    id: readString(rawEntry.id) ?? crypto.randomUUID(),
    foodId: readOptionalString(rawEntry.foodId),
    snapshot,
    servings,
    createdAt: readString(rawEntry.createdAt) ?? new Date().toISOString(),
  })
}

function parseMealTemplates(rawTemplates: unknown): MealTemplate[] {
  if (!Array.isArray(rawTemplates)) {
    return []
  }

  const parsedTemplates = rawTemplates.flatMap((rawTemplate, index) => {
    if (!isRecord(rawTemplate)) {
      recordIssue('migration', STORAGE_KEYS.mealTemplates, `Skipped malformed template #${index + 1}.`)
      return []
    }

    const name = readString(rawTemplate.name)
    const entries = Array.isArray(rawTemplate.entries)
      ? rawTemplate.entries
          .map((rawEntry, entryIndex) => parseMealTemplateEntry(rawEntry, entryIndex))
          .filter((entry): entry is MealTemplate['entries'][number] => entry !== null)
      : []

    if (!name || !entries.length) {
      recordIssue('migration', STORAGE_KEYS.mealTemplates, `Skipped incomplete template #${index + 1}.`)
      return []
    }

    return [
      normalizeMealTemplate({
        id: readString(rawTemplate.id) ?? crypto.randomUUID(),
        name,
        defaultMeal: VALID_MEALS.includes(rawTemplate.defaultMeal as MealType)
          ? (rawTemplate.defaultMeal as MealType)
          : undefined,
        entries,
        usageCount: readNumber(rawTemplate.usageCount) ?? 0,
        createdAt: readString(rawTemplate.createdAt) ?? new Date().toISOString(),
        updatedAt: readString(rawTemplate.updatedAt) ?? new Date().toISOString(),
        notes: readOptionalString(rawTemplate.notes),
        archivedAt: readOptionalString(rawTemplate.archivedAt),
        deletedAt: readOptionalString(rawTemplate.deletedAt),
      }),
    ]
  })

  return sortTemplatesByUsage(parsedTemplates)
}

function parseWeightEntryStrict(rawWeight: unknown, index: number): ActionResult<WeightEntry> {
  if (!isRecord(rawWeight)) {
    return fail('invalidBackup', `Backup weight #${index + 1} is malformed.`)
  }

  const id = readString(rawWeight.id) ?? crypto.randomUUID()
  const date = isValidDateKey(rawWeight.date) ? rawWeight.date : null
  const weight = readNumber(rawWeight.weight)
  const createdAt = readString(rawWeight.createdAt) ?? new Date().toISOString()
  const updatedAt = readOptionalString(rawWeight.updatedAt)
  const deletedAt = readOptionalString(rawWeight.deletedAt)
  const unit = rawWeight.unit === 'kg' ? 'kg' : rawWeight.unit === 'lb' ? 'lb' : null

  if (!date || weight === null || !unit) {
    return fail('invalidBackup', `Backup weight #${index + 1} is incomplete.`)
  }

  return ok({
    id,
    date,
    weight,
    unit,
    createdAt,
    updatedAt,
    deletedAt,
  })
}

function parseDayMetaStrict(rawEntry: unknown, index: number): ActionResult<DayMeta> {
  if (!isRecord(rawEntry)) {
    return fail('invalidBackup', `Backup day-state entry #${index + 1} is malformed.`)
  }

  const date = isValidDateKey(rawEntry.date) ? rawEntry.date : null
  const status =
    rawEntry.status === 'complete' || rawEntry.status === 'partial' || rawEntry.status === 'fasting'
      ? rawEntry.status
      : rawEntry.status === 'unmarked'
        ? 'unmarked'
        : null
  const markers = Array.isArray(rawEntry.markers) ? normalizeDayMarkers(rawEntry.markers) : undefined
  const updatedAt = readString(rawEntry.updatedAt) ?? new Date().toISOString()

  if (!date || !status) {
    return fail('invalidBackup', `Backup day-state entry #${index + 1} is incomplete.`)
  }

  return ok(normalizeDayMeta({ date, status, markers, updatedAt }))
}

function parseActivityEntryStrict(rawEntry: unknown, index: number): ActionResult<ActivityEntry> {
  if (!isRecord(rawEntry)) {
    return fail('invalidBackup', `Backup activity entry #${index + 1} is malformed.`)
  }

  const date = isValidDateKey(rawEntry.date) ? rawEntry.date : null
  const steps = readNumber(rawEntry.steps)
  const cardioMinutes = readNumber(rawEntry.cardioMinutes)
  const cardioType =
    rawEntry.cardioType === 'walk' ||
    rawEntry.cardioType === 'incline_treadmill' ||
    rawEntry.cardioType === 'bike' ||
    rawEntry.cardioType === 'run' ||
    rawEntry.cardioType === 'other'
      ? rawEntry.cardioType
      : undefined
  const notes = readOptionalString(rawEntry.notes)
  const updatedAt = readString(rawEntry.updatedAt) ?? new Date().toISOString()
  const deletedAt = readOptionalString(rawEntry.deletedAt)

  if (!date || (steps === null && cardioMinutes === null && !notes && !cardioType)) {
    return fail('invalidBackup', `Backup activity entry #${index + 1} is incomplete.`)
  }

  return ok(
    normalizeActivityEntry({
      date,
      steps: steps ?? undefined,
      cardioMinutes: cardioMinutes ?? undefined,
      cardioType,
      notes,
      updatedAt,
      deletedAt,
    }),
  )
}

function parseInterventionEntryStrict(rawEntry: unknown, index: number): ActionResult<InterventionEntry> {
  if (!isRecord(rawEntry)) {
    return fail('invalidBackup', `Backup intervention #${index + 1} is malformed.`)
  }

  const date = isValidDateKey(rawEntry.date) ? rawEntry.date : null
  const name = readString(rawEntry.name)
  const dose = readNumber(rawEntry.dose)
  const unit = readString(rawEntry.unit)
  const createdAt = readString(rawEntry.createdAt) ?? new Date().toISOString()
  const updatedAt = readString(rawEntry.updatedAt) ?? createdAt
  const deletedAt = readOptionalString(rawEntry.deletedAt)

  if (!date || !name || dose === null || !unit) {
    return fail('invalidBackup', `Backup intervention #${index + 1} is incomplete.`)
  }

  return ok(
    normalizeInterventionEntry({
      id: readString(rawEntry.id) ?? crypto.randomUUID(),
      date,
      name,
      category:
        rawEntry.category === 'medication' ||
        rawEntry.category === 'stimulant' ||
        rawEntry.category === 'peptide' ||
        rawEntry.category === 'other'
          ? rawEntry.category
          : 'supplement',
      dose,
      unit,
      route:
        rawEntry.route === 'oral' ||
        rawEntry.route === 'subcutaneous' ||
        rawEntry.route === 'intramuscular' ||
        rawEntry.route === 'topical' ||
        rawEntry.route === 'other'
          ? rawEntry.route
          : undefined,
      takenAt: readOptionalString(rawEntry.takenAt),
      notes: readOptionalString(rawEntry.notes),
      createdAt,
      updatedAt,
      deletedAt,
    }),
  )
}

function parseCheckInRecordStrict(rawRecord: unknown, index: number): ActionResult<CheckInRecord> {
  if (!isRecord(rawRecord)) {
    return fail('invalidBackup', `Backup check-in #${index + 1} is malformed.`)
  }

  const id = readString(rawRecord.id) ?? crypto.randomUUID()
  const weekEndDate = isValidDateKey(rawRecord.weekEndDate) ? rawRecord.weekEndDate : null
  const weekStartDate = isValidDateKey(rawRecord.weekStartDate) ? rawRecord.weekStartDate : null
  const priorWeekStartDate = isValidDateKey(rawRecord.priorWeekStartDate)
    ? rawRecord.priorWeekStartDate
    : null
  const priorWeekEndDate = isValidDateKey(rawRecord.priorWeekEndDate) ? rawRecord.priorWeekEndDate : null
  const goalMode =
    rawRecord.goalMode === 'lose' || rawRecord.goalMode === 'maintain' || rawRecord.goalMode === 'gain'
      ? rawRecord.goalMode
      : null
  const targetWeeklyRatePercent = readNumber(rawRecord.targetWeeklyRatePercent)
  const actualWeeklyRatePercent = readNumber(rawRecord.actualWeeklyRatePercent)
  const avgCalories = readNumber(rawRecord.avgCalories)
  const avgProtein = readNumber(rawRecord.avgProtein)
  const avgSteps = readNumber(rawRecord.avgSteps)
  const weeklyCardioMinutes = readNumber(rawRecord.weeklyCardioMinutes)
  const stepAdherencePercent = readNumber(rawRecord.stepAdherencePercent)
  const cardioAdherencePercent = readNumber(rawRecord.cardioAdherencePercent)
  const avgWeight = readNumber(rawRecord.avgWeight)
  const priorAvgWeight = readNumber(rawRecord.priorAvgWeight)
  const recommendationReason = readString(rawRecord.recommendationReason)
  const status =
    rawRecord.status === 'ready' ||
    rawRecord.status === 'applied' ||
    rawRecord.status === 'kept' ||
    rawRecord.status === 'insufficientData'
      ? rawRecord.status
      : null
  const createdAt = readString(rawRecord.createdAt) ?? new Date().toISOString()

  if (
    !weekEndDate ||
    !weekStartDate ||
    !priorWeekStartDate ||
    !priorWeekEndDate ||
    !goalMode ||
    targetWeeklyRatePercent === null ||
    actualWeeklyRatePercent === null ||
    avgCalories === null ||
    avgProtein === null ||
    avgSteps === null ||
    weeklyCardioMinutes === null ||
    stepAdherencePercent === null ||
    cardioAdherencePercent === null ||
    avgWeight === null ||
    priorAvgWeight === null ||
    !recommendationReason ||
    !status
  ) {
    return fail('invalidBackup', `Backup check-in #${index + 1} is incomplete.`)
  }

  return ok(
    normalizeCheckInRecord({
      id,
      weekEndDate,
      weekStartDate,
      priorWeekStartDate,
      priorWeekEndDate,
      goalMode,
      targetWeeklyRatePercent,
      actualWeeklyRatePercent,
      avgCalories,
      avgProtein,
      avgSteps,
      weeklyCardioMinutes,
      stepAdherencePercent,
      cardioAdherencePercent,
      avgWeight,
      priorAvgWeight,
      recommendedCalorieDelta: readNumber(rawRecord.recommendedCalorieDelta) ?? undefined,
      recommendedCalorieTarget: readNumber(rawRecord.recommendedCalorieTarget) ?? undefined,
      recommendedMacroTargets:
        isRecord(rawRecord.recommendedMacroTargets) &&
        readNumber(rawRecord.recommendedMacroTargets.protein) !== null &&
        readNumber(rawRecord.recommendedMacroTargets.carbs) !== null &&
        readNumber(rawRecord.recommendedMacroTargets.fat) !== null
          ? {
              protein: readNumber(rawRecord.recommendedMacroTargets.protein) as number,
              carbs: readNumber(rawRecord.recommendedMacroTargets.carbs) as number,
              fat: readNumber(rawRecord.recommendedMacroTargets.fat) as number,
            }
          : undefined,
      recommendationReason,
      status,
      createdAt,
      appliedAt: readOptionalString(rawRecord.appliedAt),
    }),
  )
}

function parseCalibrationRecordStrict(
  rawRecord: unknown,
  index: number,
): ActionResult<CoachingCalibrationRecord> {
  if (!isRecord(rawRecord)) {
    return fail('invalidBackup', `Backup coaching calibration #${index + 1} is malformed.`)
  }

  const windowStart = isValidDateKey(rawRecord.windowStart) ? rawRecord.windowStart : null
  const windowEnd = isValidDateKey(rawRecord.windowEnd) ? rawRecord.windowEnd : null
  const predictedTdee = readNumber(rawRecord.predictedTdee)
  const allDayRecommendedCalories = readNumber(rawRecord.allDayRecommendedCalories)
  const confidenceScore = readNumber(rawRecord.confidenceScore)
  const eligibleDays = readNumber(rawRecord.eligibleDays)
  const fastingDays = readNumber(rawRecord.fastingDays)
  const partialDays = readNumber(rawRecord.partialDays)
  const createdAt = readString(rawRecord.createdAt) ?? new Date().toISOString()

  if (
    !windowStart ||
    !windowEnd ||
    predictedTdee === null ||
    allDayRecommendedCalories === null ||
    confidenceScore === null ||
    eligibleDays === null ||
    fastingDays === null ||
    partialDays === null
  ) {
    return fail('invalidBackup', `Backup coaching calibration #${index + 1} is incomplete.`)
  }

  return ok(
    normalizeCalibrationRecord({
      id: readString(rawRecord.id) ?? crypto.randomUUID(),
      windowStart,
      windowEnd,
      predictedTdee,
      allDayRecommendedCalories,
      eatingDayRecommendedCalories: readNumber(rawRecord.eatingDayRecommendedCalories) ?? undefined,
      goalMode:
        rawRecord.goalMode === 'lose' || rawRecord.goalMode === 'gain' || rawRecord.goalMode === 'maintain'
          ? rawRecord.goalMode
          : 'maintain',
      confidenceScore,
      eligibleDays,
      fastingDays,
      partialDays,
      hasInterventionConfounder: rawRecord.hasInterventionConfounder === true,
      validated: rawRecord.validated === true,
      observedTdee: readNumber(rawRecord.observedTdee) ?? undefined,
      tdeeError: readNumber(rawRecord.tdeeError) ?? undefined,
      within150: typeof rawRecord.within150 === 'boolean' ? rawRecord.within150 : undefined,
      within250: typeof rawRecord.within250 === 'boolean' ? rawRecord.within250 : undefined,
      createdAt,
      validatedAt: readOptionalString(rawRecord.validatedAt),
    }),
  )
}

function parseMealTemplateStrict(rawTemplate: unknown, index: number): ActionResult<MealTemplate> {
  if (!isRecord(rawTemplate)) {
    return fail('invalidBackup', `Backup template #${index + 1} is malformed.`)
  }

  const name = readString(rawTemplate.name)
  if (!name || !Array.isArray(rawTemplate.entries)) {
    return fail('invalidBackup', `Backup template #${index + 1} is incomplete.`)
  }

  const entries: MealTemplate['entries'] = []
  for (const [entryIndex, rawEntry] of rawTemplate.entries.entries()) {
    const parsedEntry = parseMealTemplateEntry(rawEntry, entryIndex)
    if (!parsedEntry) {
      return fail('invalidBackup', `Backup template #${index + 1} contains an invalid entry.`)
    }
    entries.push(parsedEntry)
  }

  return ok(
    normalizeMealTemplate({
      id: readString(rawTemplate.id) ?? crypto.randomUUID(),
      name,
      defaultMeal: VALID_MEALS.includes(rawTemplate.defaultMeal as MealType)
        ? (rawTemplate.defaultMeal as MealType)
        : undefined,
      entries,
      usageCount: readNumber(rawTemplate.usageCount) ?? 0,
      createdAt: readString(rawTemplate.createdAt) ?? new Date().toISOString(),
      updatedAt: readString(rawTemplate.updatedAt) ?? new Date().toISOString(),
      notes: readOptionalString(rawTemplate.notes),
      archivedAt: readOptionalString(rawTemplate.archivedAt),
      deletedAt: readOptionalString(rawTemplate.deletedAt),
    }),
  )
}

function parseBackupLogEntryStrict(
  rawEntry: unknown,
  date: string,
  index: number,
  foodIndex: Map<string, Food>,
): ActionResult<FoodLogEntry> {
  if (!isRecord(rawEntry)) {
    return fail('invalidBackup', `Backup log entry #${index + 1} for ${date} is malformed.`)
  }

  const entryDate = isValidDateKey(rawEntry.date) ? rawEntry.date : date
  const meal = VALID_MEALS.includes(rawEntry.meal as MealType) ? (rawEntry.meal as MealType) : null
  const servings = readNumber(rawEntry.servings) ?? 1
  const createdAt = readString(rawEntry.createdAt) ?? new Date(`${entryDate}T00:00:00.000Z`).toISOString()
  const id = readString(rawEntry.id) ?? crypto.randomUUID()
  const foodId = readString(rawEntry.foodId) ?? undefined

  if (!meal || servings <= 0) {
    return fail('invalidBackup', `Backup log entry #${index + 1} for ${date} is incomplete.`)
  }

  let snapshot = parseFoodSnapshot(rawEntry.snapshot)
  const needsReview = rawEntry.needsReview === true

  if (!snapshot && foodId) {
    const sourceFood = foodIndex.get(foodId)
    if (sourceFood) {
      snapshot = buildSnapshotFromFood(sourceFood)
    } else {
      return fail(
        'invalidBackup',
        `Backup log entry ${id} for ${date} references a missing food and has no embedded snapshot.`,
      )
    }
  }

  if (!snapshot) {
    return fail('invalidBackup', `Backup log entry ${id} for ${date} is missing its nutrition snapshot.`)
  }

  return ok({
    id,
    foodId,
    snapshot,
    date: entryDate,
    meal,
    servings,
    createdAt,
    updatedAt: readOptionalString(rawEntry.updatedAt),
    deletedAt: readOptionalString(rawEntry.deletedAt),
    needsReview,
  })
}

function parseFoods(rawFoods: unknown): Food[] {
  if (!Array.isArray(rawFoods)) {
    return sortFoodsByName(SEED_FOODS)
  }

  const parsedFoods = rawFoods.flatMap((rawFood, index) => {
    if (!isRecord(rawFood)) {
      recordIssue('foods', STORAGE_KEYS.foods, `Skipped malformed food record #${index + 1}.`)
      return []
    }

    const id = readString(rawFood.id) ?? crypto.randomUUID()
    const name = readString(rawFood.name)
    const servingSize = readNumber(rawFood.servingSize)
    const servingUnit = readString(rawFood.servingUnit)
    const calories = readNumber(rawFood.calories)
    const protein = readNumber(rawFood.protein)
    const carbs = readNumber(rawFood.carbs)
    const fat = readNumber(rawFood.fat)

    if (
      !name ||
      servingSize === null ||
      !servingUnit ||
      calories === null ||
      protein === null ||
      carbs === null ||
      fat === null
    ) {
      recordIssue('foods', STORAGE_KEYS.foods, `Skipped incomplete food record #${index + 1}.`)
      return []
    }

    return [
      normalizeFoodRecord({
        id,
        name,
        brand: readOptionalString(rawFood.brand),
        servingSize,
        servingUnit,
        calories,
        protein,
        carbs,
        fat,
        fiber: readNumber(rawFood.fiber) ?? undefined,
        source: rawFood.source === 'seed' || rawFood.source === 'api' ? rawFood.source : 'custom',
        provider: rawFood.provider === 'open_food_facts' ? 'open_food_facts' : undefined,
        importConfidence:
          rawFood.importConfidence === 'direct_match' ||
          rawFood.importConfidence === 'weak_match' ||
          rawFood.importConfidence === 'manual_review_required'
            ? rawFood.importConfidence
            : undefined,
        sourceQuality:
          rawFood.sourceQuality === 'high' ||
          rawFood.sourceQuality === 'medium' ||
          rawFood.sourceQuality === 'low'
            ? rawFood.sourceQuality
            : undefined,
        sourceQualityNote: readOptionalString(rawFood.sourceQualityNote),
        usageCount: readNumber(rawFood.usageCount) ?? 0,
        createdAt: readString(rawFood.createdAt) ?? new Date().toISOString(),
        updatedAt: readOptionalString(rawFood.updatedAt),
        barcode: readOptionalString(rawFood.barcode),
        archivedAt: readOptionalString(rawFood.archivedAt),
        lastUsedAt: readOptionalString(rawFood.lastUsedAt),
        lastServings: readNumber(rawFood.lastServings) ?? undefined,
      }),
    ]
  })

  return sortFoodsByName(parsedFoods.length ? parsedFoods : SEED_FOODS)
}

function parseWeights(rawWeights: unknown, fallbackUnit: WeightUnit): WeightEntry[] {
  if (!Array.isArray(rawWeights)) {
    return []
  }

  const parsedWeights = rawWeights.flatMap((rawWeight, index) => {
    if (!isRecord(rawWeight)) {
      recordIssue('weights', STORAGE_KEYS.weights, `Skipped malformed weight entry #${index + 1}.`)
      return []
    }

    const id = readString(rawWeight.id) ?? crypto.randomUUID()
    const date = isValidDateKey(rawWeight.date) ? rawWeight.date : null
    const weight = readNumber(rawWeight.weight)
    const createdAt = readString(rawWeight.createdAt) ?? new Date().toISOString()
    const updatedAt = readOptionalString(rawWeight.updatedAt)
    const deletedAt = readOptionalString(rawWeight.deletedAt)
    const legacyUnitMissing = rawWeight.unit !== 'lb' && rawWeight.unit !== 'kg'
    const unit = rawWeight.unit === 'kg' ? 'kg' : rawWeight.unit === 'lb' ? 'lb' : fallbackUnit

    if (!date || weight === null) {
      recordIssue('weights', STORAGE_KEYS.weights, `Skipped incomplete weight entry #${index + 1}.`)
      return []
    }

    if (legacyUnitMissing) {
      recordIssue(
        'migration',
        STORAGE_KEYS.weights,
        `Assigned ${unit.toUpperCase()} to legacy weight entry ${date}. Review historical units if they look wrong.`,
      )
    }

    return [
      normalizeWeightEntry({
        id,
        date,
        weight,
        unit,
        createdAt,
        updatedAt,
        deletedAt,
      }),
    ]
  })

  const dedupedWeights = dedupeWeightsByDate(parsedWeights)
  if (dedupedWeights.length !== parsedWeights.length) {
    recordIssue(
      'weights',
      STORAGE_KEYS.weights,
      'Multiple weight entries were found for the same day. The latest saved entry was kept.',
    )
  }

  return dedupedWeights
}

function parseDayMeta(rawDayMeta: unknown): DayMeta[] {
  if (!Array.isArray(rawDayMeta)) {
    return []
  }

  const byDate = new Map<string, DayMeta>()

  for (const [index, rawEntry] of rawDayMeta.entries()) {
    if (!isRecord(rawEntry)) {
      recordIssue('migration', STORAGE_KEYS.dayMeta, `Skipped malformed day-state entry #${index + 1}.`)
      continue
    }

    const date = isValidDateKey(rawEntry.date) ? rawEntry.date : null
    const status =
      rawEntry.status === 'complete' || rawEntry.status === 'partial' || rawEntry.status === 'fasting'
        ? rawEntry.status
        : rawEntry.status === 'unmarked'
          ? 'unmarked'
          : null
    const markers = Array.isArray(rawEntry.markers) ? normalizeDayMarkers(rawEntry.markers) : undefined
    const updatedAt = readString(rawEntry.updatedAt) ?? new Date().toISOString()

    if (!date || !status) {
      recordIssue('migration', STORAGE_KEYS.dayMeta, `Skipped incomplete day-state entry #${index + 1}.`)
      continue
    }

    const normalizedEntry = normalizeDayMeta({ date, status, markers, updatedAt })
    const existingEntry = byDate.get(date)
    if (!existingEntry || compareTimestamps(existingEntry.updatedAt, normalizedEntry.updatedAt) <= 0) {
      byDate.set(date, normalizedEntry)
    }
  }

  return sortDayMeta([...byDate.values()])
}

function parseActivityLog(rawActivityLog: unknown): ActivityEntry[] {
  if (!Array.isArray(rawActivityLog)) {
    return []
  }

  const byDate = new Map<string, ActivityEntry>()

  for (const [index, rawEntry] of rawActivityLog.entries()) {
    const parsedEntry = parseActivityEntryStrict(rawEntry, index)
    if (!parsedEntry.ok) {
      recordIssue('activity', STORAGE_KEYS.activityLog, parsedEntry.error.message)
      continue
    }

    const existingEntry = byDate.get(parsedEntry.data.date)
    if (!existingEntry || compareTimestamps(existingEntry.updatedAt, parsedEntry.data.updatedAt) <= 0) {
      byDate.set(parsedEntry.data.date, parsedEntry.data)
    }
  }

  return sortActivityLog([...byDate.values()])
}

function parseInterventions(rawInterventions: unknown): InterventionEntry[] {
  if (!Array.isArray(rawInterventions)) {
    return []
  }

  const parsedEntries = rawInterventions.flatMap((rawEntry, index) => {
    const parsedEntry = parseInterventionEntryStrict(rawEntry, index)
    if (!parsedEntry.ok) {
      recordIssue('migration', STORAGE_KEYS.interventions, parsedEntry.error.message)
      return []
    }

    return [parsedEntry.data]
  })

  return sortInterventions(parsedEntries)
}

function parseCheckInHistory(rawCheckInHistory: unknown): CheckInRecord[] {
  if (!Array.isArray(rawCheckInHistory)) {
    return []
  }

  const byId = new Map<string, CheckInRecord>()

  for (const [index, rawRecord] of rawCheckInHistory.entries()) {
    const parsedRecord = parseCheckInRecordStrict(rawRecord, index)
    if (!parsedRecord.ok) {
      recordIssue('checkins', STORAGE_KEYS.checkInHistory, parsedRecord.error.message)
      continue
    }

    const existingRecord = byId.get(parsedRecord.data.id)
    const existingTimestamp = existingRecord?.appliedAt ?? existingRecord?.createdAt
    const nextTimestamp = parsedRecord.data.appliedAt ?? parsedRecord.data.createdAt
    if (!existingRecord || compareTimestamps(existingTimestamp, nextTimestamp) <= 0) {
      byId.set(parsedRecord.data.id, parsedRecord.data)
    }
  }

  return sortCheckInHistory([...byId.values()])
}

function parseCoachingCalibration(rawCalibration: unknown): CoachingCalibrationRecord[] {
  if (!Array.isArray(rawCalibration)) {
    return []
  }

  const byId = new Map<string, CoachingCalibrationRecord>()

  for (const [index, rawEntry] of rawCalibration.entries()) {
    const parsedEntry = parseCalibrationRecordStrict(rawEntry, index)
    if (!parsedEntry.ok) {
      recordIssue('migration', STORAGE_KEYS.coachingCalibration, parsedEntry.error.message)
      continue
    }

    const existingEntry = byId.get(parsedEntry.data.id)
    if (!existingEntry || compareTimestamps(existingEntry.validatedAt ?? existingEntry.createdAt, parsedEntry.data.validatedAt ?? parsedEntry.data.createdAt) <= 0) {
      byId.set(parsedEntry.data.id, parsedEntry.data)
    }
  }

  return sortCalibrationRecords([...byId.values()])
}

function parseSettings(rawSettings: unknown): UserSettings {
  if (!isRecord(rawSettings)) {
    return DEFAULT_SETTINGS
  }

  const rawCheckInWeekday = rawSettings.checkInWeekday

  return normalizeSettings({
    calorieTarget: readNumber(rawSettings.calorieTarget) ?? undefined,
    proteinTarget: readNumber(rawSettings.proteinTarget) ?? undefined,
    carbTarget: readNumber(rawSettings.carbTarget) ?? undefined,
    fatTarget: readNumber(rawSettings.fatTarget) ?? undefined,
    weightUnit: rawSettings.weightUnit === 'kg' ? 'kg' : rawSettings.weightUnit === 'lb' ? 'lb' : undefined,
    goalMode:
      rawSettings.goalMode === 'lose' || rawSettings.goalMode === 'gain' || rawSettings.goalMode === 'maintain'
        ? rawSettings.goalMode
        : undefined,
    coachingEnabled: typeof rawSettings.coachingEnabled === 'boolean' ? rawSettings.coachingEnabled : undefined,
    checkInWeekday:
      typeof rawCheckInWeekday === 'number' &&
      Number.isInteger(rawCheckInWeekday) &&
      rawCheckInWeekday >= 0 &&
      rawCheckInWeekday <= 6
        ? (rawCheckInWeekday as UserSettings['checkInWeekday'])
        : undefined,
    targetWeeklyRatePercent: readNumber(rawSettings.targetWeeklyRatePercent) ?? undefined,
    dailyStepTarget: readNumber(rawSettings.dailyStepTarget) ?? undefined,
    weeklyCardioMinuteTarget: readNumber(rawSettings.weeklyCardioMinuteTarget) ?? undefined,
    tdeeEstimate: readNumber(rawSettings.tdeeEstimate) ?? undefined,
    lastImportAt: readOptionalString(rawSettings.lastImportAt),
    coachingDismissedAt: readOptionalString(rawSettings.coachingDismissedAt),
    askCoachEnabled: typeof rawSettings.askCoachEnabled === 'boolean' ? rawSettings.askCoachEnabled : undefined,
    shareInterventionsWithCoach:
      typeof rawSettings.shareInterventionsWithCoach === 'boolean'
        ? rawSettings.shareInterventionsWithCoach
        : undefined,
    coachCitationsExpanded:
      typeof rawSettings.coachCitationsExpanded === 'boolean'
        ? rawSettings.coachCitationsExpanded
        : undefined,
    coachConsentAt: readOptionalString(rawSettings.coachConsentAt),
  })
}

function parseUiPrefs(rawPrefs: unknown): UiPrefs {
  if (!isRecord(rawPrefs)) {
    return DEFAULT_UI_PREFS
  }

  return normalizeUiPrefs({
    keepOpenAfterAdd:
      typeof rawPrefs.keepOpenAfterAdd === 'boolean' ? rawPrefs.keepOpenAfterAdd : undefined,
    preferredAskCoachMode:
      rawPrefs.preferredAskCoachMode === 'deep' || rawPrefs.preferredAskCoachMode === 'standard'
        ? rawPrefs.preferredAskCoachMode
        : undefined,
    coachCitationsExpanded:
      typeof rawPrefs.coachCitationsExpanded === 'boolean'
        ? rawPrefs.coachCitationsExpanded
        : undefined,
    coachAutoSendQueuedWhenOnline:
      typeof rawPrefs.coachAutoSendQueuedWhenOnline === 'boolean'
        ? rawPrefs.coachAutoSendQueuedWhenOnline
        : undefined,
  })
}

function parseCoachThreadState(rawValue: unknown): CoachThreadState {
  return normalizeCoachThreadState(isRecord(rawValue) ? (rawValue as Partial<CoachThreadState>) : null)
}

function parseCoachFeedback(rawValue: unknown): CoachFeedback[] {
  return normalizeCoachFeedback(Array.isArray(rawValue) ? (rawValue as CoachFeedback[]) : null)
}

function parseCoachQueue(rawValue: unknown): CoachQueuedQuestion[] {
  return normalizeCoachQueue(Array.isArray(rawValue) ? (rawValue as CoachQueuedQuestion[]) : null)
}

function parseCoachProviderConfig(rawValue: unknown): CoachProviderConfig {
  return normalizeCoachProviderConfig(isRecord(rawValue) ? (rawValue as Partial<CoachProviderConfig>) : null)
}

function parseLogEntries(rawEntries: unknown, date: string, foodIndex: Map<string, Food>): FoodLogEntry[] {
  if (!Array.isArray(rawEntries)) {
    return []
  }

  return sortLogEntries(rawEntries.flatMap((rawEntry, index) => {
    if (!isRecord(rawEntry)) {
      recordIssue('logs', getLogStorageKey(date), `Skipped malformed log entry #${index + 1}.`)
      return []
    }

    const entryDate = isValidDateKey(rawEntry.date) ? rawEntry.date : date
    const meal = VALID_MEALS.includes(rawEntry.meal as MealType) ? (rawEntry.meal as MealType) : null
    const servings = readNumber(rawEntry.servings) ?? 1
    const createdAt = readString(rawEntry.createdAt) ?? new Date(`${entryDate}T00:00:00.000Z`).toISOString()
    const id = readString(rawEntry.id) ?? crypto.randomUUID()
    const foodId = readString(rawEntry.foodId) ?? undefined

    if (!meal || servings <= 0) {
      recordIssue('logs', getLogStorageKey(date), `Skipped incomplete log entry #${index + 1}.`)
      return []
    }

    const parsedSnapshot = parseFoodSnapshot(rawEntry.snapshot)
    let snapshot = parsedSnapshot
    let needsReview = rawEntry.needsReview === true

    if (!snapshot && foodId) {
      const sourceFood = foodIndex.get(foodId)
      if (sourceFood) {
        snapshot = buildSnapshotFromFood(sourceFood)
      } else {
        snapshot = buildLegacyMissingSnapshot()
        needsReview = true
        recordIssue(
          'migration',
          getLogStorageKey(date),
          `Recovered legacy entry ${id} with a placeholder snapshot because its source food no longer exists.`,
        )
      }
    }

    if (!snapshot) {
      recordIssue('logs', getLogStorageKey(date), `Skipped log entry ${id} because its nutrition snapshot was invalid.`)
      return []
    }

    return [
      normalizeFoodLogEntry({
        id,
        foodId,
        snapshot,
        date: entryDate,
        meal,
        servings,
        createdAt,
        updatedAt: readOptionalString(rawEntry.updatedAt),
        deletedAt: readOptionalString(rawEntry.deletedAt),
        needsReview,
      }),
    ]
  }))
}

function getAllLogKeys(): string[] {
  if (!canUseStorage()) {
    return []
  }

  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(LOG_KEY_PREFIX)) {
      keys.push(key)
    }
  }

  return keys.sort()
}

function cloneLogMap(logsByDate: Record<string, FoodLogEntry[]>): Record<string, FoodLogEntry[]> {
  return Object.fromEntries(
    Object.entries(logsByDate).map(([date, entries]) => [date, sortLogEntries(entries)]),
  )
}

function normalizeFoodIdentity(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function getFoodMergeKey(food: Food): string {
  return [
    normalizeFoodIdentity(food.name),
    normalizeFoodIdentity(food.brand),
    `${food.servingSize}`,
    normalizeFoodIdentity(food.servingUnit),
  ].join('|')
}

function compareTimestamps(left: string | undefined, right: string | undefined): number {
  const normalizedLeft = left ?? ''
  const normalizedRight = right ?? ''
  return normalizedLeft.localeCompare(normalizedRight)
}

function chooseNewerByCreatedAt<T extends { createdAt: string }>(localRecord: T, importedRecord: T): T {
  return localRecord.createdAt > importedRecord.createdAt ? localRecord : importedRecord
}

function chooseNewerByUpdatedAt<T extends { createdAt: string; updatedAt?: string }>(
  localRecord: T,
  importedRecord: T,
): T {
  const localTimestamp = localRecord.updatedAt ?? localRecord.createdAt
  const importedTimestamp = importedRecord.updatedAt ?? importedRecord.createdAt
  return localTimestamp > importedTimestamp ? localRecord : importedRecord
}

function normalizeFastingDayConflicts(
  dayMeta: DayMeta[],
  logsByDate: Record<string, FoodLogEntry[]>,
): DayMeta[] {
  return sortDayMeta(
    dayMeta.map((entry) =>
      entry.status === 'fasting' && (logsByDate[entry.date]?.length ?? 0) > 0
        ? {
            ...entry,
            status: 'partial',
          }
        : entry,
    ),
  )
}

function hasFastingDayConflict(
  dayMeta: DayMeta[],
  logsByDate: Record<string, FoodLogEntry[]>,
): boolean {
  return dayMeta.some(
    (entry) => entry.status === 'fasting' && (logsByDate[entry.date]?.length ?? 0) > 0,
  )
}

function buildNormalizedState(
  foods: Food[],
  settings: UserSettings,
  uiPrefs: UiPrefs,
  weights: WeightEntry[],
  mealTemplates: MealTemplate[],
  dayMeta: DayMeta[],
  activityLog: ActivityEntry[],
  interventions: InterventionEntry[],
  checkInHistory: CheckInRecord[],
  coachingCalibration: CoachingCalibrationRecord[],
  coachThread: CoachThreadState,
  coachFeedback: CoachFeedback[],
  coachQueue: CoachQueuedQuestion[],
  coachConfig: CoachProviderConfig,
  logsByDate: Record<string, FoodLogEntry[]>,
): NormalizedStorageState {
  const normalizedLogs = cloneLogMap(logsByDate)

  return {
    foods: sortFoodsByName(foods.map(normalizeFoodRecord)),
    settings: normalizeSettings(settings),
    uiPrefs: normalizeUiPrefs(uiPrefs),
    weights: dedupeWeightsByDate(weights),
    mealTemplates: sortTemplatesByUsage(mealTemplates.map(normalizeMealTemplate)),
    dayMeta: normalizeFastingDayConflicts(dayMeta.map(normalizeDayMeta), normalizedLogs),
    activityLog: sortActivityLog(activityLog.map(normalizeActivityEntry)),
    interventions: sortInterventions(interventions.map(normalizeInterventionEntry)),
    checkInHistory: sortCheckInHistory(checkInHistory.map(normalizeCheckInRecord)),
    coachingCalibration: sortCalibrationRecords(
      coachingCalibration.map(normalizeCalibrationRecord),
    ),
    coachThread: normalizeCoachThreadState(coachThread),
    coachFeedback: normalizeCoachFeedback(coachFeedback),
    coachQueue: normalizeCoachQueue(coachQueue),
    coachConfig: normalizeCoachProviderConfig(coachConfig),
    logsByDate: normalizedLogs,
  }
}

function buildBackupCounts(backup: BackupFile): BackupPreview['counts'] {
  const logDays = Object.keys(backup.logsByDate).length
  const logEntries = Object.values(backup.logsByDate).reduce((total, entries) => total + entries.length, 0)

  return {
    foods: backup.foods.length,
    weights: backup.weights.length,
    logDays,
    logEntries,
  }
}

function buildBackupFileFromState(state: NormalizedStorageState): BackupFile {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    uiPrefs: state.uiPrefs,
    foods: state.foods,
    weights: state.weights,
    logsByDate: state.logsByDate,
    mealTemplates: state.mealTemplates,
    dayMeta: state.dayMeta,
    activityLog: state.activityLog,
    interventions: state.interventions,
    checkInHistory: state.checkInHistory,
    coachingCalibration: state.coachingCalibration,
    coachThread: state.coachThread,
    coachFeedback: state.coachFeedback,
    coachQueue: state.coachQueue,
    coachConfig: state.coachConfig,
  }
}

function parseBackupObject(rawValue: unknown): ActionResult<BackupPreview> {
  if (!isRecord(rawValue)) {
    return fail('invalidBackup', 'The selected file is not a valid MacroTracker backup.')
  }

  const schemaVersion = readNumber(rawValue.schemaVersion)
  const exportedAt = readString(rawValue.exportedAt)
  if (schemaVersion === null || !exportedAt) {
    return fail('invalidBackup', 'The backup file is missing required metadata.')
  }

  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    return fail(
      'unsupportedBackup',
      `This backup was created by a newer MacroTracker version (${schemaVersion}). Update the app before restoring it.`,
    )
  }

  if (!isRecord(rawValue.settings)) {
    return fail('invalidBackup', 'The backup file is missing settings data.')
  }

  if (rawValue.uiPrefs !== undefined && !isRecord(rawValue.uiPrefs)) {
    return fail('invalidBackup', 'The backup file is missing a valid uiPrefs object.')
  }

  if (!Array.isArray(rawValue.foods)) {
    return fail('invalidBackup', 'The backup file is missing a valid foods array.')
  }

  if (!Array.isArray(rawValue.weights)) {
    return fail('invalidBackup', 'The backup file is missing a valid weights array.')
  }

  if (rawValue.mealTemplates !== undefined && !Array.isArray(rawValue.mealTemplates)) {
    return fail('invalidBackup', 'The backup file is missing a valid mealTemplates array.')
  }

  if (rawValue.dayMeta !== undefined && !Array.isArray(rawValue.dayMeta)) {
    return fail('invalidBackup', 'The backup file is missing a valid dayMeta array.')
  }

  if (rawValue.activityLog !== undefined && !Array.isArray(rawValue.activityLog)) {
    return fail('invalidBackup', 'The backup file is missing a valid activityLog array.')
  }

  if (rawValue.interventions !== undefined && !Array.isArray(rawValue.interventions)) {
    return fail('invalidBackup', 'The backup file is missing a valid interventions array.')
  }

  if (rawValue.checkInHistory !== undefined && !Array.isArray(rawValue.checkInHistory)) {
    return fail('invalidBackup', 'The backup file is missing a valid checkInHistory array.')
  }

  if (rawValue.coachingCalibration !== undefined && !Array.isArray(rawValue.coachingCalibration)) {
    return fail('invalidBackup', 'The backup file is missing a valid coachingCalibration array.')
  }

  if (rawValue.coachThread !== undefined && !isRecord(rawValue.coachThread)) {
    return fail('invalidBackup', 'The backup file is missing a valid coachThread object.')
  }

  if (rawValue.coachFeedback !== undefined && !Array.isArray(rawValue.coachFeedback)) {
    return fail('invalidBackup', 'The backup file is missing a valid coachFeedback array.')
  }

  if (rawValue.coachQueue !== undefined && !Array.isArray(rawValue.coachQueue)) {
    return fail('invalidBackup', 'The backup file is missing a valid coachQueue array.')
  }

  if (rawValue.coachConfig !== undefined && !isRecord(rawValue.coachConfig)) {
    return fail('invalidBackup', 'The backup file is missing a valid coachConfig object.')
  }

  if (!isRecord(rawValue.logsByDate)) {
    return fail('invalidBackup', 'The backup file is missing a valid logsByDate map.')
  }

  const foods: Food[] = []
  for (const [index, rawFood] of rawValue.foods.entries()) {
    const parsedFood = parseFoodRecordStrict(rawFood, index)
    if (!parsedFood.ok) {
      return parsedFood
    }
    foods.push(parsedFood.data)
  }

  const foodIndex = new Map(foods.map((food) => [food.id, food]))
  const weights: WeightEntry[] = []
  for (const [index, rawWeight] of rawValue.weights.entries()) {
    const parsedWeight = parseWeightEntryStrict(rawWeight, index)
    if (!parsedWeight.ok) {
      return parsedWeight
    }
    weights.push(parsedWeight.data)
  }

  const mealTemplates: MealTemplate[] = []
  for (const [index, rawTemplate] of (rawValue.mealTemplates ?? []).entries()) {
    const parsedTemplate = parseMealTemplateStrict(rawTemplate, index)
    if (!parsedTemplate.ok) {
      return parsedTemplate
    }
    mealTemplates.push(parsedTemplate.data)
  }

  const dayMeta: DayMeta[] = []
  for (const [index, rawEntry] of (rawValue.dayMeta ?? []).entries()) {
    const parsedEntry = parseDayMetaStrict(rawEntry, index)
    if (!parsedEntry.ok) {
      return parsedEntry
    }
    dayMeta.push(parsedEntry.data)
  }

  const activityLog: ActivityEntry[] = []
  for (const [index, rawEntry] of (rawValue.activityLog ?? []).entries()) {
    const parsedEntry = parseActivityEntryStrict(rawEntry, index)
    if (!parsedEntry.ok) {
      return parsedEntry
    }
    activityLog.push(parsedEntry.data)
  }

  const interventions: InterventionEntry[] = []
  for (const [index, rawEntry] of (rawValue.interventions ?? []).entries()) {
    const parsedEntry = parseInterventionEntryStrict(rawEntry, index)
    if (!parsedEntry.ok) {
      return parsedEntry
    }
    interventions.push(parsedEntry.data)
  }

  const checkInHistory: CheckInRecord[] = []
  for (const [index, rawRecord] of (rawValue.checkInHistory ?? []).entries()) {
    const parsedRecord = parseCheckInRecordStrict(rawRecord, index)
    if (!parsedRecord.ok) {
      return parsedRecord
    }
    checkInHistory.push(parsedRecord.data)
  }

  const coachingCalibration: CoachingCalibrationRecord[] = []
  for (const [index, rawRecord] of (rawValue.coachingCalibration ?? []).entries()) {
    const parsedRecord = parseCalibrationRecordStrict(rawRecord, index)
    if (!parsedRecord.ok) {
      return parsedRecord
    }
    coachingCalibration.push(parsedRecord.data)
  }

  const logsByDate: Record<string, FoodLogEntry[]> = {}
  for (const [date, rawEntries] of Object.entries(rawValue.logsByDate)) {
    if (!isValidDateKey(date)) {
      return fail('invalidBackup', `The backup contains an invalid log date key: ${date}.`)
    }

    if (!Array.isArray(rawEntries)) {
      return fail('invalidBackup', `The backup log for ${date} is malformed.`)
    }

    const entries: FoodLogEntry[] = []
    for (const [index, rawEntry] of rawEntries.entries()) {
      const parsedEntry = parseBackupLogEntryStrict(rawEntry, date, index, foodIndex)
      if (!parsedEntry.ok) {
        return parsedEntry
      }
      entries.push(parsedEntry.data)
    }

    logsByDate[date] = sortLogEntries(entries)
  }

  const backup = buildBackupFileFromState(
    buildNormalizedState(
      foods,
      parseSettings(rawValue.settings),
      parseUiPrefs(rawValue.uiPrefs),
      weights,
      mealTemplates,
      dayMeta,
      activityLog,
      interventions,
      checkInHistory,
      coachingCalibration,
      parseCoachThreadState(rawValue.coachThread),
      parseCoachFeedback(rawValue.coachFeedback),
      parseCoachQueue(rawValue.coachQueue),
      parseCoachProviderConfig(rawValue.coachConfig),
      logsByDate,
    ),
  )
  backup.schemaVersion = schemaVersion
  backup.exportedAt = exportedAt

  return ok({
    backup,
    counts: buildBackupCounts(backup),
  })
}

function restoreRawStorageSnapshot(snapshot: RawStorageSnapshot): ActionResult<void> {
  if (!canUseStorage()) {
    return fail('unavailable', 'Browser storage is not available in this environment.')
  }

  try {
    const snapshotLogKeys = new Set(Object.keys(snapshot.logsByKey))
    for (const key of getAllLogKeys()) {
      if (!snapshotLogKeys.has(key)) {
        window.localStorage.removeItem(key)
      }
    }

  restoreRawValue(STORAGE_KEYS.schemaVersion, snapshot.schemaVersion)
  restoreRawValue(STORAGE_KEYS.foods, snapshot.foods)
  restoreRawValue(STORAGE_KEYS.settings, snapshot.settings)
  restoreRawValue(STORAGE_KEYS.uiPrefs, snapshot.uiPrefs)
  restoreRawValue(STORAGE_KEYS.weights, snapshot.weights)
  restoreRawValue(STORAGE_KEYS.mealTemplates, snapshot.mealTemplates)
  restoreRawValue(STORAGE_KEYS.dayMeta, snapshot.dayMeta)
  restoreRawValue(STORAGE_KEYS.activityLog, snapshot.activityLog)
  restoreRawValue(STORAGE_KEYS.interventions, snapshot.interventions)
  restoreRawValue(STORAGE_KEYS.checkInHistory, snapshot.checkInHistory)
  restoreRawValue(STORAGE_KEYS.coachingCalibration, snapshot.coachingCalibration)
  restoreRawValue(STORAGE_KEYS.coachThread, snapshot.coachThread)
  restoreRawValue(STORAGE_KEYS.coachFeedback, snapshot.coachFeedback)
  restoreRawValue(STORAGE_KEYS.coachQueue, snapshot.coachQueue)
  restoreRawValue(STORAGE_KEYS.coachConfig, snapshot.coachConfig)

    for (const [key, rawValue] of Object.entries(snapshot.logsByKey)) {
      restoreRawValue(key, rawValue)
    }

    return ok(undefined)
  } catch (error) {
    return { ok: false, error: getStorageError(error) }
  }
}

export function captureStorageRollbackSnapshot(): RawStorageSnapshot {
  ensureStorageInitialized()
  return captureRawStorageSnapshot()
}

export function restoreStorageRollbackSnapshot(snapshot: RawStorageSnapshot): ActionResult<void> {
  const result = restoreRawStorageSnapshot(snapshot)
  if (!result.ok) {
    return result
  }

  storageCache.initialized = false
  void initializeStorage().finally(() => {
    emitStorageChange()
  })
  broadcastStorageChange()
  return ok(undefined)
}

function replacePersistedState(nextState: NormalizedStorageState): ActionResult<void> {
  if (!canUseStorage()) {
    return fail('unavailable', 'Browser storage is not available in this environment.')
  }

  const previousSnapshot = captureRawStorageSnapshot()
  const backupResult = persistRecoveryBackup(
    previousSnapshot,
    'A rollback backup was saved before import replaced local MacroTracker data.',
    false,
  )
  if (!backupResult.ok) {
    return backupResult
  }

  try {
    const nextLogKeys = new Set(Object.keys(nextState.logsByDate).map((date) => getLogStorageKey(date)))
    for (const key of getAllLogKeys()) {
      if (!nextLogKeys.has(key)) {
        window.localStorage.removeItem(key)
      }
    }

    const writeSteps: Array<ActionResult<void>> = [
      rawWriteJson(STORAGE_KEYS.foods, nextState.foods),
      rawWriteJson(STORAGE_KEYS.settings, nextState.settings),
      rawWriteJson(STORAGE_KEYS.uiPrefs, nextState.uiPrefs),
      rawWriteJson(STORAGE_KEYS.weights, nextState.weights),
      rawWriteJson(STORAGE_KEYS.schemaVersion, CURRENT_SCHEMA_VERSION),
      rawWriteJson(STORAGE_KEYS.mealTemplates, nextState.mealTemplates),
      rawWriteJson(STORAGE_KEYS.dayMeta, nextState.dayMeta),
      rawWriteJson(STORAGE_KEYS.activityLog, nextState.activityLog),
      rawWriteJson(STORAGE_KEYS.interventions, nextState.interventions),
      rawWriteJson(STORAGE_KEYS.checkInHistory, nextState.checkInHistory),
      rawWriteJson(STORAGE_KEYS.coachingCalibration, nextState.coachingCalibration),
      rawWriteJson(STORAGE_KEYS.coachThread, nextState.coachThread),
      rawWriteJson(STORAGE_KEYS.coachFeedback, nextState.coachFeedback),
      rawWriteJson(STORAGE_KEYS.coachQueue, nextState.coachQueue),
      rawWriteJson(STORAGE_KEYS.coachConfig, nextState.coachConfig),
      ...Object.entries(nextState.logsByDate).map(([date, entries]) =>
        rawWriteJson(getLogStorageKey(date), entries),
      ),
    ]

    const failedStep = writeSteps.find((result) => !result.ok)
    if (failedStep && !failedStep.ok) {
      const rollbackResult = restoreRawStorageSnapshot(previousSnapshot)
      if (!rollbackResult.ok) {
        recordIssue(
          'migration',
          STORAGE_KEYS.recoveryBackup,
          'Import rollback failed after a partial write. Use the saved recovery backup before continuing.',
        )
      }
      return failedStep
    }

    void writeIndexedDbCoreSnapshot({
      foods: nextState.foods,
      settings: nextState.settings,
      weights: nextState.weights,
      mealTemplates: nextState.mealTemplates,
      logsByDate: nextState.logsByDate,
    })
    applyNormalizedStateToCache(nextState)
    clearCoreProtectedKeys()
    void persistCoreDomainsToIndexedDb('replacePersistedState')
    emitStorageChange()
    broadcastStorageChange()
    return ok(undefined)
  } catch (error) {
    const rollbackResult = restoreRawStorageSnapshot(previousSnapshot)
    if (!rollbackResult.ok) {
      recordIssue(
        'migration',
        STORAGE_KEYS.recoveryBackup,
        'Import rollback failed after an unexpected write error. Use the saved recovery backup before continuing.',
      )
    }
    return { ok: false, error: getStorageError(error) }
  }
}

export function replaceSyncedPersistedState(nextState: {
  foods: Food[]
  settings: UserSettings
  weights: WeightEntry[]
  mealTemplates: MealTemplate[]
  dayMeta: DayMeta[]
  activityLog: ActivityEntry[]
  interventions: InterventionEntry[]
  logsByDate: Record<string, FoodLogEntry[]>
}): ActionResult<void> {
  ensureStorageInitialized()

  return replacePersistedState(
    buildNormalizedState(
      nextState.foods,
      nextState.settings,
      storageCache.uiPrefs,
      nextState.weights,
      nextState.mealTemplates,
      nextState.dayMeta,
      nextState.activityLog,
      nextState.interventions,
      storageCache.checkInHistory,
      storageCache.coachingCalibration,
      storageCache.coachThread,
      storageCache.coachFeedback,
      storageCache.coachQueue,
      storageCache.coachConfig,
      nextState.logsByDate,
    ),
  )
}

function mergeFoods(
  localFoods: Food[],
  importedFoods: Food[],
): { foods: Food[]; importedIdMap: Map<string, string> } {
  const mergedFoods = [...localFoods]
  const importedIdMap = new Map<string, string>()

  for (const importedFood of importedFoods) {
    const matchIndex = mergedFoods.findIndex((localFood) => {
      if (localFood.id === importedFood.id) {
        return true
      }

      if (localFood.barcode && importedFood.barcode && localFood.barcode === importedFood.barcode) {
        return true
      }

      return getFoodMergeKey(localFood) === getFoodMergeKey(importedFood)
    })

    if (matchIndex === -1) {
      mergedFoods.push(importedFood)
      importedIdMap.set(importedFood.id, importedFood.id)
      continue
    }

    const localFood = mergedFoods[matchIndex]
    const preferredFood = chooseNewerByUpdatedAt(localFood, importedFood)
    mergedFoods[matchIndex] = normalizeFoodRecord({
      ...preferredFood,
      id: localFood.id,
      usageCount: localFood.usageCount + importedFood.usageCount,
      archivedAt: localFood.archivedAt ?? importedFood.archivedAt,
      lastUsedAt:
        [localFood.lastUsedAt, importedFood.lastUsedAt].filter(Boolean).sort().at(-1) ?? undefined,
      lastServings: importedFood.lastServings ?? localFood.lastServings,
    })
    importedIdMap.set(importedFood.id, localFood.id)
  }

  return {
    foods: sortFoodsByName(mergedFoods),
    importedIdMap,
  }
}

function remapImportedEntries(
  entries: FoodLogEntry[],
  importedIdMap: Map<string, string>,
): FoodLogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    foodId: entry.foodId ? importedIdMap.get(entry.foodId) ?? entry.foodId : undefined,
  }))
}

function mergeWeights(localWeights: WeightEntry[], importedWeights: WeightEntry[]): WeightEntry[] {
  const weightsByDate = new Map(localWeights.map((entry) => [entry.date, entry]))

  for (const importedEntry of importedWeights) {
    const existingEntry = weightsByDate.get(importedEntry.date)
    if (!existingEntry) {
      weightsByDate.set(importedEntry.date, importedEntry)
      continue
    }

    weightsByDate.set(importedEntry.date, chooseNewerByCreatedAt(existingEntry, importedEntry))
  }

  return dedupeWeightsByDate([...weightsByDate.values()])
}

function mergeLogs(
  localLogsByDate: Record<string, FoodLogEntry[]>,
  importedLogsByDate: Record<string, FoodLogEntry[]>,
  importedIdMap: Map<string, string>,
): Record<string, FoodLogEntry[]> {
  const mergedLogsByDate = cloneLogMap(localLogsByDate)

  for (const [date, importedEntries] of Object.entries(importedLogsByDate)) {
    const entriesById = new Map(
      (mergedLogsByDate[date] ?? []).map((entry) => [entry.id, entry] as const),
    )

    for (const importedEntry of remapImportedEntries(importedEntries, importedIdMap)) {
      const existingEntry = entriesById.get(importedEntry.id)
      if (!existingEntry) {
        entriesById.set(importedEntry.id, importedEntry)
        continue
      }

      entriesById.set(importedEntry.id, chooseNewerByUpdatedAt(existingEntry, importedEntry))
    }

    mergedLogsByDate[date] = sortLogEntries([...entriesById.values()])
  }

  return mergedLogsByDate
}

function mergeDayMeta(localDayMeta: DayMeta[], importedDayMeta: DayMeta[]): DayMeta[] {
  const dayMetaByDate = new Map(localDayMeta.map((entry) => [entry.date, entry]))

  for (const importedEntry of importedDayMeta) {
    const existingEntry = dayMetaByDate.get(importedEntry.date)
    if (!existingEntry) {
      dayMetaByDate.set(importedEntry.date, importedEntry)
      continue
    }

    dayMetaByDate.set(
      importedEntry.date,
      compareTimestamps(existingEntry.updatedAt, importedEntry.updatedAt) > 0
        ? existingEntry
        : importedEntry,
    )
  }

  return sortDayMeta([...dayMetaByDate.values()])
}

function mergeActivityLog(localActivityLog: ActivityEntry[], importedActivityLog: ActivityEntry[]): ActivityEntry[] {
  const activityByDate = new Map(localActivityLog.map((entry) => [entry.date, entry]))

  for (const importedEntry of importedActivityLog) {
    const existingEntry = activityByDate.get(importedEntry.date)
    if (!existingEntry) {
      activityByDate.set(importedEntry.date, importedEntry)
      continue
    }

    activityByDate.set(
      importedEntry.date,
      compareTimestamps(existingEntry.updatedAt, importedEntry.updatedAt) > 0
        ? existingEntry
        : importedEntry,
    )
  }

  return sortActivityLog([...activityByDate.values()])
}

function mergeInterventions(
  localInterventions: InterventionEntry[],
  importedInterventions: InterventionEntry[],
): InterventionEntry[] {
  const interventionsById = new Map(localInterventions.map((entry) => [entry.id, entry]))

  for (const importedEntry of importedInterventions) {
    const existingEntry = interventionsById.get(importedEntry.id)
    if (!existingEntry) {
      interventionsById.set(importedEntry.id, importedEntry)
      continue
    }

    interventionsById.set(
      importedEntry.id,
      compareTimestamps(existingEntry.updatedAt, importedEntry.updatedAt) > 0 ? existingEntry : importedEntry,
    )
  }

  return sortInterventions([...interventionsById.values()])
}

function mergeCoachingCalibration(
  localRecords: CoachingCalibrationRecord[],
  importedRecords: CoachingCalibrationRecord[],
): CoachingCalibrationRecord[] {
  const calibrationById = new Map(localRecords.map((record) => [record.id, record]))

  for (const importedRecord of importedRecords) {
    const existingRecord = calibrationById.get(importedRecord.id)
    if (!existingRecord) {
      calibrationById.set(importedRecord.id, importedRecord)
      continue
    }

    const existingTimestamp = existingRecord.validatedAt ?? existingRecord.createdAt
    const importedTimestamp = importedRecord.validatedAt ?? importedRecord.createdAt
    calibrationById.set(
      importedRecord.id,
      compareTimestamps(existingTimestamp, importedTimestamp) > 0 ? existingRecord : importedRecord,
    )
  }

  return sortCalibrationRecords([...calibrationById.values()])
}

function mergeCheckInHistory(
  localHistory: CheckInRecord[],
  importedHistory: CheckInRecord[],
): CheckInRecord[] {
  const historyById = new Map(localHistory.map((record) => [record.id, record]))

  for (const importedRecord of importedHistory) {
    const existingRecord = historyById.get(importedRecord.id)
    if (!existingRecord) {
      historyById.set(importedRecord.id, importedRecord)
      continue
    }

    const existingTimestamp = existingRecord.appliedAt ?? existingRecord.createdAt
    const importedTimestamp = importedRecord.appliedAt ?? importedRecord.createdAt
    historyById.set(
      importedRecord.id,
      compareTimestamps(existingTimestamp, importedTimestamp) > 0 ? existingRecord : importedRecord,
    )
  }

  return sortCheckInHistory([...historyById.values()])
}

function mergeMealTemplates(
  localTemplates: MealTemplate[],
  importedTemplates: MealTemplate[],
  importedIdMap: Map<string, string>,
): MealTemplate[] {
  const mergedTemplates = [...localTemplates]

  for (const importedTemplate of importedTemplates) {
    const remappedTemplate = normalizeMealTemplate({
      ...importedTemplate,
      entries: importedTemplate.entries.map((entry) => ({
        ...entry,
        foodId: entry.foodId ? importedIdMap.get(entry.foodId) ?? entry.foodId : undefined,
      })),
    })

    const matchIndex = mergedTemplates.findIndex(
      (localTemplate) =>
        localTemplate.id === remappedTemplate.id ||
        normalizeFoodIdentity(localTemplate.name) === normalizeFoodIdentity(remappedTemplate.name),
    )

    if (matchIndex === -1) {
      mergedTemplates.push(remappedTemplate)
      continue
    }

    const localTemplate = mergedTemplates[matchIndex]
    const preferredTemplate =
      localTemplate.updatedAt > remappedTemplate.updatedAt ? localTemplate : remappedTemplate

    mergedTemplates[matchIndex] = normalizeMealTemplate({
      ...preferredTemplate,
      id: localTemplate.id,
      usageCount: localTemplate.usageCount + remappedTemplate.usageCount,
    })
  }

  return sortTemplatesByUsage(mergedTemplates)
}

function persistBootstrapState(): void {
  if (storageCache.protectedKeys.size > 0) {
    recordIssue(
      'migration',
      STORAGE_KEYS.schemaVersion,
      'Automatic migration was paused because some stored data is unreadable. Review recovery issues before saving new data.',
    )
    return
  }

  const writeResults = [
    directWriteJson(STORAGE_KEYS.foods, storageCache.foods),
    directWriteJson(STORAGE_KEYS.settings, storageCache.settings),
    directWriteJson(STORAGE_KEYS.uiPrefs, storageCache.uiPrefs),
    directWriteJson(STORAGE_KEYS.weights, storageCache.weights),
    directWriteJson(STORAGE_KEYS.mealTemplates, storageCache.mealTemplates),
    directWriteJson(STORAGE_KEYS.dayMeta, storageCache.dayMeta),
    directWriteJson(STORAGE_KEYS.activityLog, storageCache.activityLog),
    directWriteJson(STORAGE_KEYS.interventions, storageCache.interventions),
    directWriteJson(STORAGE_KEYS.checkInHistory, storageCache.checkInHistory),
    directWriteJson(STORAGE_KEYS.coachingCalibration, storageCache.coachingCalibration),
    directWriteJson(STORAGE_KEYS.coachThread, storageCache.coachThread),
    directWriteJson(STORAGE_KEYS.coachFeedback, storageCache.coachFeedback),
    directWriteJson(STORAGE_KEYS.coachQueue, storageCache.coachQueue),
    directWriteJson(STORAGE_KEYS.coachConfig, storageCache.coachConfig),
    directWriteJson(STORAGE_KEYS.schemaVersion, CURRENT_SCHEMA_VERSION),
    ...Object.entries(storageCache.logsByDate).map(([date, entries]) =>
      directWriteJson(getLogStorageKey(date), entries),
    ),
  ]

  const failedWrite = writeResults.find((result) => !result.ok)
  if (failedWrite && !failedWrite.ok) {
    storageCache.initializationError = failedWrite.error
    recordIssue('migration', STORAGE_KEYS.schemaVersion, failedWrite.error.message)
    void recordDiagnosticsEvent({
      eventType: 'storage_migration_failed',
      severity: 'error',
      scope: 'storage',
      message: failedWrite.error.message,
      recordKey: STORAGE_KEYS.schemaVersion,
      payload: {},
    })
    return
  }

  void persistCoreDomainsToIndexedDb('persistBootstrapState')
}

export async function initializeStorage(): Promise<void> {
  if (storageCache.initialized || !canUseStorage()) {
    return
  }

  if (storageInitializationPromise) {
    return storageInitializationPromise
  }

  storageInitializationPromise = (async () => {
    bindStorageSync()
    storageCache.recoveryIssues = []
    storageCache.initializationError = null
    storageCache.protectedKeys = new Set()
    const rawSnapshot = captureRawStorageSnapshot()

  const rawSettings = safeParse<unknown>(rawSnapshot.settings)
  if (rawSettings.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.settings)
    recordIssue(
      'settings',
      STORAGE_KEYS.settings,
      'Settings data was unreadable. Defaults were loaded for this session and settings saves are blocked until the data is repaired.',
    )
  }
  storageCache.settings = parseSettings(rawSettings.value)

  const rawUiPrefs = safeParse<unknown>(rawSnapshot.uiPrefs)
  if (rawUiPrefs.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.uiPrefs)
    recordIssue(
      'settings',
      STORAGE_KEYS.uiPrefs,
      'Interface preferences were unreadable. Defaults were loaded for this session and preference saves are blocked until the data is repaired.',
    )
  }
  storageCache.uiPrefs = parseUiPrefs(rawUiPrefs.value)

  const rawFoods = safeParse<unknown>(rawSnapshot.foods)
  if (rawFoods.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.foods)
    recordIssue(
      'foods',
      STORAGE_KEYS.foods,
      'Food data was unreadable. Seed foods were restored for this session and food saves are blocked until the data is repaired.',
    )
  }
  storageCache.foods = parseFoods(rawFoods.value)

  const foodIndex = new Map(storageCache.foods.map((food) => [food.id, food]))
  const rawWeights = safeParse<unknown>(rawSnapshot.weights)
  if (rawWeights.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.weights)
    recordIssue(
      'weights',
      STORAGE_KEYS.weights,
      'Weight history was unreadable. The visible chart may be incomplete and weight saves are blocked until the data is repaired.',
    )
  }
  storageCache.weights = parseWeights(rawWeights.value, storageCache.settings.weightUnit)

  const rawMealTemplates = safeParse<unknown>(rawSnapshot.mealTemplates)
  if (rawMealTemplates.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.mealTemplates)
    recordIssue(
      'migration',
      STORAGE_KEYS.mealTemplates,
      'Meal templates were unreadable. Template saves are blocked until the stored data is repaired.',
    )
  }
  storageCache.mealTemplates = parseMealTemplates(rawMealTemplates.value)

  const rawDayMeta = safeParse<unknown>(rawSnapshot.dayMeta)
  if (rawDayMeta.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.dayMeta)
    recordIssue(
      'migration',
      STORAGE_KEYS.dayMeta,
      'Day-state data was unreadable. Day-status saves are blocked until the stored data is repaired.',
    )
  }

  const rawActivityLog = safeParse<unknown>(rawSnapshot.activityLog)
  if (rawActivityLog.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.activityLog)
    recordIssue(
      'activity',
      STORAGE_KEYS.activityLog,
      'Activity history was unreadable. Activity saves are blocked until the stored data is repaired.',
    )
  }

  const rawInterventions = safeParse<unknown>(rawSnapshot.interventions)
  if (rawInterventions.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.interventions)
    recordIssue(
      'migration',
      STORAGE_KEYS.interventions,
      'Intervention history was unreadable. Intervention saves are blocked until the stored data is repaired.',
    )
  }

  const rawCheckInHistory = safeParse<unknown>(rawSnapshot.checkInHistory)
  if (rawCheckInHistory.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.checkInHistory)
    recordIssue(
      'checkins',
      STORAGE_KEYS.checkInHistory,
      'Weekly check-in history was unreadable. Prep-history saves are blocked until the stored data is repaired.',
    )
  }

  const rawCoachingCalibration = safeParse<unknown>(rawSnapshot.coachingCalibration)
  if (rawCoachingCalibration.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.coachingCalibration)
    recordIssue(
      'migration',
      STORAGE_KEYS.coachingCalibration,
      'Calibration history was unreadable. Coaching confidence will use live data only until the stored data is repaired.',
    )
  }

  const rawCoachThread = safeParse<unknown>(rawSnapshot.coachThread)
  if (rawCoachThread.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.coachThread)
    recordIssue(
      'migration',
      STORAGE_KEYS.coachThread,
      'Coach thread data was unreadable. Cached coach messages were reset for this session and coach history saves are blocked until the data is repaired.',
    )
  }

  const rawCoachFeedback = safeParse<unknown>(rawSnapshot.coachFeedback)
  if (rawCoachFeedback.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.coachFeedback)
    recordIssue(
      'migration',
      STORAGE_KEYS.coachFeedback,
      'Coach feedback data was unreadable. Feedback saves are blocked until the stored data is repaired.',
    )
  }

  const rawCoachQueue = safeParse<unknown>(rawSnapshot.coachQueue)
  if (rawCoachQueue.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.coachQueue)
    recordIssue(
      'migration',
      STORAGE_KEYS.coachQueue,
      'Queued coach questions were unreadable. The offline coach queue was reset for this session and queue saves are blocked until the data is repaired.',
    )
  }

  const rawCoachConfig = safeParse<unknown>(rawSnapshot.coachConfig)
  if (rawCoachConfig.status === 'invalid') {
    storageCache.protectedKeys.add(STORAGE_KEYS.coachConfig)
    recordIssue(
      'migration',
      STORAGE_KEYS.coachConfig,
      'Coach provider settings were unreadable. Ask Coach provider settings were reset to not configured for this session.',
    )
  }

  const logsByDate: Record<string, FoodLogEntry[]> = {}
  for (const key of getAllLogKeys()) {
    const date = key.replace(LOG_KEY_PREFIX, '')
    if (!isValidDateKey(date)) {
      recordIssue('logs', key, 'Skipped an invalid log storage key.')
      continue
    }

    const rawLogEntries = safeParse<unknown>(rawSnapshot.logsByKey[key] ?? null)
    if (rawLogEntries.status === 'invalid') {
      storageCache.protectedKeys.add(key)
      recordIssue(
        'logs',
        key,
        `Log data for ${date} was unreadable. This day was left out of the active view and further saves to it are blocked until the data is repaired.`,
      )
    }

    logsByDate[date] = parseLogEntries(rawLogEntries.value, date, foodIndex)
  }

  const parsedDayMeta = parseDayMeta(rawDayMeta.value)
  const normalizedDayMeta = normalizeFastingDayConflicts(parsedDayMeta, logsByDate)
  if (normalizedDayMeta.some((entry, index) => entry.status !== parsedDayMeta[index]?.status)) {
    recordIssue(
      'migration',
      STORAGE_KEYS.dayMeta,
      'Some fasting days contained intake history and were normalized to partial for safety.',
    )
  }

    storageCache.logsByDate = logsByDate
    storageCache.dayMeta = normalizedDayMeta
    storageCache.activityLog = parseActivityLog(rawActivityLog.value)
    storageCache.interventions = parseInterventions(rawInterventions.value)
    storageCache.checkInHistory = parseCheckInHistory(rawCheckInHistory.value)
    storageCache.coachingCalibration = parseCoachingCalibration(rawCoachingCalibration.value)
    storageCache.coachThread = parseCoachThreadState(rawCoachThread.value)
    storageCache.coachFeedback = parseCoachFeedback(rawCoachFeedback.value)
    storageCache.coachQueue = parseCoachQueue(rawCoachQueue.value)
    storageCache.coachConfig = parseCoachProviderConfig(rawCoachConfig.value)

    const hasPersistedData =
      rawSnapshot.schemaVersion !== null ||
      rawSnapshot.foods !== null ||
      rawSnapshot.settings !== null ||
      rawSnapshot.uiPrefs !== null ||
      rawSnapshot.weights !== null ||
      rawSnapshot.mealTemplates !== null ||
      rawSnapshot.dayMeta !== null ||
      rawSnapshot.activityLog !== null ||
      rawSnapshot.interventions !== null ||
      rawSnapshot.checkInHistory !== null ||
      rawSnapshot.coachingCalibration !== null ||
      rawSnapshot.coachThread !== null ||
      rawSnapshot.coachFeedback !== null ||
      rawSnapshot.coachQueue !== null ||
      rawSnapshot.coachConfig !== null ||
      Object.keys(rawSnapshot.logsByKey).length > 0
    const storedSchemaVersion = Number.parseInt(
      window.localStorage.getItem(STORAGE_KEYS.schemaVersion) ?? '0',
      10,
    )
    const shouldBackupRawSnapshot =
      hasPersistedData &&
      (storedSchemaVersion !== CURRENT_SCHEMA_VERSION ||
        rawSettings.status === 'invalid' ||
        rawUiPrefs.status === 'invalid' ||
        rawFoods.status === 'invalid' ||
        rawWeights.status === 'invalid' ||
        rawMealTemplates.status === 'invalid' ||
        rawDayMeta.status === 'invalid' ||
        rawActivityLog.status === 'invalid' ||
        rawInterventions.status === 'invalid' ||
        rawCheckInHistory.status === 'invalid' ||
        rawCoachingCalibration.status === 'invalid' ||
        rawCoachThread.status === 'invalid' ||
        rawCoachFeedback.status === 'invalid' ||
        rawCoachQueue.status === 'invalid' ||
        rawCoachConfig.status === 'invalid' ||
        Object.keys(rawSnapshot.logsByKey).some(
          (key) => safeParse<unknown>(rawSnapshot.logsByKey[key]).status === 'invalid',
        ))

    const preserveIndexedDbRecoveryKeys = new Set<string>()
    if (rawFoods.status === 'invalid') {
      preserveIndexedDbRecoveryKeys.add(STORAGE_KEYS.foods)
    }
    if (rawSettings.status === 'invalid') {
      preserveIndexedDbRecoveryKeys.add(STORAGE_KEYS.settings)
    }
    if (rawWeights.status === 'invalid') {
      preserveIndexedDbRecoveryKeys.add(STORAGE_KEYS.weights)
    }
    if (rawMealTemplates.status === 'invalid') {
      preserveIndexedDbRecoveryKeys.add(STORAGE_KEYS.mealTemplates)
    }
    for (const [key, rawValue] of Object.entries(rawSnapshot.logsByKey)) {
      if (safeParse<unknown>(rawValue).status === 'invalid') {
        preserveIndexedDbRecoveryKeys.add(key)
      }
    }

    if (shouldBackupRawSnapshot) {
      persistRecoveryBackup(rawSnapshot)
    }

    try {
      const migrationState = await readIndexedDbMigrationState()
      const idbSnapshot = await readIndexedDbCoreSnapshot()
      const hasMigratedCoreDomains =
        migrationState !== null &&
        INDEXED_DB_CORE_DOMAINS.every((domain) => migrationState.migratedDomains.includes(domain))

      if (hasMigratedCoreDomains && idbSnapshot?.settings) {
        syncCoreDomainsFromIndexedDb({
          foods: idbSnapshot.foods,
          settings: idbSnapshot.settings,
          weights: idbSnapshot.weights,
          mealTemplates: idbSnapshot.mealTemplates,
          logsByDate: idbSnapshot.logsByDate,
        }, {
          preserveRecoveryKeys: preserveIndexedDbRecoveryKeys,
        })
      } else {
        if (hasPersistedData) {
          persistRecoveryBackup(
            rawSnapshot,
            'PreIndexedDbCutover backup saved before the IndexedDB storage bootstrap.',
            false,
          )
        }

        await writeIndexedDbCoreSnapshot(buildCoreIndexedDbSnapshot())
        await writeIndexedDbMigrationState({
          migratedDomains: [...INDEXED_DB_CORE_DOMAINS],
          completedAt: new Date().toISOString(),
        })
      }
    } catch (error) {
      await recordDiagnosticsEvent({
        eventType: 'storage_migration_failed',
        severity: 'error',
        scope: 'storage',
        message: error instanceof Error ? error.message : 'IndexedDB bootstrap failed.',
        payload: {
          phase: 'bootstrap',
        },
      })
    }

    storageCache.initialized = true

    if (storedSchemaVersion !== CURRENT_SCHEMA_VERSION) {
      persistBootstrapState()
    }
  })()

  try {
    await storageInitializationPromise
  } finally {
    storageInitializationPromise = null
  }
}

export function subscribeToStorage(listener: StorageListener): () => void {
  ensureStorageInitialized()
  bindStorageSync()
  storageListeners.add(listener)

  return () => {
    storageListeners.delete(listener)
  }
}

export function isStorageInitialized(): boolean {
  return storageCache.initialized
}

function ensureStorageInitialized(): void {
  if (!storageCache.initialized) {
    throw new Error('Storage has not finished initializing.')
  }
}

export function getLogStorageKey(date: string): string {
  return `${LOG_KEY_PREFIX}${date}`
}

export function getRecoveryIssues(): RecoverableDataIssue[] {
  ensureStorageInitialized()
  return [...storageCache.recoveryIssues]
}

export function getInitializationError(): AppActionError | null {
  ensureStorageInitialized()
  return storageCache.initializationError
}

export function buildEntrySnapshot(food: Food): FoodSnapshot {
  return buildSnapshotFromFood(food)
}

export function loadFoods(): Food[] {
  ensureStorageInitialized()
  return storageCache.foods
}

export function saveFoods(foods: Food[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousFoods = storageCache.foods
  const nextFoods = sortFoodsByName(foods.map(normalizeFoodRecord))
  const result = directWriteJson(STORAGE_KEYS.foods, nextFoods)
  if (!result.ok) {
    return result
  }

  storageCache.foods = nextFoods
  queueFoodSyncMutations(previousFoods, nextFoods)
  void persistCoreDomainsToIndexedDb('saveFoods')
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadSettings(): UserSettings {
  ensureStorageInitialized()
  return storageCache.settings
}

export function saveSettings(settings: UserSettings): ActionResult<void> {
  ensureStorageInitialized()

  const previousSettings = storageCache.settings
  const nextSettings = normalizeSettings(settings)
  const result = directWriteJson(STORAGE_KEYS.settings, nextSettings)
  if (!result.ok) {
    return result
  }

  storageCache.settings = nextSettings
  queueSettingsSyncMutations(previousSettings, nextSettings)
  void persistCoreDomainsToIndexedDb('saveSettings')
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadUiPrefs(): UiPrefs {
  ensureStorageInitialized()
  return storageCache.uiPrefs
}

export function saveUiPrefs(prefs: UiPrefs): ActionResult<void> {
  ensureStorageInitialized()

  const nextPrefs = normalizeUiPrefs(prefs)
  const result = directWriteJson(STORAGE_KEYS.uiPrefs, nextPrefs)
  if (!result.ok) {
    return result
  }

  storageCache.uiPrefs = nextPrefs
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadWeights(): WeightEntry[] {
  ensureStorageInitialized()
  return storageCache.weights
}

export function loadStoredWeights(): WeightEntry[] {
  ensureStorageInitialized()
  return storageCache.weights
}

export function saveWeights(weights: WeightEntry[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousWeights = storageCache.weights
  const nextWeights = dedupeWeightsByDate(weights.map(normalizeWeightEntry))
  const result = directWriteJson(STORAGE_KEYS.weights, nextWeights)
  if (!result.ok) {
    return result
  }

  storageCache.weights = nextWeights
  queueWeightSyncMutations(previousWeights, nextWeights)
  void persistCoreDomainsToIndexedDb('saveWeights')
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadMealTemplates(): MealTemplate[] {
  ensureStorageInitialized()
  return storageCache.mealTemplates
}

export function loadStoredMealTemplates(): MealTemplate[] {
  ensureStorageInitialized()
  return storageCache.mealTemplates
}

export function saveMealTemplates(templates: MealTemplate[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousTemplates = storageCache.mealTemplates
  const nextTemplates = sortTemplatesByUsage(templates.map(normalizeMealTemplate))
  const result = directWriteJson(STORAGE_KEYS.mealTemplates, nextTemplates)
  if (!result.ok) {
    return result
  }

  storageCache.mealTemplates = nextTemplates
  queueMealTemplateSyncMutations(previousTemplates, nextTemplates)
  void persistCoreDomainsToIndexedDb('saveMealTemplates')
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadDayMeta(): DayMeta[] {
  ensureStorageInitialized()
  return storageCache.dayMeta
}

export function loadStoredDayMeta(): DayMeta[] {
  ensureStorageInitialized()
  return storageCache.dayMeta
}

export function saveDayMeta(dayMeta: DayMeta[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousDayMeta = storageCache.dayMeta
  const nextDayMeta = sortDayMeta(dayMeta.map(normalizeDayMeta))
  const result = directWriteJson(STORAGE_KEYS.dayMeta, nextDayMeta)
  if (!result.ok) {
    return result
  }

  storageCache.dayMeta = nextDayMeta
  queueDayMetaSyncMutations(previousDayMeta, nextDayMeta)
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadActivityLog(): ActivityEntry[] {
  ensureStorageInitialized()
  return storageCache.activityLog
}

export function loadStoredActivityLog(): ActivityEntry[] {
  ensureStorageInitialized()
  return storageCache.activityLog
}

export function saveActivityLog(activityLog: ActivityEntry[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousActivityLog = storageCache.activityLog
  const nextActivityLog = sortActivityLog(activityLog.map(normalizeActivityEntry))
  const result = directWriteJson(STORAGE_KEYS.activityLog, nextActivityLog)
  if (!result.ok) {
    return result
  }

  storageCache.activityLog = nextActivityLog
  queueActivitySyncMutations(previousActivityLog, nextActivityLog)
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadInterventions(): InterventionEntry[] {
  ensureStorageInitialized()
  return storageCache.interventions
}

export function loadStoredInterventions(): InterventionEntry[] {
  ensureStorageInitialized()
  return storageCache.interventions
}

export function saveInterventions(entries: InterventionEntry[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousEntries = storageCache.interventions
  const nextEntries = sortInterventions(entries.map(normalizeInterventionEntry))
  const result = directWriteJson(STORAGE_KEYS.interventions, nextEntries)
  if (!result.ok) {
    return result
  }

  storageCache.interventions = nextEntries
  queueInterventionSyncMutations(previousEntries, nextEntries)
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadCheckInHistory(): CheckInRecord[] {
  ensureStorageInitialized()
  return storageCache.checkInHistory
}

export function saveCheckInHistory(records: CheckInRecord[]): ActionResult<void> {
  ensureStorageInitialized()

  const nextRecords = sortCheckInHistory(records.map(normalizeCheckInRecord))
  const result = directWriteJson(STORAGE_KEYS.checkInHistory, nextRecords)
  if (!result.ok) {
    return result
  }

  storageCache.checkInHistory = nextRecords
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadCoachingCalibration(): CoachingCalibrationRecord[] {
  ensureStorageInitialized()
  return storageCache.coachingCalibration
}

export function saveCoachingCalibration(records: CoachingCalibrationRecord[]): ActionResult<void> {
  ensureStorageInitialized()

  const nextRecords = sortCalibrationRecords(records.map(normalizeCalibrationRecord))
  const result = directWriteJson(STORAGE_KEYS.coachingCalibration, nextRecords)
  if (!result.ok) {
    return result
  }

  storageCache.coachingCalibration = nextRecords
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadCoachThread(): CoachThreadState {
  ensureStorageInitialized()
  return storageCache.coachThread
}

export function saveCoachThread(thread: CoachThreadState): ActionResult<void> {
  ensureStorageInitialized()

  const nextThread = normalizeCoachThreadState(thread)
  const result = directWriteJson(STORAGE_KEYS.coachThread, nextThread)
  if (!result.ok) {
    return result
  }

  storageCache.coachThread = nextThread
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadCoachFeedback(): CoachFeedback[] {
  ensureStorageInitialized()
  return storageCache.coachFeedback
}

export function saveCoachFeedback(feedback: CoachFeedback[]): ActionResult<void> {
  ensureStorageInitialized()

  const nextFeedback = normalizeCoachFeedback(feedback)
  const result = directWriteJson(STORAGE_KEYS.coachFeedback, nextFeedback)
  if (!result.ok) {
    return result
  }

  storageCache.coachFeedback = nextFeedback
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadCoachQueue(): CoachQueuedQuestion[] {
  ensureStorageInitialized()
  return storageCache.coachQueue
}

export function saveCoachQueue(queue: CoachQueuedQuestion[]): ActionResult<void> {
  ensureStorageInitialized()

  const nextQueue = normalizeCoachQueue(queue)
  const result = directWriteJson(STORAGE_KEYS.coachQueue, nextQueue)
  if (!result.ok) {
    return result
  }

  storageCache.coachQueue = nextQueue
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadCoachConfig(): CoachProviderConfig {
  ensureStorageInitialized()
  return storageCache.coachConfig
}

export function saveCoachConfig(config: CoachProviderConfig): ActionResult<void> {
  ensureStorageInitialized()

  const nextConfig = normalizeCoachProviderConfig(config)
  const result = directWriteJson(STORAGE_KEYS.coachConfig, nextConfig)
  if (!result.ok) {
    return result
  }

  storageCache.coachConfig = nextConfig
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function loadFoodLog(date: string): FoodLogEntry[] {
  ensureStorageInitialized()
  return storageCache.logsByDate[date] ?? EMPTY_LOG_ENTRIES
}

export function loadStoredFoodLog(date: string): FoodLogEntry[] {
  ensureStorageInitialized()
  return storageCache.logsByDate[date] ?? EMPTY_LOG_ENTRIES
}

export function loadAllFoodLogs(): Record<string, FoodLogEntry[]> {
  ensureStorageInitialized()
  return storageCache.logsByDate
}

export function loadStoredAllFoodLogs(): Record<string, FoodLogEntry[]> {
  ensureStorageInitialized()
  return storageCache.logsByDate
}

export function exportBackupFile(): ActionResult<BackupFile> {
  ensureStorageInitialized()

  if (storageCache.protectedKeys.size > 0) {
    return fail(
      'recoveryRequired',
      'Some stored data is unreadable. Export is blocked because the backup would be incomplete until recovery issues are resolved.',
    )
  }

  return ok(
    buildBackupFileFromState(
      buildNormalizedState(
        storageCache.foods,
        storageCache.settings,
        storageCache.uiPrefs,
        storageCache.weights,
        storageCache.mealTemplates,
        storageCache.dayMeta,
        storageCache.activityLog,
        storageCache.interventions,
        storageCache.checkInHistory,
        storageCache.coachingCalibration,
        storageCache.coachThread,
        storageCache.coachFeedback,
        storageCache.coachQueue,
        storageCache.coachConfig,
        storageCache.logsByDate,
      ),
    ),
  )
}

export function validateBackupText(rawText: string): ActionResult<BackupPreview> {
  if (!rawText.trim()) {
    return fail('invalidBackup', 'The selected file is empty.')
  }

  try {
    return parseBackupObject(JSON.parse(rawText) as unknown)
  } catch {
    return fail('invalidBackup', 'The selected file is not valid JSON.')
  }
}

export function applyBackupImport(backup: BackupFile, mode: ImportMode): ActionResult<BackupPreview['counts']> {
  ensureStorageInitialized()

  const importedFastingConflict = hasFastingDayConflict(backup.dayMeta ?? [], backup.logsByDate)

  const importedState = buildNormalizedState(
    backup.foods,
    backup.settings,
    backup.uiPrefs ?? DEFAULT_UI_PREFS,
    backup.weights,
    backup.mealTemplates ?? [],
    backup.dayMeta ?? [],
    backup.activityLog ?? [],
    backup.interventions ?? [],
    backup.checkInHistory ?? [],
    backup.coachingCalibration ?? [],
    backup.coachThread ?? { messages: [], updatedAt: new Date(0).toISOString() },
    backup.coachFeedback ?? [],
    backup.coachQueue ?? [],
    backup.coachConfig ?? DEFAULT_COACH_CONFIG,
    backup.logsByDate,
  )

  const nextState =
    mode === 'replace'
      ? buildNormalizedState(
          importedState.foods,
          {
            ...importedState.settings,
            lastImportAt: new Date().toISOString(),
          },
          importedState.uiPrefs,
          importedState.weights,
          importedState.mealTemplates,
          importedState.dayMeta,
          importedState.activityLog,
          importedState.interventions,
          importedState.checkInHistory,
          importedState.coachingCalibration,
          importedState.coachThread,
          importedState.coachFeedback,
          importedState.coachQueue,
          importedState.coachConfig,
          importedState.logsByDate,
        )
      : (() => {
          const localState = buildNormalizedState(
            storageCache.foods,
            storageCache.settings,
            storageCache.uiPrefs,
            storageCache.weights,
            storageCache.mealTemplates,
            storageCache.dayMeta,
            storageCache.activityLog,
            storageCache.interventions,
            storageCache.checkInHistory,
            storageCache.coachingCalibration,
            storageCache.coachThread,
            storageCache.coachFeedback,
            storageCache.coachQueue,
            storageCache.coachConfig,
            storageCache.logsByDate,
          )
          const mergedFoods = mergeFoods(localState.foods, importedState.foods)

          return buildNormalizedState(
            mergedFoods.foods,
            {
              ...localState.settings,
              lastImportAt: new Date().toISOString(),
            },
            localState.uiPrefs,
            mergeWeights(localState.weights, importedState.weights),
            mergeMealTemplates(localState.mealTemplates, importedState.mealTemplates, mergedFoods.importedIdMap),
            mergeDayMeta(localState.dayMeta, importedState.dayMeta),
            mergeActivityLog(localState.activityLog, importedState.activityLog),
            mergeInterventions(localState.interventions, importedState.interventions),
            mergeCheckInHistory(localState.checkInHistory, importedState.checkInHistory),
            mergeCoachingCalibration(localState.coachingCalibration, importedState.coachingCalibration),
            importedState.coachThread.messages.length ? importedState.coachThread : localState.coachThread,
            [
              ...localState.coachFeedback,
              ...importedState.coachFeedback.filter(
                (feedback) =>
                  !localState.coachFeedback.some(
                    (existing) =>
                      existing.messageId === feedback.messageId &&
                      existing.createdAt === feedback.createdAt,
                  ),
              ),
            ],
            [
              ...localState.coachQueue,
              ...importedState.coachQueue.filter(
                (queued) => !localState.coachQueue.some((existing) => existing.id === queued.id),
              ),
            ],
            localState.coachConfig.provider !== 'none' ? localState.coachConfig : importedState.coachConfig,
            mergeLogs(localState.logsByDate, importedState.logsByDate, mergedFoods.importedIdMap),
          )
        })()

  const replaceResult = replacePersistedState(nextState)
  if (!replaceResult.ok) {
    return replaceResult
  }

  if (importedFastingConflict) {
    recordIssue(
      'migration',
      STORAGE_KEYS.dayMeta,
      'Some fasting days contained intake history and were normalized to partial for safety.',
    )
  }

  return ok(buildBackupCounts(buildBackupFileFromState(nextState)))
}

export function saveFoodLogWithUsage(
  date: string,
  entries: FoodLogEntry[],
  foodId: string,
  servings: number,
): ActionResult<void> {
  return saveFoodLogWithUsages(date, entries, [{ foodId, servings }])
}

export function saveFoodLogWithUsages(
  date: string,
  entries: FoodLogEntry[],
  usageUpdates: Array<{ foodId: string; servings: number }>,
): ActionResult<void> {
  ensureStorageInitialized()

  const nextEntries = sortLogEntries(entries.map(normalizeFoodLogEntry))
  const previousEntries = storageCache.logsByDate[date] ?? []
  const previousFoods = storageCache.foods
  const usageByFoodId = new Map<string, { count: number; lastServings: number }>()
  for (const update of usageUpdates) {
    const existingUsage = usageByFoodId.get(update.foodId)
    usageByFoodId.set(update.foodId, {
      count: (existingUsage?.count ?? 0) + 1,
      lastServings: update.servings,
    })
  }
  const usageTimestamp = new Date().toISOString()
  const nextFoods = sortFoodsByName(
    storageCache.foods.map((food) =>
      usageByFoodId.has(food.id)
        ? {
            ...food,
            usageCount: food.usageCount + (usageByFoodId.get(food.id)?.count ?? 0),
            lastUsedAt: usageTimestamp,
            lastServings: usageByFoodId.get(food.id)?.lastServings ?? food.lastServings,
            updatedAt: usageTimestamp,
          }
        : food,
    ),
  )

  if ([...usageByFoodId.keys()].some((foodId) => !nextFoods.some((food) => food.id === foodId))) {
    return fail('foodMissing', 'One of the selected foods is no longer available. Refresh the food list and try again.')
  }

  const logSaveResult = directWriteJson(getLogStorageKey(date), nextEntries)
  if (!logSaveResult.ok) {
    return logSaveResult
  }

  const foodsSaveResult = directWriteJson(STORAGE_KEYS.foods, nextFoods)
  if (!foodsSaveResult.ok) {
    const rollbackResult = directWriteJson(getLogStorageKey(date), previousEntries)
    if (!rollbackResult.ok) {
      recordIssue(
        'migration',
        getLogStorageKey(date),
        'A save rollback failed after a partial write. Review your latest meal entry before continuing.',
      )
    }

    return foodsSaveResult
  }

  storageCache.logsByDate = {
    ...storageCache.logsByDate,
    [date]: nextEntries,
  }
  storageCache.foods = nextFoods
  queueFoodLogSyncMutations(previousEntries, nextEntries)
  queueFoodSyncMutations(previousFoods, nextFoods)
  void persistCoreDomainsToIndexedDb('saveFoodLogWithUsages')
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function saveFoodLog(date: string, entries: FoodLogEntry[]): ActionResult<void> {
  ensureStorageInitialized()

  const previousEntries = storageCache.logsByDate[date] ?? []
  const nextEntries = sortLogEntries(entries.map(normalizeFoodLogEntry))
  const result = directWriteJson(getLogStorageKey(date), nextEntries)
  if (!result.ok) {
    return result
  }

  storageCache.logsByDate = {
    ...storageCache.logsByDate,
    [date]: nextEntries,
  }
  queueFoodLogSyncMutations(previousEntries, nextEntries)
  void persistCoreDomainsToIndexedDb('saveFoodLog')
  emitStorageChange()
  broadcastStorageChange()
  return ok(undefined)
}

export function getFoodReferenceCount(foodId: string): number {
  ensureStorageInitialized()

  return Object.values(storageCache.logsByDate).reduce(
    (total, entries) => total + entries.filter((entry) => entry.foodId === foodId).length,
    0,
  )
}

export function validateFoodPurge(foodId: string): ActionResult<number> {
  ensureStorageInitialized()

  for (const key of getAllLogKeys()) {
    const rawEntries = safeParse<unknown>(window.localStorage.getItem(key))
    if (rawEntries.status === 'invalid') {
      return fail(
        'logDataIssue',
        'This food cannot be permanently deleted until unreadable log history is repaired or exported.',
      )
    }
  }

  return ok(getFoodReferenceCount(foodId))
}
