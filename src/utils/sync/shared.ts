import type {
  ActivityEntry,
  CheckInRecord,
  CoachingDecisionRecord,
  DayMeta,
  DietPhase,
  DietPhaseEvent,
  FavoriteFood,
  Food,
  FoodLogEntry,
  InterventionEntry,
  RecoveryCheckIn,
  Recipe,
  SavedMeal,
  SyncCounts,
  SyncRecordEnvelope,
  SyncScope,
  UserSettings,
  WellnessEntry,
  WeightEntry,
} from '../../types'

export interface SyncSettingsTargetsPayload {
  updatedAt: string
  calorieTarget: number
  proteinTarget: number
  carbTarget: number
  fatTarget: number
  goalMode: UserSettings['goalMode']
  fatLossMode: NonNullable<UserSettings['fatLossMode']>
  targetWeeklyRatePercent: number
}

export interface SyncSettingsPreferencesPayload {
  updatedAt: string
  weightUnit: UserSettings['weightUnit']
  checkInWeekday: UserSettings['checkInWeekday']
  coachingEnabled: boolean
  askCoachEnabled?: boolean
  shareInterventionsWithCoach?: boolean
  coachConsentAt?: string
  dailyStepTarget?: number
  weeklyCardioMinuteTarget?: number
  coachingMinCalories?: number
}

export interface SyncSettingsCoachingRuntimePayload {
  updatedAt: string
  tdeeEstimate?: number
  coachingDismissedAt?: string
  goalModeChangedAt?: string
  goalModeChangedFrom?: UserSettings['goalMode']
  fatLossModeChangedAt?: string
}

export interface SyncedLocalDataset {
  foods: Food[]
  foodLogEntries: FoodLogEntry[]
  weights: WeightEntry[]
  dayMeta: DayMeta[]
  activity: ActivityEntry[]
  wellness: WellnessEntry[]
  recoveryCheckIns: RecoveryCheckIn[]
  dietPhases: DietPhase[]
  dietPhaseEvents: DietPhaseEvent[]
  interventions: InterventionEntry[]
  mealTemplates: SavedMeal[]
  recipes: Recipe[]
  favoriteFoods: FavoriteFood[]
  weeklyCheckIns: CheckInRecord[]
  coachDecisions: CoachingDecisionRecord[]
  settingsTargets: SyncSettingsTargetsPayload
  settingsPreferences: SyncSettingsPreferencesPayload
  settingsCoachingRuntime: SyncSettingsCoachingRuntimePayload
}

export interface SyncRecordDraft {
  scope: SyncScope
  recordId: string
  payload: Record<string, unknown>
  deletedAt?: string
}

const SYNC_APPLY_ORDER: SyncScope[] = [
  'foods',
  'favorite_foods',
  'meal_templates',
  'recipes',
  'weekly_check_ins',
  'coach_decisions',
  'food_log_entries',
  'weights',
  'day_meta',
  'activity',
  'wellness',
  'recovery_check_ins',
  'diet_phases',
  'diet_phase_events',
  'interventions',
  'settings_targets',
  'settings_preferences',
  'settings_coaching_runtime',
]

function getSyncApplyPriority(scope: SyncScope): number {
  const index = SYNC_APPLY_ORDER.indexOf(scope)
  return index === -1 ? SYNC_APPLY_ORDER.length : index
}

export function sortSyncRecordsForApply<T extends { scope: SyncScope; serverVersion?: number }>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const priorityDelta = getSyncApplyPriority(left.scope) - getSyncApplyPriority(right.scope)
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    return (left.serverVersion ?? 0) - (right.serverVersion ?? 0)
  })
}

function isoCompare(left: string | undefined, right: string | undefined): number {
  return (left ?? '').localeCompare(right ?? '')
}

function getRecordTimestamp(record: { createdAt?: string; updatedAt?: string; deletedAt?: string }): string {
  return record.deletedAt ?? record.updatedAt ?? record.createdAt ?? new Date(0).toISOString()
}

function getSettingsTimestamp(record: { updatedAt?: string }): string {
  return record.updatedAt ?? new Date(0).toISOString()
}

function mergeByKey<T>(
  localItems: T[],
  remoteItems: T[],
  getKey: (item: T) => string,
  getTimestamp: (item: T) => string,
): T[] {
  const merged = new Map(localItems.map((item) => [getKey(item), item]))
  for (const remoteItem of remoteItems) {
    const key = getKey(remoteItem)
    const existingItem = merged.get(key)
    if (!existingItem || isoCompare(getTimestamp(existingItem), getTimestamp(remoteItem)) <= 0) {
      merged.set(key, remoteItem)
    }
  }

  return [...merged.values()]
}

function ensureSettingsTargetsPayload(
  settings: UserSettings,
  updatedAt: string,
): SyncSettingsTargetsPayload {
  return {
    updatedAt,
    calorieTarget: settings.calorieTarget,
    proteinTarget: settings.proteinTarget,
    carbTarget: settings.carbTarget,
    fatTarget: settings.fatTarget,
    goalMode: settings.goalMode,
    fatLossMode: settings.fatLossMode ?? 'standard_cut',
    targetWeeklyRatePercent: settings.targetWeeklyRatePercent,
  }
}

function ensureSettingsPreferencesPayload(
  settings: UserSettings,
  updatedAt: string,
): SyncSettingsPreferencesPayload {
  return {
    updatedAt,
    weightUnit: settings.weightUnit,
    checkInWeekday: settings.checkInWeekday,
    coachingEnabled: settings.coachingEnabled,
    askCoachEnabled: settings.askCoachEnabled,
    shareInterventionsWithCoach: settings.shareInterventionsWithCoach,
    coachConsentAt: settings.coachConsentAt,
    dailyStepTarget: settings.dailyStepTarget,
    weeklyCardioMinuteTarget: settings.weeklyCardioMinuteTarget,
    coachingMinCalories: settings.coachingMinCalories,
  }
}

function ensureSettingsCoachingRuntimePayload(
  settings: UserSettings,
  updatedAt: string,
): SyncSettingsCoachingRuntimePayload {
  return {
    updatedAt,
    tdeeEstimate: settings.tdeeEstimate,
    coachingDismissedAt: settings.coachingDismissedAt,
    goalModeChangedAt: settings.goalModeChangedAt,
    goalModeChangedFrom: settings.goalModeChangedFrom,
    fatLossModeChangedAt: settings.fatLossModeChangedAt,
  }
}

export function partitionSettingsForSync(
  settings: UserSettings,
  timestamps?: {
    settingsTargets?: string
    settingsPreferences?: string
    settingsCoachingRuntime?: string
  },
): Pick<SyncedLocalDataset, 'settingsTargets' | 'settingsPreferences' | 'settingsCoachingRuntime'> {
  return {
    settingsTargets: ensureSettingsTargetsPayload(
      settings,
      timestamps?.settingsTargets ?? new Date(0).toISOString(),
    ),
    settingsPreferences: ensureSettingsPreferencesPayload(
      settings,
      timestamps?.settingsPreferences ?? new Date(0).toISOString(),
    ),
    settingsCoachingRuntime: ensureSettingsCoachingRuntimePayload(
      settings,
      timestamps?.settingsCoachingRuntime ?? new Date(0).toISOString(),
    ),
  }
}

export function mergeSyncSettingsIntoLocal(
  currentSettings: UserSettings,
  dataset: Pick<
    SyncedLocalDataset,
    'settingsTargets' | 'settingsPreferences' | 'settingsCoachingRuntime'
  >,
): UserSettings {
  return {
    ...currentSettings,
    calorieTarget: dataset.settingsTargets.calorieTarget,
    proteinTarget: dataset.settingsTargets.proteinTarget,
    carbTarget: dataset.settingsTargets.carbTarget,
    fatTarget: dataset.settingsTargets.fatTarget,
    goalMode: dataset.settingsTargets.goalMode,
    fatLossMode: dataset.settingsTargets.fatLossMode,
    targetWeeklyRatePercent: dataset.settingsTargets.targetWeeklyRatePercent,
    weightUnit: dataset.settingsPreferences.weightUnit,
    checkInWeekday: dataset.settingsPreferences.checkInWeekday,
    coachingEnabled: dataset.settingsPreferences.coachingEnabled,
    askCoachEnabled: dataset.settingsPreferences.askCoachEnabled,
    shareInterventionsWithCoach: dataset.settingsPreferences.shareInterventionsWithCoach,
    coachConsentAt: dataset.settingsPreferences.coachConsentAt,
    dailyStepTarget: dataset.settingsPreferences.dailyStepTarget,
    weeklyCardioMinuteTarget: dataset.settingsPreferences.weeklyCardioMinuteTarget,
    coachingMinCalories: dataset.settingsPreferences.coachingMinCalories,
    tdeeEstimate: dataset.settingsCoachingRuntime.tdeeEstimate,
    coachingDismissedAt: dataset.settingsCoachingRuntime.coachingDismissedAt,
    goalModeChangedAt: dataset.settingsCoachingRuntime.goalModeChangedAt,
    goalModeChangedFrom: dataset.settingsCoachingRuntime.goalModeChangedFrom,
    fatLossModeChangedAt: dataset.settingsCoachingRuntime.fatLossModeChangedAt,
  }
}

export function buildSyncCountsFromDataset(dataset: SyncedLocalDataset): SyncCounts {
  return {
    foods: dataset.foods.length,
    logDays: new Set(dataset.foodLogEntries.map((entry) => entry.date)).size,
    logEntries: dataset.foodLogEntries.length,
    weights: dataset.weights.length,
    dayMeta: dataset.dayMeta.length,
    activity: dataset.activity.length,
    wellness: dataset.wellness.length,
    recoveryCheckIns: dataset.recoveryCheckIns.length,
    dietPhases: dataset.dietPhases.length,
    dietPhaseEvents: dataset.dietPhaseEvents.length,
    interventions: dataset.interventions.length,
    savedMeals: dataset.mealTemplates.length,
    recipes: dataset.recipes.length,
    favoriteFoods: dataset.favoriteFoods.length,
  }
}

export function buildEmptySyncCounts(): SyncCounts {
  return {
    foods: 0,
    logDays: 0,
    logEntries: 0,
    weights: 0,
    dayMeta: 0,
    activity: 0,
    wellness: 0,
    recoveryCheckIns: 0,
    dietPhases: 0,
    dietPhaseEvents: 0,
    interventions: 0,
    savedMeals: 0,
    recipes: 0,
    favoriteFoods: 0,
  }
}

export function buildLogsByDate(entries: FoodLogEntry[]): Record<string, FoodLogEntry[]> {
  return entries.reduce<Record<string, FoodLogEntry[]>>((logsByDate, entry) => {
    if (!logsByDate[entry.date]) {
      logsByDate[entry.date] = []
    }
    logsByDate[entry.date].push(entry)
    return logsByDate
  }, {})
}

export function flattenLogsByDate(logsByDate: Record<string, FoodLogEntry[]>): FoodLogEntry[] {
  return Object.values(logsByDate).flatMap((entries) => entries)
}

export function datasetToSyncRecordDrafts(dataset: SyncedLocalDataset): SyncRecordDraft[] {
  return [
    ...dataset.foods.map((food) => ({
      scope: 'foods' as const,
      recordId: food.id,
      payload: food as unknown as Record<string, unknown>,
      deletedAt: food.archivedAt,
    })),
    ...dataset.foodLogEntries.map((entry) => ({
      scope: 'food_log_entries' as const,
      recordId: entry.id,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.weights.map((entry) => ({
      scope: 'weights' as const,
      recordId: entry.date,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.dayMeta.map((entry) => ({
      scope: 'day_meta' as const,
      recordId: entry.date,
      payload: entry as unknown as Record<string, unknown>,
    })),
    ...dataset.activity.map((entry) => ({
      scope: 'activity' as const,
      recordId: entry.date,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.wellness.map((entry) => ({
      scope: 'wellness' as const,
      recordId: `${entry.provider}:${entry.date}`,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.recoveryCheckIns.map((entry) => ({
      scope: 'recovery_check_ins' as const,
      recordId: entry.date,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.dietPhases.map((entry) => ({
      scope: 'diet_phases' as const,
      recordId: entry.id,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.status === 'cancelled' ? entry.updatedAt : undefined,
    })),
    ...dataset.dietPhaseEvents.map((entry) => ({
      scope: 'diet_phase_events' as const,
      recordId: entry.id,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.interventions.map((entry) => ({
      scope: 'interventions' as const,
      recordId: entry.id,
      payload: entry as unknown as Record<string, unknown>,
      deletedAt: entry.deletedAt,
    })),
    ...dataset.mealTemplates.map((template) => ({
      scope: 'meal_templates' as const,
      recordId: template.id,
      payload: template as unknown as Record<string, unknown>,
      deletedAt: template.deletedAt,
    })),
    ...dataset.recipes.map((recipe) => ({
      scope: 'recipes' as const,
      recordId: recipe.id,
      payload: recipe as unknown as Record<string, unknown>,
      deletedAt: recipe.deletedAt,
    })),
    ...dataset.favoriteFoods.map((favorite) => ({
      scope: 'favorite_foods' as const,
      recordId: favorite.foodId,
      payload: favorite as unknown as Record<string, unknown>,
      deletedAt: favorite.deletedAt,
    })),
    ...dataset.weeklyCheckIns.map((checkIn) => ({
      scope: 'weekly_check_ins' as const,
      recordId: checkIn.id,
      payload: checkIn as unknown as Record<string, unknown>,
    })),
    ...dataset.coachDecisions.map((decision) => ({
      scope: 'coach_decisions' as const,
      recordId: decision.id,
      payload: decision as unknown as Record<string, unknown>,
    })),
    {
      scope: 'settings_targets',
      recordId: 'default',
      payload: dataset.settingsTargets as unknown as Record<string, unknown>,
    },
    {
      scope: 'settings_preferences',
      recordId: 'default',
      payload: dataset.settingsPreferences as unknown as Record<string, unknown>,
    },
    {
      scope: 'settings_coaching_runtime',
      recordId: 'default',
      payload: dataset.settingsCoachingRuntime as unknown as Record<string, unknown>,
    },
  ]
}

function normalizeSettingsTargetsPayload(
  payload: Record<string, unknown>,
  fallback: SyncSettingsTargetsPayload,
): SyncSettingsTargetsPayload {
  return {
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt : fallback.updatedAt,
    calorieTarget:
      typeof payload.calorieTarget === 'number' && Number.isFinite(payload.calorieTarget)
        ? payload.calorieTarget
        : fallback.calorieTarget,
    proteinTarget:
      typeof payload.proteinTarget === 'number' && Number.isFinite(payload.proteinTarget)
        ? payload.proteinTarget
        : fallback.proteinTarget,
    carbTarget:
      typeof payload.carbTarget === 'number' && Number.isFinite(payload.carbTarget)
        ? payload.carbTarget
        : fallback.carbTarget,
    fatTarget:
      typeof payload.fatTarget === 'number' && Number.isFinite(payload.fatTarget)
        ? payload.fatTarget
        : fallback.fatTarget,
    goalMode:
      payload.goalMode === 'lose' || payload.goalMode === 'gain' || payload.goalMode === 'maintain'
        ? payload.goalMode
        : fallback.goalMode,
    fatLossMode:
      payload.fatLossMode === 'psmf' || payload.fatLossMode === 'standard_cut'
        ? payload.fatLossMode
        : fallback.fatLossMode,
    targetWeeklyRatePercent:
      typeof payload.targetWeeklyRatePercent === 'number' &&
      Number.isFinite(payload.targetWeeklyRatePercent)
        ? payload.targetWeeklyRatePercent
        : fallback.targetWeeklyRatePercent,
  }
}

function normalizeSettingsPreferencesPayload(
  payload: Record<string, unknown>,
  fallback: SyncSettingsPreferencesPayload,
): SyncSettingsPreferencesPayload {
  return {
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt : fallback.updatedAt,
    weightUnit: payload.weightUnit === 'kg' ? 'kg' : payload.weightUnit === 'lb' ? 'lb' : fallback.weightUnit,
    checkInWeekday:
      typeof payload.checkInWeekday === 'number' &&
      Number.isInteger(payload.checkInWeekday) &&
      payload.checkInWeekday >= 0 &&
      payload.checkInWeekday <= 6
        ? (payload.checkInWeekday as UserSettings['checkInWeekday'])
        : fallback.checkInWeekday,
    coachingEnabled:
      typeof payload.coachingEnabled === 'boolean' ? payload.coachingEnabled : fallback.coachingEnabled,
    askCoachEnabled:
      typeof payload.askCoachEnabled === 'boolean' ? payload.askCoachEnabled : fallback.askCoachEnabled,
    shareInterventionsWithCoach:
      typeof payload.shareInterventionsWithCoach === 'boolean'
        ? payload.shareInterventionsWithCoach
        : fallback.shareInterventionsWithCoach,
    coachConsentAt:
      typeof payload.coachConsentAt === 'string' && payload.coachConsentAt.trim()
        ? payload.coachConsentAt
        : fallback.coachConsentAt,
    dailyStepTarget:
      typeof payload.dailyStepTarget === 'number' && Number.isFinite(payload.dailyStepTarget)
        ? payload.dailyStepTarget
        : fallback.dailyStepTarget,
    weeklyCardioMinuteTarget:
      typeof payload.weeklyCardioMinuteTarget === 'number' &&
      Number.isFinite(payload.weeklyCardioMinuteTarget)
        ? payload.weeklyCardioMinuteTarget
        : fallback.weeklyCardioMinuteTarget,
    coachingMinCalories:
      typeof payload.coachingMinCalories === 'number' && Number.isFinite(payload.coachingMinCalories)
        ? payload.coachingMinCalories
        : fallback.coachingMinCalories,
  }
}

function normalizeSettingsCoachingRuntimePayload(
  payload: Record<string, unknown>,
  fallback: SyncSettingsCoachingRuntimePayload,
): SyncSettingsCoachingRuntimePayload {
  return {
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt : fallback.updatedAt,
    tdeeEstimate:
      typeof payload.tdeeEstimate === 'number' && Number.isFinite(payload.tdeeEstimate)
        ? payload.tdeeEstimate
        : fallback.tdeeEstimate,
    coachingDismissedAt:
      typeof payload.coachingDismissedAt === 'string' && payload.coachingDismissedAt.trim()
        ? payload.coachingDismissedAt
        : fallback.coachingDismissedAt,
    goalModeChangedAt:
      typeof payload.goalModeChangedAt === 'string' && payload.goalModeChangedAt.trim()
        ? payload.goalModeChangedAt
        : fallback.goalModeChangedAt,
    goalModeChangedFrom:
      payload.goalModeChangedFrom === 'lose' ||
      payload.goalModeChangedFrom === 'maintain' ||
      payload.goalModeChangedFrom === 'gain'
        ? payload.goalModeChangedFrom
        : fallback.goalModeChangedFrom,
    fatLossModeChangedAt:
      typeof payload.fatLossModeChangedAt === 'string' && payload.fatLossModeChangedAt.trim()
        ? payload.fatLossModeChangedAt
        : fallback.fatLossModeChangedAt,
  }
}

export function recordsToDataset(
  records: SyncRecordEnvelope[],
  fallbackSettings: UserSettings,
  fallbackTimestamps?: {
    settingsTargets?: string
    settingsPreferences?: string
    settingsCoachingRuntime?: string
  },
): SyncedLocalDataset {
  const fallbackPartitions = partitionSettingsForSync(fallbackSettings, fallbackTimestamps)
  const dataset: SyncedLocalDataset = {
    foods: [],
    foodLogEntries: [],
    weights: [],
    dayMeta: [],
    activity: [],
    wellness: [],
    recoveryCheckIns: [],
    dietPhases: [],
    dietPhaseEvents: [],
    interventions: [],
    mealTemplates: [],
    recipes: [],
    favoriteFoods: [],
    weeklyCheckIns: [],
    coachDecisions: [],
    settingsTargets: fallbackPartitions.settingsTargets,
    settingsPreferences: fallbackPartitions.settingsPreferences,
    settingsCoachingRuntime: fallbackPartitions.settingsCoachingRuntime,
  }

  for (const record of records) {
    const payloadWithDeleteMarker =
      record.deletedAt && record.scope !== 'foods' && record.scope !== 'day_meta'
        ? {
            ...record.payload,
            deletedAt: record.deletedAt,
          }
        : record.payload
    switch (record.scope) {
      case 'foods':
        dataset.foods.push(record.payload as unknown as Food)
        break
      case 'food_log_entries':
        dataset.foodLogEntries.push(payloadWithDeleteMarker as unknown as FoodLogEntry)
        break
      case 'weights':
        dataset.weights.push(payloadWithDeleteMarker as unknown as WeightEntry)
        break
      case 'day_meta':
        if (!record.deletedAt) {
          dataset.dayMeta.push(record.payload as unknown as DayMeta)
        }
        break
      case 'activity':
        dataset.activity.push(payloadWithDeleteMarker as unknown as ActivityEntry)
        break
      case 'wellness':
        dataset.wellness.push(payloadWithDeleteMarker as unknown as WellnessEntry)
        break
      case 'recovery_check_ins':
        dataset.recoveryCheckIns.push(payloadWithDeleteMarker as unknown as RecoveryCheckIn)
        break
      case 'diet_phases':
        if (!record.deletedAt && record.payload.status !== 'cancelled') {
          dataset.dietPhases.push(record.payload as unknown as DietPhase)
        }
        break
      case 'diet_phase_events':
        dataset.dietPhaseEvents.push(payloadWithDeleteMarker as unknown as DietPhaseEvent)
        break
      case 'interventions':
        dataset.interventions.push(payloadWithDeleteMarker as unknown as InterventionEntry)
        break
      case 'meal_templates':
        dataset.mealTemplates.push(payloadWithDeleteMarker as unknown as SavedMeal)
        break
      case 'recipes':
        dataset.recipes.push(payloadWithDeleteMarker as unknown as Recipe)
        break
      case 'favorite_foods':
        dataset.favoriteFoods.push(payloadWithDeleteMarker as unknown as FavoriteFood)
        break
      case 'weekly_check_ins':
        dataset.weeklyCheckIns.push(record.payload as unknown as CheckInRecord)
        break
      case 'coach_decisions':
        dataset.coachDecisions.push(record.payload as unknown as CoachingDecisionRecord)
        break
      case 'settings_targets':
        dataset.settingsTargets = normalizeSettingsTargetsPayload(record.payload, dataset.settingsTargets)
        break
      case 'settings_preferences':
        dataset.settingsPreferences = normalizeSettingsPreferencesPayload(
          record.payload,
          dataset.settingsPreferences,
        )
        break
      case 'settings_coaching_runtime':
        dataset.settingsCoachingRuntime = normalizeSettingsCoachingRuntimePayload(
          record.payload,
          dataset.settingsCoachingRuntime,
        )
        break
    }
  }

  return dataset
}

export function mergeDatasets(localDataset: SyncedLocalDataset, remoteDataset: SyncedLocalDataset): SyncedLocalDataset {
  return {
    foods: mergeByKey(localDataset.foods, remoteDataset.foods, (food) => food.id, getRecordTimestamp),
    foodLogEntries: mergeByKey(
      localDataset.foodLogEntries,
      remoteDataset.foodLogEntries,
      (entry) => entry.id,
      getRecordTimestamp,
    ),
    weights: mergeByKey(localDataset.weights, remoteDataset.weights, (entry) => entry.date, getRecordTimestamp),
    dayMeta: mergeByKey(localDataset.dayMeta, remoteDataset.dayMeta, (entry) => entry.date, (entry) => entry.updatedAt),
    activity: mergeByKey(localDataset.activity, remoteDataset.activity, (entry) => entry.date, getRecordTimestamp),
    wellness: mergeByKey(
      localDataset.wellness,
      remoteDataset.wellness,
      (entry) => `${entry.provider}:${entry.date}`,
      getRecordTimestamp,
    ),
    recoveryCheckIns: mergeByKey(
      localDataset.recoveryCheckIns,
      remoteDataset.recoveryCheckIns,
      (entry) => entry.date,
      getRecordTimestamp,
    ),
    dietPhases: mergeByKey(
      localDataset.dietPhases,
      remoteDataset.dietPhases,
      (entry) => entry.id,
      (entry) => entry.updatedAt,
    ),
    dietPhaseEvents: mergeByKey(
      localDataset.dietPhaseEvents,
      remoteDataset.dietPhaseEvents,
      (entry) => entry.id,
      getRecordTimestamp,
    ),
    interventions: mergeByKey(
      localDataset.interventions,
      remoteDataset.interventions,
      (entry) => entry.id,
      getRecordTimestamp,
    ),
    mealTemplates: mergeByKey(
      localDataset.mealTemplates,
      remoteDataset.mealTemplates,
      (entry) => entry.id,
      getRecordTimestamp,
    ),
    recipes: mergeByKey(localDataset.recipes, remoteDataset.recipes, (entry) => entry.id, getRecordTimestamp),
    favoriteFoods: mergeByKey(
      localDataset.favoriteFoods,
      remoteDataset.favoriteFoods,
      (entry) => entry.foodId,
      getRecordTimestamp,
    ),
    weeklyCheckIns: mergeByKey(
      localDataset.weeklyCheckIns,
      remoteDataset.weeklyCheckIns,
      (entry) => entry.id,
      (entry) => entry.updatedAt ?? entry.appliedAt ?? entry.createdAt,
    ),
    coachDecisions: mergeByKey(
      localDataset.coachDecisions,
      remoteDataset.coachDecisions,
      (entry) => entry.id,
      (entry) => entry.updatedAt ?? entry.createdAt,
    ),
    settingsTargets:
      isoCompare(
        getSettingsTimestamp(localDataset.settingsTargets),
        getSettingsTimestamp(remoteDataset.settingsTargets),
      ) > 0
        ? localDataset.settingsTargets
        : remoteDataset.settingsTargets,
    settingsPreferences:
      isoCompare(
        getSettingsTimestamp(localDataset.settingsPreferences),
        getSettingsTimestamp(remoteDataset.settingsPreferences),
      ) > 0
        ? localDataset.settingsPreferences
        : remoteDataset.settingsPreferences,
    settingsCoachingRuntime:
      isoCompare(
        getSettingsTimestamp(localDataset.settingsCoachingRuntime),
        getSettingsTimestamp(remoteDataset.settingsCoachingRuntime),
      ) > 0
        ? localDataset.settingsCoachingRuntime
        : remoteDataset.settingsCoachingRuntime,
  }
}

export function applyRecordsToDataset(
  dataset: SyncedLocalDataset,
  records: SyncRecordEnvelope[],
  fallbackSettings: UserSettings,
  fallbackTimestamps?: {
    settingsTargets?: string
    settingsPreferences?: string
    settingsCoachingRuntime?: string
  },
): SyncedLocalDataset {
  const nextDataset: SyncedLocalDataset = {
    foods: [...dataset.foods],
    foodLogEntries: [...dataset.foodLogEntries],
    weights: [...dataset.weights],
    dayMeta: [...dataset.dayMeta],
    activity: [...dataset.activity],
    wellness: [...dataset.wellness],
    recoveryCheckIns: [...dataset.recoveryCheckIns],
    dietPhases: [...dataset.dietPhases],
    dietPhaseEvents: [...dataset.dietPhaseEvents],
    interventions: [...dataset.interventions],
    mealTemplates: [...dataset.mealTemplates],
    recipes: [...dataset.recipes],
    favoriteFoods: [...dataset.favoriteFoods],
    weeklyCheckIns: [...dataset.weeklyCheckIns],
    coachDecisions: [...dataset.coachDecisions],
    settingsTargets: dataset.settingsTargets,
    settingsPreferences: dataset.settingsPreferences,
    settingsCoachingRuntime: dataset.settingsCoachingRuntime,
  }

  const fallbackDataset = recordsToDataset([], fallbackSettings, fallbackTimestamps)

  for (const record of records) {
    switch (record.scope) {
      case 'foods':
        nextDataset.foods = nextDataset.foods.filter((food) => food.id !== record.recordId)
        nextDataset.foods.push(record.payload as unknown as Food)
        break
      case 'food_log_entries':
        nextDataset.foodLogEntries = nextDataset.foodLogEntries.filter((entry) => entry.id !== record.recordId)
        nextDataset.foodLogEntries.push(record.payload as unknown as FoodLogEntry)
        break
      case 'weights':
        nextDataset.weights = nextDataset.weights.filter((entry) => entry.date !== record.recordId)
        nextDataset.weights.push(record.payload as unknown as WeightEntry)
        break
      case 'day_meta':
        nextDataset.dayMeta = nextDataset.dayMeta.filter((entry) => entry.date !== record.recordId)
        if (!record.deletedAt) {
          nextDataset.dayMeta.push(record.payload as unknown as DayMeta)
        }
        break
      case 'activity':
        nextDataset.activity = nextDataset.activity.filter((entry) => entry.date !== record.recordId)
        nextDataset.activity.push(record.payload as unknown as ActivityEntry)
        break
      case 'wellness':
        nextDataset.wellness = nextDataset.wellness.filter(
          (entry) => `${entry.provider}:${entry.date}` !== record.recordId,
        )
        nextDataset.wellness.push(record.payload as unknown as WellnessEntry)
        break
      case 'recovery_check_ins':
        nextDataset.recoveryCheckIns = nextDataset.recoveryCheckIns.filter(
          (entry) => entry.date !== record.recordId,
        )
        nextDataset.recoveryCheckIns.push(record.payload as unknown as RecoveryCheckIn)
        break
      case 'diet_phases':
        nextDataset.dietPhases = nextDataset.dietPhases.filter((entry) => entry.id !== record.recordId)
        if (!record.deletedAt && record.payload.status !== 'cancelled') {
          nextDataset.dietPhases.push(record.payload as unknown as DietPhase)
        }
        break
      case 'diet_phase_events':
        nextDataset.dietPhaseEvents = nextDataset.dietPhaseEvents.filter(
          (entry) => entry.id !== record.recordId,
        )
        nextDataset.dietPhaseEvents.push(record.payload as unknown as DietPhaseEvent)
        break
      case 'interventions':
        nextDataset.interventions = nextDataset.interventions.filter((entry) => entry.id !== record.recordId)
        nextDataset.interventions.push(record.payload as unknown as InterventionEntry)
        break
      case 'meal_templates':
        nextDataset.mealTemplates = nextDataset.mealTemplates.filter((entry) => entry.id !== record.recordId)
        nextDataset.mealTemplates.push(record.payload as unknown as SavedMeal)
        break
      case 'recipes':
        nextDataset.recipes = nextDataset.recipes.filter((entry) => entry.id !== record.recordId)
        nextDataset.recipes.push(record.payload as unknown as Recipe)
        break
      case 'favorite_foods':
        nextDataset.favoriteFoods = nextDataset.favoriteFoods.filter(
          (entry) => entry.foodId !== record.recordId,
        )
        nextDataset.favoriteFoods.push(record.payload as unknown as FavoriteFood)
        break
      case 'weekly_check_ins':
        nextDataset.weeklyCheckIns = nextDataset.weeklyCheckIns.filter((entry) => entry.id !== record.recordId)
        nextDataset.weeklyCheckIns.push(record.payload as unknown as CheckInRecord)
        break
      case 'coach_decisions':
        nextDataset.coachDecisions = nextDataset.coachDecisions.filter((entry) => entry.id !== record.recordId)
        nextDataset.coachDecisions.push(record.payload as unknown as CoachingDecisionRecord)
        break
      case 'settings_targets':
        nextDataset.settingsTargets = normalizeSettingsTargetsPayload(
          record.payload,
          fallbackDataset.settingsTargets,
        )
        break
      case 'settings_preferences':
        nextDataset.settingsPreferences = normalizeSettingsPreferencesPayload(
          record.payload,
          fallbackDataset.settingsPreferences,
        )
        break
      case 'settings_coaching_runtime':
        nextDataset.settingsCoachingRuntime = normalizeSettingsCoachingRuntimePayload(
          record.payload,
          fallbackDataset.settingsCoachingRuntime,
        )
        break
    }
  }

  return nextDataset
}
