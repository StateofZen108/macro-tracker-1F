import type { ActionResult, SyncIntegrityState } from '../../types.js'
import { createExtraSingletonStore } from '../storage/extraStore'

const STORAGE_KEY = 'mt_sync_integrity_state'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function readMissingFoodMap(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).map(([recipeId, missingFoodIds]) => [recipeId, readStringArray(missingFoodIds)]),
  )
}

function buildEmptyIntegrityState(): SyncIntegrityState {
  return {
    orphanedFavoriteFoodIds: [],
    invalidRecipeIds: [],
    invalidRecipeMissingFoodIds: {},
    updatedAt: new Date(0).toISOString(),
  }
}

function parseIntegrityState(rawValue: unknown): SyncIntegrityState {
  if (!isRecord(rawValue)) {
    return buildEmptyIntegrityState()
  }

  return {
    orphanedFavoriteFoodIds: readStringArray(rawValue.orphanedFavoriteFoodIds).sort(),
    invalidRecipeIds: readStringArray(rawValue.invalidRecipeIds).sort(),
    invalidRecipeMissingFoodIds: readMissingFoodMap(rawValue.invalidRecipeMissingFoodIds),
    updatedAt:
      typeof rawValue.updatedAt === 'string' && rawValue.updatedAt.trim()
        ? rawValue.updatedAt
        : new Date(0).toISOString(),
  }
}

const store = createExtraSingletonStore<SyncIntegrityState>({
  key: STORAGE_KEY,
  parse: parseIntegrityState,
  initial: buildEmptyIntegrityState,
})

export function loadSyncIntegrityState(): SyncIntegrityState {
  return store.load()
}

export function saveSyncIntegrityState(state: SyncIntegrityState): ActionResult<void> {
  return store.save({
    orphanedFavoriteFoodIds: [...state.orphanedFavoriteFoodIds].sort(),
    invalidRecipeIds: [...state.invalidRecipeIds].sort(),
    invalidRecipeMissingFoodIds: Object.fromEntries(
      Object.entries(state.invalidRecipeMissingFoodIds).map(([recipeId, missingFoodIds]) => [
        recipeId,
        [...missingFoodIds].sort(),
      ]),
    ),
    updatedAt: state.updatedAt,
  })
}

export function subscribeToSyncIntegrityState(listener: () => void): () => void {
  return store.subscribe(listener)
}
