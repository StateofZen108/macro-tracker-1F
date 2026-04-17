import type {
  ActionResult,
  BackupFile,
  BackupPreview,
  RecoveryExportPackManifest,
} from '../../types'
import { recordDiagnosticsEvent } from '../diagnostics'
import { computeSyncIntegrityReport } from '../sync/integrity'
import { saveSyncIntegrityState } from '../sync/integrityState'
import {
  applyBackupImport as applyLegacyBackupImport,
  exportBackupFile as exportLegacyBackupFile,
  validateBackupText as validateLegacyBackupText,
} from './internal'
import {
  loadCoachingDecisionHistory,
  saveCoachingDecisionHistory,
} from './coachDecisions'
import { getBodyProgressSnapshot, mergeBodyProgressSnapshots, replaceBodyProgressSnapshots } from './bodyProgress'
import { loadBenchmarkReports, saveBenchmarkReports } from './benchmarkReports'
import { loadEncryptedSyncQueue, saveEncryptedSyncQueue } from './encryptedSync'
import { loadFavoriteFoods, saveFavoriteFoods } from './favorites'
import { loadFoods } from './foods'
import { loadFoodReviewQueue, saveFoodReviewQueue } from './foodReviewQueue'
import {
  loadGarminImportedWeights,
  loadGarminModifierRecords,
  loadGarminWorkoutSummaries,
  saveGarminImportedWeights,
  saveGarminModifierRecords,
  saveGarminWorkoutSummaries,
} from './garminImports'
import { loadCheckInHistory, saveCheckInHistory } from './checkIns'
import { loadRecipes, saveRecipes } from './recipes'
import {
  loadProgressionDecisions,
  loadWorkoutPrograms,
  loadWorkoutSessions,
  saveProgressionDecisions,
  saveWorkoutPrograms,
  saveWorkoutSessions,
} from './workouts'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBackupAliases(rawBackup: BackupFile): BackupFile {
  const savedMeals = rawBackup.savedMeals ?? rawBackup.mealTemplates ?? []
  const weeklyCheckIns = rawBackup.weeklyCheckIns ?? rawBackup.checkInHistory ?? []
  return {
    ...rawBackup,
    savedMeals,
    mealTemplates: savedMeals,
    weeklyCheckIns,
    checkInHistory: weeklyCheckIns,
    recipes: rawBackup.recipes ?? [],
    favoriteFoods: rawBackup.favoriteFoods ?? [],
    coachDecisions: rawBackup.coachDecisions ?? [],
    foodReviewQueue: rawBackup.foodReviewQueue ?? [],
    garminImportedWeights: rawBackup.garminImportedWeights ?? [],
    garminModifierRecords: rawBackup.garminModifierRecords ?? [],
    garminWorkoutSummaries: rawBackup.garminWorkoutSummaries ?? [],
    bodyProgressSnapshots: rawBackup.bodyProgressSnapshots ?? [],
    workoutPrograms: rawBackup.workoutPrograms ?? [],
    workoutSessions: rawBackup.workoutSessions ?? [],
    progressionDecisions: rawBackup.progressionDecisions ?? [],
    encryptedSyncQueue: rawBackup.encryptedSyncQueue ?? [],
    benchmarkReports: rawBackup.benchmarkReports ?? [],
  }
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `fnv1a-${(hash >>> 0).toString(16)}`
}

function buildRecoveryManifest(backup: BackupFile): RecoveryExportPackManifest {
  const bodyProgressSnapshots = backup.bodyProgressSnapshots ?? []
  const mediaHashes = bodyProgressSnapshots.flatMap((snapshot) =>
    snapshot.photos.map((photo) => ({
      snapshotId: snapshot.id,
      photoId: photo.id,
      hash: hashString(photo.dataUrl),
    })),
  )
  const totalBytes = bodyProgressSnapshots.reduce(
    (sum, snapshot) => sum + snapshot.photos.reduce((photoBytes, photo) => photoBytes + photo.dataUrl.length, 0),
    0,
  )

  return {
    id: crypto.randomUUID(),
    exportedAt: backup.exportedAt,
    schemaVersion: backup.schemaVersion,
    recordCounts: {
      foods: backup.foods.length,
      weights: backup.weights.length,
      logDays: Object.keys(backup.logsByDate).length,
      logEntries: Object.values(backup.logsByDate).reduce((sum, entries) => sum + entries.length, 0),
      foodReviewQueue: backup.foodReviewQueue?.length ?? 0,
      garminImportedWeights: backup.garminImportedWeights?.length ?? 0,
      garminModifierRecords: backup.garminModifierRecords?.length ?? 0,
      garminWorkoutSummaries: backup.garminWorkoutSummaries?.length ?? 0,
      bodyProgressSnapshots: bodyProgressSnapshots.length,
      workoutPrograms: backup.workoutPrograms?.length ?? 0,
      workoutSessions: backup.workoutSessions?.length ?? 0,
      progressionDecisions: backup.progressionDecisions?.length ?? 0,
      benchmarkReports: backup.benchmarkReports?.length ?? 0,
    },
    media: {
      photoCount: mediaHashes.length,
      totalBytes,
      hashes: mediaHashes,
    },
  }
}

function buildCurrentCounts(legacyCounts: BackupPreview['counts']): BackupPreview['counts'] {
  return {
    ...legacyCounts,
    foodReviewQueue: loadFoodReviewQueue().length,
    garminImportedWeights: loadGarminImportedWeights().length,
    garminModifierRecords: loadGarminModifierRecords().length,
    garminWorkoutSummaries: loadGarminWorkoutSummaries().length,
    bodyProgressSnapshots: getBodyProgressSnapshot().length,
    workoutPrograms: loadWorkoutPrograms().length,
    workoutSessions: loadWorkoutSessions().length,
    progressionDecisions: loadProgressionDecisions().length,
    benchmarkReports: loadBenchmarkReports().length,
  }
}

function buildCountsFromBackup(backup: BackupFile, legacyCounts: BackupPreview['counts']): BackupPreview['counts'] {
  return {
    ...legacyCounts,
    foodReviewQueue: backup.foodReviewQueue?.length ?? 0,
    garminImportedWeights: backup.garminImportedWeights?.length ?? 0,
    garminModifierRecords: backup.garminModifierRecords?.length ?? 0,
    garminWorkoutSummaries: backup.garminWorkoutSummaries?.length ?? 0,
    bodyProgressSnapshots: backup.bodyProgressSnapshots?.length ?? 0,
    workoutPrograms: backup.workoutPrograms?.length ?? 0,
    workoutSessions: backup.workoutSessions?.length ?? 0,
    progressionDecisions: backup.progressionDecisions?.length ?? 0,
    benchmarkReports: backup.benchmarkReports?.length ?? 0,
  }
}

function normalizeBackupText(rawText: string): ActionResult<BackupFile> {
  if (!rawText.trim()) {
    return fail('invalidBackup', 'The selected file is empty.')
  }

  try {
    const parsed = JSON.parse(rawText) as unknown
    if (!isRecord(parsed)) {
      return fail('invalidBackup', 'The selected file is not valid JSON.')
    }

    const backup = parsed as unknown as BackupFile
    return ok(normalizeBackupAliases(backup))
  } catch {
    return fail('invalidBackup', 'The selected file is not valid JSON.')
  }
}

function mergeExtraRecords<T>(
  currentItems: T[],
  importedItems: T[],
  getId: (value: T) => string,
  getUpdatedAt: (value: T) => string,
): T[] {
  const merged = new Map(currentItems.map((item) => [getId(item), item]))
  for (const importedItem of importedItems) {
    const existingItem = merged.get(getId(importedItem))
    if (!existingItem || getUpdatedAt(existingItem).localeCompare(getUpdatedAt(importedItem)) <= 0) {
      merged.set(getId(importedItem), importedItem)
    }
  }

  return [...merged.values()]
}

function recomputeImportedSyncIntegrity(): ActionResult<void> {
  const integrityReport = computeSyncIntegrityReport({
    foods: loadFoods(),
    favorites: loadFavoriteFoods(),
    recipes: loadRecipes(),
  })

  return saveSyncIntegrityState({
    orphanedFavoriteFoodIds: integrityReport.orphanedFavoriteIds,
    invalidRecipeIds: integrityReport.invalidRecipeReferences.map((entry) => entry.recipe.id).sort(),
    invalidRecipeMissingFoodIds: Object.fromEntries(
      integrityReport.invalidRecipeReferences.map((entry) => [
        entry.recipe.id,
        [...entry.missingFoodIds].sort(),
      ]),
    ),
    updatedAt: new Date().toISOString(),
  })
}

export function exportBackupFile(): ActionResult<BackupFile> {
  const legacyResult = exportLegacyBackupFile()
  if (!legacyResult.ok) {
    return legacyResult
  }

  const backup: BackupFile = {
    ...legacyResult.data,
    mealTemplates: undefined,
    savedMeals: legacyResult.data.mealTemplates ?? [],
    weeklyCheckIns: legacyResult.data.checkInHistory ?? [],
    recipes: loadRecipes(),
    favoriteFoods: loadFavoriteFoods(),
    coachDecisions: loadCoachingDecisionHistory(),
    foodReviewQueue: loadFoodReviewQueue(),
    garminImportedWeights: loadGarminImportedWeights(),
    garminModifierRecords: loadGarminModifierRecords(),
    garminWorkoutSummaries: loadGarminWorkoutSummaries(),
    bodyProgressSnapshots: getBodyProgressSnapshot(),
    workoutPrograms: loadWorkoutPrograms(),
    workoutSessions: loadWorkoutSessions(),
    progressionDecisions: loadProgressionDecisions(),
    encryptedSyncQueue: loadEncryptedSyncQueue(),
    benchmarkReports: loadBenchmarkReports(),
  }

  return ok({
    ...backup,
    recoveryManifest: buildRecoveryManifest(backup),
  })
}

export function validateBackupText(rawText: string): ActionResult<BackupPreview> {
  const normalizedResult = normalizeBackupText(rawText)
  if (!normalizedResult.ok) {
    return normalizedResult as ActionResult<BackupPreview>
  }

  const validationResult = validateLegacyBackupText(JSON.stringify(normalizedResult.data))
  if (!validationResult.ok) {
    return validationResult
  }

  return ok({
    ...validationResult.data,
    counts: buildCountsFromBackup(normalizedResult.data, validationResult.data.counts),
    backup: {
      ...normalizedResult.data,
      ...validationResult.data.backup,
      savedMeals: normalizedResult.data.savedMeals ?? validationResult.data.backup.mealTemplates ?? [],
      mealTemplates: normalizedResult.data.savedMeals ?? validationResult.data.backup.mealTemplates,
      weeklyCheckIns:
        normalizedResult.data.weeklyCheckIns ?? validationResult.data.backup.checkInHistory ?? [],
      checkInHistory:
        normalizedResult.data.weeklyCheckIns ?? validationResult.data.backup.checkInHistory ?? [],
      recipes: normalizedResult.data.recipes ?? [],
      favoriteFoods: normalizedResult.data.favoriteFoods ?? [],
      coachDecisions: normalizedResult.data.coachDecisions ?? [],
      foodReviewQueue: normalizedResult.data.foodReviewQueue ?? [],
      garminImportedWeights: normalizedResult.data.garminImportedWeights ?? [],
      garminModifierRecords: normalizedResult.data.garminModifierRecords ?? [],
      garminWorkoutSummaries: normalizedResult.data.garminWorkoutSummaries ?? [],
      bodyProgressSnapshots: normalizedResult.data.bodyProgressSnapshots ?? [],
      workoutPrograms: normalizedResult.data.workoutPrograms ?? [],
      workoutSessions: normalizedResult.data.workoutSessions ?? [],
      progressionDecisions: normalizedResult.data.progressionDecisions ?? [],
      encryptedSyncQueue: normalizedResult.data.encryptedSyncQueue ?? [],
      benchmarkReports: normalizedResult.data.benchmarkReports ?? [],
      recoveryManifest: normalizedResult.data.recoveryManifest,
    },
  })
}

export async function applyBackupImport(
  backup: BackupFile,
  mode: 'replace' | 'merge',
): Promise<ActionResult<BackupPreview['counts']>> {
  const normalizedBackup = normalizeBackupAliases(backup)
  const legacyResult = applyLegacyBackupImport(normalizedBackup, mode)
  if (!legacyResult.ok) {
    return legacyResult
  }

  if (backup.savedMeals && backup.mealTemplates) {
    void recordDiagnosticsEvent({
      eventType: 'saved_meal_import_alias_conflict',
      severity: 'warning',
      scope: 'storage',
      message: 'Backup contained both savedMeals and legacy mealTemplates. savedMeals was used.',
      payload: {
        savedMealsCount: backup.savedMeals.length,
        mealTemplatesCount: backup.mealTemplates.length,
      },
    })
  }

  const importedRecipes = normalizedBackup.recipes ?? []
  const importedFavorites = normalizedBackup.favoriteFoods ?? []
  const importedWeeklyCheckIns = normalizedBackup.weeklyCheckIns ?? normalizedBackup.checkInHistory ?? []
  const importedCoachDecisions = normalizedBackup.coachDecisions ?? []
  const importedFoodReviewQueue = normalizedBackup.foodReviewQueue ?? []
  const importedGarminImportedWeights = normalizedBackup.garminImportedWeights ?? []
  const importedGarminModifierRecords = normalizedBackup.garminModifierRecords ?? []
  const importedGarminWorkoutSummaries = normalizedBackup.garminWorkoutSummaries ?? []
  const importedBodyProgressSnapshots = normalizedBackup.bodyProgressSnapshots ?? []
  const importedWorkoutPrograms = normalizedBackup.workoutPrograms ?? []
  const importedWorkoutSessions = normalizedBackup.workoutSessions ?? []
  const importedProgressionDecisions = normalizedBackup.progressionDecisions ?? []
  const importedEncryptedSyncQueue = normalizedBackup.encryptedSyncQueue ?? []
  const importedBenchmarkReports = normalizedBackup.benchmarkReports ?? []

  const recipeResult = saveRecipes(
    mode === 'replace'
      ? importedRecipes
      : mergeExtraRecords(loadRecipes(), importedRecipes, (recipe) => recipe.id, (recipe) => recipe.deletedAt ?? recipe.updatedAt ?? recipe.createdAt),
  )
  if (!recipeResult.ok) {
    return recipeResult as ActionResult<BackupPreview['counts']>
  }

  const favoriteResult = saveFavoriteFoods(
    mode === 'replace'
      ? importedFavorites
      : mergeExtraRecords(
          loadFavoriteFoods(),
          importedFavorites,
          (favorite) => favorite.foodId,
          (favorite) => favorite.deletedAt ?? favorite.updatedAt ?? favorite.createdAt,
        ),
  )
  if (!favoriteResult.ok) {
    return favoriteResult as ActionResult<BackupPreview['counts']>
  }

  const checkInResult = saveCheckInHistory(
    mode === 'replace'
      ? importedWeeklyCheckIns
      : mergeExtraRecords(
          loadCheckInHistory(),
          importedWeeklyCheckIns,
          (checkIn) => checkIn.id,
          (checkIn) => checkIn.updatedAt ?? checkIn.appliedAt ?? checkIn.createdAt,
        ),
  )
  if (!checkInResult.ok) {
    return checkInResult as ActionResult<BackupPreview['counts']>
  }

  const coachDecisionResult = saveCoachingDecisionHistory(
    mode === 'replace'
      ? importedCoachDecisions
      : mergeExtraRecords(
          loadCoachingDecisionHistory(),
          importedCoachDecisions,
          (decision) => decision.id,
          (decision) => decision.updatedAt ?? decision.createdAt,
        ),
  )
  if (!coachDecisionResult.ok) {
    return coachDecisionResult as ActionResult<BackupPreview['counts']>
  }

  const integrityResult = recomputeImportedSyncIntegrity()
  if (!integrityResult.ok) {
    return integrityResult as ActionResult<BackupPreview['counts']>
  }

  const reviewQueueResult = saveFoodReviewQueue(
    mode === 'replace'
      ? importedFoodReviewQueue
      : mergeExtraRecords(
          loadFoodReviewQueue(),
          importedFoodReviewQueue,
          (item) => item.id,
          (item) => item.updatedAt,
        ),
  )
  if (!reviewQueueResult.ok) {
    return reviewQueueResult as ActionResult<BackupPreview['counts']>
  }

  const weightsResult = saveGarminImportedWeights(
    mode === 'replace'
      ? importedGarminImportedWeights
      : mergeExtraRecords(
          loadGarminImportedWeights(),
          importedGarminImportedWeights,
          (item) => item.id,
          (item) => item.sourceUpdatedAt,
        ),
  )
  if (!weightsResult.ok) {
    return weightsResult as ActionResult<BackupPreview['counts']>
  }

  const modifierResult = saveGarminModifierRecords(
    mode === 'replace'
      ? importedGarminModifierRecords
      : mergeExtraRecords(
          loadGarminModifierRecords(),
          importedGarminModifierRecords,
          (item) => item.id,
          (item) => item.sourceUpdatedAt,
        ),
  )
  if (!modifierResult.ok) {
    return modifierResult as ActionResult<BackupPreview['counts']>
  }

  const workoutSummaryResult = saveGarminWorkoutSummaries(
    mode === 'replace'
      ? importedGarminWorkoutSummaries
      : mergeExtraRecords(
          loadGarminWorkoutSummaries(),
          importedGarminWorkoutSummaries,
          (item) => item.id,
          (item) => item.sourceUpdatedAt,
        ),
  )
  if (!workoutSummaryResult.ok) {
    return workoutSummaryResult as ActionResult<BackupPreview['counts']>
  }

  const bodyProgressResult =
    mode === 'replace'
      ? await replaceBodyProgressSnapshots(importedBodyProgressSnapshots)
      : await mergeBodyProgressSnapshots(importedBodyProgressSnapshots)
  if (!bodyProgressResult.ok) {
    return bodyProgressResult as ActionResult<BackupPreview['counts']>
  }

  const workoutProgramsResult = saveWorkoutPrograms(
    mode === 'replace'
      ? importedWorkoutPrograms
      : mergeExtraRecords(
          loadWorkoutPrograms(),
          importedWorkoutPrograms,
          (item) => item.id,
          (item) => item.updatedAt,
        ),
  )
  if (!workoutProgramsResult.ok) {
    return workoutProgramsResult as ActionResult<BackupPreview['counts']>
  }

  const workoutSessionsResult = saveWorkoutSessions(
    mode === 'replace'
      ? importedWorkoutSessions
      : mergeExtraRecords(
          loadWorkoutSessions(),
          importedWorkoutSessions,
          (item) => item.id,
          (item) => item.updatedAt,
        ),
  )
  if (!workoutSessionsResult.ok) {
    return workoutSessionsResult as ActionResult<BackupPreview['counts']>
  }

  const progressionDecisionsResult = saveProgressionDecisions(
    mode === 'replace'
      ? importedProgressionDecisions
      : mergeExtraRecords(
          loadProgressionDecisions(),
          importedProgressionDecisions,
          (item) => item.id,
          (item) => item.createdAt,
        ),
  )
  if (!progressionDecisionsResult.ok) {
    return progressionDecisionsResult as ActionResult<BackupPreview['counts']>
  }

  const encryptedSyncQueueResult = saveEncryptedSyncQueue(
    mode === 'replace'
      ? importedEncryptedSyncQueue
      : mergeExtraRecords(
          loadEncryptedSyncQueue(),
          importedEncryptedSyncQueue,
          (item) => item.id,
          (item) => item.createdAt,
        ),
  )
  if (!encryptedSyncQueueResult.ok) {
    return encryptedSyncQueueResult as ActionResult<BackupPreview['counts']>
  }

  const benchmarkReportsResult = saveBenchmarkReports(
    mode === 'replace'
      ? importedBenchmarkReports
      : mergeExtraRecords(
          loadBenchmarkReports(),
          importedBenchmarkReports,
          (item) => item.id,
          (item) => item.createdAt,
        ),
  )
  if (!benchmarkReportsResult.ok) {
    return benchmarkReportsResult as ActionResult<BackupPreview['counts']>
  }

  return ok(buildCurrentCounts(legacyResult.data))
}
