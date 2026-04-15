import type { ActionResult, WellnessEntry } from '../../types'
import { queueWellnessSyncMutations } from '../sync/storageQueue'
import {
  loadWellnessEntries as loadStoredWellnessEntries,
  saveWellnessEntries as saveStoredWellnessEntries,
} from './internal'

export function loadWellnessEntries(): WellnessEntry[] {
  return loadStoredWellnessEntries()
}

export function saveWellnessEntries(entries: WellnessEntry[]): ActionResult<void> {
  const previousEntries = loadStoredWellnessEntries()
  const result = saveStoredWellnessEntries(entries)
  if (result.ok) {
    queueWellnessSyncMutations(previousEntries, loadStoredWellnessEntries())
  }
  return result
}
