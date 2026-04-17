import type { ActionResult, BootstrapStatusSummary, FavoriteFood, Recipe, SyncCounts } from '../../types'
import {
  loadCoachingDecisionHistory,
  saveCoachingDecisionHistory,
} from '../storage/coachDecisions'
import { loadDietPhases } from '../storage/dietPhases'
import { loadDietPhaseEvents } from '../storage/dietPhaseEvents'
import { loadFavoriteFoods, saveFavoriteFoods } from '../storage/favorites'
import { loadRecipes, saveRecipes } from '../storage/recipes'
import { loadCheckInHistory, saveCheckInHistory } from '../storage/checkIns'
import { loadRecoveryCheckIns } from '../storage/recoveryCheckIns'
import { loadFoods } from '../storage/foods'
import { DEFAULT_SETTINGS, loadSettings } from '../storage/settings'
import { loadWellnessEntries } from '../storage/wellness'
import {
  captureStorageRollbackSnapshot,
  loadStoredActivityLog,
  loadStoredAllFoodLogs,
  loadStoredDayMeta,
  loadStoredInterventions,
  loadStoredMealTemplates,
  loadStoredWeights,
  replaceSyncedPersistedState,
  restoreStorageRollbackSnapshot,
} from '../storage/internal'
import { getLocalRecordUpdatedAt } from './core'
import {
  applyRecordsToDataset,
  buildEmptySyncCounts,
  buildLogsByDate,
  buildSyncCountsFromDataset,
  flattenLogsByDate,
  mergeDatasets,
  mergeSyncSettingsIntoLocal,
  partitionSettingsForSync,
  sortSyncRecordsForApply,
  type SyncedLocalDataset,
} from './shared'
import { computeSyncIntegrityReport } from './integrity'
import { saveSyncIntegrityState } from './integrityState'

interface LocalRollbackSnapshot {
  storage: ReturnType<typeof captureStorageRollbackSnapshot>
  recipes: Recipe[]
  favoriteFoods: FavoriteFood[]
  weeklyCheckIns: ReturnType<typeof loadCheckInHistory>
  coachDecisions: ReturnType<typeof loadCoachingDecisionHistory>
}

function getSettingsTimestamps() {
  return {
    settingsTargets:
      getLocalRecordUpdatedAt('settings_targets', 'default') ?? new Date(0).toISOString(),
    settingsPreferences:
      getLocalRecordUpdatedAt('settings_preferences', 'default') ?? new Date(0).toISOString(),
    settingsCoachingRuntime:
      getLocalRecordUpdatedAt('settings_coaching_runtime', 'default') ?? new Date(0).toISOString(),
  }
}

export function captureLocalSyncedDataset(): SyncedLocalDataset {
  const settings = loadSettings()

  return {
    foods: loadFoods(),
    foodLogEntries: flattenLogsByDate(loadStoredAllFoodLogs()),
    weights: loadStoredWeights(),
    dayMeta: loadStoredDayMeta(),
    activity: loadStoredActivityLog(),
    interventions: loadStoredInterventions(),
    mealTemplates: loadStoredMealTemplates(),
    recipes: loadRecipes(),
    favoriteFoods: loadFavoriteFoods(),
    weeklyCheckIns: loadCheckInHistory(),
    wellness: loadWellnessEntries(),
    recoveryCheckIns: loadRecoveryCheckIns(),
    dietPhases: loadDietPhases(),
    dietPhaseEvents: loadDietPhaseEvents(),
    coachDecisions: loadCoachingDecisionHistory(),
    ...partitionSettingsForSync(settings, getSettingsTimestamps()),
  }
}

export function captureLocalSyncCounts(): SyncCounts {
  return buildSyncCountsFromDataset(captureLocalSyncedDataset())
}

function shallowEqualIgnoringUpdatedAt(
  left: object,
  right: object,
): boolean {
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftEntries = Object.entries(leftRecord).filter(([key]) => key !== 'updatedAt')
  const rightEntries = Object.entries(rightRecord).filter(([key]) => key !== 'updatedAt')

  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([key, value]) => Object.is(value, rightRecord[key]))
}

export function isSyncedDatasetEffectivelyEmpty(dataset: SyncedLocalDataset): boolean {
  if (
    dataset.foods.length > 0 ||
    dataset.foodLogEntries.length > 0 ||
    dataset.weights.length > 0 ||
    dataset.dayMeta.length > 0 ||
    dataset.activity.length > 0 ||
    dataset.wellness.length > 0 ||
    dataset.recoveryCheckIns.length > 0 ||
    dataset.dietPhases.length > 0 ||
    dataset.dietPhaseEvents.length > 0 ||
    dataset.interventions.length > 0 ||
    dataset.mealTemplates.length > 0 ||
    dataset.recipes.length > 0 ||
    dataset.favoriteFoods.length > 0 ||
    dataset.weeklyCheckIns.length > 0 ||
    dataset.coachDecisions.length > 0
  ) {
    return false
  }

  const defaultSettingsDataset = partitionSettingsForSync(DEFAULT_SETTINGS, {
    settingsTargets: new Date(0).toISOString(),
    settingsPreferences: new Date(0).toISOString(),
    settingsCoachingRuntime: new Date(0).toISOString(),
  })

  return (
    shallowEqualIgnoringUpdatedAt(dataset.settingsTargets, defaultSettingsDataset.settingsTargets) &&
    shallowEqualIgnoringUpdatedAt(
      dataset.settingsPreferences,
      defaultSettingsDataset.settingsPreferences,
    ) &&
    shallowEqualIgnoringUpdatedAt(
      dataset.settingsCoachingRuntime,
      defaultSettingsDataset.settingsCoachingRuntime,
    )
  )
}

function persistSyncIntegrityState(dataset: SyncedLocalDataset): ActionResult<void> {
  const integrityReport = computeSyncIntegrityReport({
    foods: dataset.foods,
    favorites: dataset.favoriteFoods,
    recipes: dataset.recipes,
  })

  return saveSyncIntegrityState({
    orphanedFavoriteFoodIds: integrityReport.orphanedFavoriteIds,
    invalidRecipeIds: integrityReport.invalidRecipeReferences.map((entry) => entry.recipe.id).sort(),
    invalidRecipeMissingFoodIds: Object.fromEntries(
      integrityReport.invalidRecipeReferences.map((entry) => [entry.recipe.id, [...entry.missingFoodIds].sort()]),
    ),
    updatedAt: new Date().toISOString(),
  })
}

export function buildBootstrapSummary(
  cloudCounts: SyncCounts,
  bootstrapCompleted: boolean,
): BootstrapStatusSummary {
  const localCounts = captureLocalSyncCounts()
  const localEmpty = Object.values(localCounts).every((count) => count === 0)
  const remoteCounts = cloudCounts ?? buildEmptySyncCounts()
  const cloudEmpty = Object.values(remoteCounts).every((count) => count === 0)

  return {
    localCounts,
    cloudCounts: remoteCounts,
    localEmpty,
    cloudEmpty,
    bootstrapCompleted,
  }
}

export function createLocalSyncRollbackSnapshot(): LocalRollbackSnapshot {
  return {
    storage: captureStorageRollbackSnapshot(),
    recipes: loadRecipes(),
    favoriteFoods: loadFavoriteFoods(),
    weeklyCheckIns: loadCheckInHistory(),
    coachDecisions: loadCoachingDecisionHistory(),
  }
}

export function restoreLocalSyncRollbackSnapshot(
  snapshot: LocalRollbackSnapshot,
): ActionResult<void> {
  const restoreResult = restoreStorageRollbackSnapshot(snapshot.storage)
  if (!restoreResult.ok) {
    return restoreResult
  }

  const recipesResult = saveRecipes(snapshot.recipes)
  if (!recipesResult.ok) {
    return recipesResult
  }

  const favoritesResult = saveFavoriteFoods(snapshot.favoriteFoods)
  if (!favoritesResult.ok) {
    return favoritesResult
  }

  const checkInsResult = saveCheckInHistory(snapshot.weeklyCheckIns)
  if (!checkInsResult.ok) {
    return checkInsResult
  }

  const decisionsResult = saveCoachingDecisionHistory(snapshot.coachDecisions)
  if (!decisionsResult.ok) {
    return decisionsResult
  }

  return persistSyncIntegrityState(captureLocalSyncedDataset())
}

export function replaceLocalSyncedDataset(dataset: SyncedLocalDataset): ActionResult<void> {
  const rollbackSnapshot = createLocalSyncRollbackSnapshot()
  const nextSettings = mergeSyncSettingsIntoLocal(loadSettings(), dataset)
  const replaceResult = replaceSyncedPersistedState({
    foods: dataset.foods,
    settings: nextSettings,
    weights: dataset.weights,
    mealTemplates: dataset.mealTemplates,
    dayMeta: dataset.dayMeta,
    activityLog: dataset.activity,
    interventions: dataset.interventions,
    wellness: dataset.wellness,
    recoveryCheckIns: dataset.recoveryCheckIns,
    dietPhases: dataset.dietPhases,
    dietPhaseEvents: dataset.dietPhaseEvents,
    logsByDate: buildLogsByDate(dataset.foodLogEntries),
  })
  if (!replaceResult.ok) {
    return replaceResult
  }

  const recipesResult = saveRecipes(dataset.recipes)
  if (!recipesResult.ok) {
    void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
    return recipesResult
  }

  const favoritesResult = saveFavoriteFoods(dataset.favoriteFoods)
  if (!favoritesResult.ok) {
    void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
    return favoritesResult
  }

  const checkInsResult = saveCheckInHistory(dataset.weeklyCheckIns)
  if (!checkInsResult.ok) {
    void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
    return checkInsResult
  }

  const decisionsResult = saveCoachingDecisionHistory(dataset.coachDecisions)
  if (!decisionsResult.ok) {
    void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
    return decisionsResult
  }

  const integrityResult = persistSyncIntegrityState(dataset)
  if (!integrityResult.ok) {
    void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
    return integrityResult
  }

  return { ok: true, data: undefined }
}

export function applyPulledSyncRecords(
  records: Parameters<typeof applyRecordsToDataset>[1],
): ActionResult<void> {
  if (!records.length) {
    return { ok: true, data: undefined }
  }

  const currentDataset = captureLocalSyncedDataset()
  const nextDataset = applyRecordsToDataset(
    currentDataset,
    sortSyncRecordsForApply(records),
    loadSettings(),
    getSettingsTimestamps(),
  )

  return replaceLocalSyncedDataset(nextDataset)
}

export function mergeLocalAndCloudDatasets(cloudDataset: SyncedLocalDataset): SyncedLocalDataset {
  return mergeDatasets(captureLocalSyncedDataset(), cloudDataset)
}
