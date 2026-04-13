import type { ActionResult, BackupFile, BackupPreview } from '../../types'
import { recordDiagnosticsEvent } from '../diagnostics'
import { computeSyncIntegrityReport } from '../sync/integrity'
import { saveSyncIntegrityState } from '../sync/integrityState'
import {
  applyBackupImport as applyLegacyBackupImport,
  exportBackupFile as exportLegacyBackupFile,
  validateBackupText as validateLegacyBackupText,
} from './internal'
import { loadFavoriteFoods, saveFavoriteFoods } from './favorites'
import { loadFoods } from './foods'
import { loadRecipes, saveRecipes } from './recipes'

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
  return {
    ...rawBackup,
    savedMeals,
    mealTemplates: savedMeals,
    recipes: rawBackup.recipes ?? [],
    favoriteFoods: rawBackup.favoriteFoods ?? [],
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

function mergeExtraRecords<T extends { deletedAt?: string }>(
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

  return ok({
    ...legacyResult.data,
    mealTemplates: undefined,
    savedMeals: legacyResult.data.mealTemplates ?? [],
    recipes: loadRecipes(),
    favoriteFoods: loadFavoriteFoods(),
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
    backup: {
      ...normalizedResult.data,
      ...validationResult.data.backup,
      savedMeals: normalizedResult.data.savedMeals ?? validationResult.data.backup.mealTemplates ?? [],
      mealTemplates: normalizedResult.data.savedMeals ?? validationResult.data.backup.mealTemplates,
      recipes: normalizedResult.data.recipes ?? [],
      favoriteFoods: normalizedResult.data.favoriteFoods ?? [],
    },
  })
}

export function applyBackupImport(
  backup: BackupFile,
  mode: 'replace' | 'merge',
): ActionResult<BackupPreview['counts']> {
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

  const integrityResult = recomputeImportedSyncIntegrity()
  if (!integrityResult.ok) {
    return integrityResult as ActionResult<BackupPreview['counts']>
  }

  return legacyResult
}
