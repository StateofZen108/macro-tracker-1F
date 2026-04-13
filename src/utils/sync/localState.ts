import type { ActionResult, BootstrapStatusSummary, FavoriteFood, Recipe, SyncCounts } from '../../types'
import { loadFavoriteFoods, saveFavoriteFoods } from '../storage/favorites'
import { loadRecipes, saveRecipes } from '../storage/recipes'
import { loadFoods } from '../storage/foods'
import { loadSettings } from '../storage/settings'
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
    ...partitionSettingsForSync(settings, getSettingsTimestamps()),
  }
}

export function captureLocalSyncCounts(): SyncCounts {
  return buildSyncCountsFromDataset(captureLocalSyncedDataset())
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
