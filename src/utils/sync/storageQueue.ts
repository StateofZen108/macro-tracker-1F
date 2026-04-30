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
  MealTemplate,
  RecoveryCheckIn,
  Recipe,
  SyncScope,
  UserSettings,
  WellnessEntry,
  WeightEntry,
} from '../../types.js'
import { enqueueSyncMutation, isSyncEnabled, touchLocalRecordUpdatedAt } from './core.js'

function serialize(value: unknown): string {
  return JSON.stringify(value)
}

function queueRecord(
  scope: SyncScope,
  recordId: string,
  payload: Record<string, unknown>,
  operation: 'upsert' | 'delete',
  updatedAt: string,
): void {
  if (!isSyncEnabled()) {
    return
  }

  touchLocalRecordUpdatedAt(scope, recordId, updatedAt)
  enqueueSyncMutation(scope, recordId, operation, payload)
}

function queueGenericDiff<T extends object>(
  scope: SyncScope,
  previousRecords: T[],
  nextRecords: T[],
  getRecordId: (record: T) => string,
  buildMissingDeletePayload: (record: T, deletedAt: string) => T | null,
  getUpdatedAt: (record: T) => string,
  isDeletedRecord?: (record: T) => boolean,
): void {
  if (!isSyncEnabled()) {
    return
  }

  const previousById = new Map(previousRecords.map((record) => [getRecordId(record), record]))
  const nextById = new Map(nextRecords.map((record) => [getRecordId(record), record]))

  for (const [recordId, nextRecord] of nextById.entries()) {
    const previousRecord = previousById.get(recordId)
    if (!previousRecord || serialize(previousRecord) !== serialize(nextRecord)) {
      queueRecord(
        scope,
        recordId,
        nextRecord as Record<string, unknown>,
        isDeletedRecord?.(nextRecord) ? 'delete' : 'upsert',
        getUpdatedAt(nextRecord),
      )
    }
    previousById.delete(recordId)
  }

  const deletedAt = new Date().toISOString()
  for (const [recordId, previousRecord] of previousById.entries()) {
    const deletePayload = buildMissingDeletePayload(previousRecord, deletedAt)
    if (deletePayload) {
      queueRecord(scope, recordId, deletePayload as Record<string, unknown>, 'delete', deletedAt)
    }
  }
}

function pickSettingsTargets(settings: UserSettings) {
  return {
    calorieTarget: settings.calorieTarget,
    proteinTarget: settings.proteinTarget,
    carbTarget: settings.carbTarget,
    fatTarget: settings.fatTarget,
    goalMode: settings.goalMode,
    fatLossMode: settings.fatLossMode ?? 'standard_cut',
    targetWeeklyRatePercent: settings.targetWeeklyRatePercent,
  }
}

function pickSettingsPreferences(settings: UserSettings) {
  return {
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

function pickSettingsCoachingRuntime(settings: UserSettings) {
  return {
    tdeeEstimate: settings.tdeeEstimate,
    coachingDismissedAt: settings.coachingDismissedAt,
    goalModeChangedAt: settings.goalModeChangedAt,
    goalModeChangedFrom: settings.goalModeChangedFrom,
    fatLossModeChangedAt: settings.fatLossModeChangedAt,
  }
}

export function queueFoodSyncMutations(previousFoods: Food[], nextFoods: Food[]): void {
  if (!isSyncEnabled()) {
    return
  }

  const previousById = new Map(previousFoods.map((food) => [food.id, food]))
  for (const food of nextFoods) {
    const previousFood = previousById.get(food.id)
    if (!previousFood || serialize(previousFood) !== serialize(food)) {
      const updatedAt = food.updatedAt ?? food.createdAt
      queueRecord('foods', food.id, food as unknown as Record<string, unknown>, 'upsert', updatedAt)
    }
    previousById.delete(food.id)
  }
}

export function queueSettingsSyncMutations(
  previousSettings: UserSettings,
  nextSettings: UserSettings,
  updatedAt = new Date().toISOString(),
): void {
  if (!isSyncEnabled()) {
    return
  }

  if (serialize(pickSettingsTargets(previousSettings)) !== serialize(pickSettingsTargets(nextSettings))) {
    queueRecord(
      'settings_targets',
      'default',
      { updatedAt, ...pickSettingsTargets(nextSettings) },
      'upsert',
      updatedAt,
    )
  }

  if (
    serialize(pickSettingsPreferences(previousSettings)) !== serialize(pickSettingsPreferences(nextSettings))
  ) {
    queueRecord(
      'settings_preferences',
      'default',
      { updatedAt, ...pickSettingsPreferences(nextSettings) },
      'upsert',
      updatedAt,
    )
  }

  if (
    serialize(pickSettingsCoachingRuntime(previousSettings)) !==
    serialize(pickSettingsCoachingRuntime(nextSettings))
  ) {
    queueRecord(
      'settings_coaching_runtime',
      'default',
      { updatedAt, ...pickSettingsCoachingRuntime(nextSettings) },
      'upsert',
      updatedAt,
    )
  }
}

export function queueWeightSyncMutations(previousWeights: WeightEntry[], nextWeights: WeightEntry[]): void {
  queueGenericDiff(
    'weights',
    previousWeights,
    nextWeights,
    (entry) => entry.date,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.deletedAt ?? entry.updatedAt ?? entry.createdAt,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueDayMetaSyncMutations(previousDayMeta: DayMeta[], nextDayMeta: DayMeta[]): void {
  queueGenericDiff(
    'day_meta',
    previousDayMeta,
    nextDayMeta,
    (entry) => entry.date,
    (entry, deletedAt) => ({
      ...entry,
      updatedAt: deletedAt,
    }),
    (entry) => entry.updatedAt,
  )
}

export function queueFoodLogSyncMutations(previousEntries: FoodLogEntry[], nextEntries: FoodLogEntry[]): void {
  queueGenericDiff(
    'food_log_entries',
    previousEntries,
    nextEntries,
    (entry) => entry.id,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.deletedAt ?? entry.updatedAt ?? entry.createdAt,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueActivitySyncMutations(previousEntries: ActivityEntry[], nextEntries: ActivityEntry[]): void {
  queueGenericDiff(
    'activity',
    previousEntries,
    nextEntries,
    (entry) => entry.date,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.deletedAt ?? entry.updatedAt,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueWellnessSyncMutations(previousEntries: WellnessEntry[], nextEntries: WellnessEntry[]): void {
  queueGenericDiff(
    'wellness',
    previousEntries,
    nextEntries,
    (entry) => `${entry.provider}:${entry.date}`,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.updatedAt ?? entry.sourceUpdatedAt ?? entry.date,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueRecoveryCheckInSyncMutations(
  previousEntries: RecoveryCheckIn[],
  nextEntries: RecoveryCheckIn[],
): void {
  queueGenericDiff(
    'recovery_check_ins',
    previousEntries,
    nextEntries,
    (entry) => entry.date,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.updatedAt ?? entry.deletedAt ?? entry.date,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueDietPhaseSyncMutations(previousEntries: DietPhase[], nextEntries: DietPhase[]): void {
  queueGenericDiff(
    'diet_phases',
    previousEntries,
    nextEntries,
    (entry) => entry.id,
    (entry, deletedAt) => ({
      ...entry,
      status: 'cancelled' as const,
      updatedAt: deletedAt,
    }),
    (entry) => entry.updatedAt,
    (entry) => entry.status === 'cancelled',
  )
}

export function queueDietPhaseEventSyncMutations(
  previousEntries: DietPhaseEvent[],
  nextEntries: DietPhaseEvent[],
): void {
  queueGenericDiff(
    'diet_phase_events',
    previousEntries,
    nextEntries,
    (entry) => entry.id,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.updatedAt ?? entry.createdAt,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueInterventionSyncMutations(
  previousEntries: InterventionEntry[],
  nextEntries: InterventionEntry[],
): void {
  queueGenericDiff(
    'interventions',
    previousEntries,
    nextEntries,
    (entry) => entry.id,
    (entry, deletedAt) => ({
      ...entry,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (entry) => entry.deletedAt ?? entry.updatedAt ?? entry.createdAt,
    (entry) => Boolean(entry.deletedAt),
  )
}

export function queueMealTemplateSyncMutations(
  previousTemplates: MealTemplate[],
  nextTemplates: MealTemplate[],
): void {
  queueGenericDiff(
    'meal_templates',
    previousTemplates,
    nextTemplates,
    (template) => template.id,
    (template, deletedAt) => ({
      ...template,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (template) => template.deletedAt ?? template.updatedAt ?? template.createdAt,
    (template) => Boolean(template.deletedAt),
  )
}

export function queueRecipeSyncMutations(previousRecipes: Recipe[], nextRecipes: Recipe[]): void {
  queueGenericDiff(
    'recipes',
    previousRecipes,
    nextRecipes,
    (recipe) => recipe.id,
    (recipe, deletedAt) => ({
      ...recipe,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (recipe) => recipe.deletedAt ?? recipe.updatedAt ?? recipe.createdAt,
    (recipe) => Boolean(recipe.deletedAt),
  )
}

export function queueFavoriteFoodSyncMutations(
  previousFavorites: FavoriteFood[],
  nextFavorites: FavoriteFood[],
): void {
  queueGenericDiff(
    'favorite_foods',
    previousFavorites,
    nextFavorites,
    (favorite) => favorite.foodId,
    (favorite, deletedAt) => ({
      ...favorite,
      deletedAt,
      updatedAt: deletedAt,
    }),
    (favorite) => favorite.deletedAt ?? favorite.updatedAt ?? favorite.createdAt,
    (favorite) => Boolean(favorite.deletedAt),
  )
}

export function queueWeeklyCheckInSyncMutations(
  previousCheckIns: CheckInRecord[],
  nextCheckIns: CheckInRecord[],
): void {
  queueGenericDiff(
    'weekly_check_ins',
    previousCheckIns,
    nextCheckIns,
    (checkIn) => checkIn.id,
    () => null,
    (checkIn) => checkIn.updatedAt ?? checkIn.appliedAt ?? checkIn.createdAt,
  )
}

export function queueCoachDecisionSyncMutations(
  previousDecisions: CoachingDecisionRecord[],
  nextDecisions: CoachingDecisionRecord[],
): void {
  queueGenericDiff(
    'coach_decisions',
    previousDecisions,
    nextDecisions,
    (decision) => decision.id,
    () => null,
    (decision) => decision.updatedAt ?? decision.createdAt,
  )
}
