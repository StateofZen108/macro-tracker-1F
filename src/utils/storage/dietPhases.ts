import type { ActionResult, DietPhase } from '../../types'
import { queueDietPhaseSyncMutations } from '../sync/storageQueue'
import {
  loadDietPhases as loadStoredDietPhases,
  saveDietPhases as saveStoredDietPhases,
} from './internal'

export function loadDietPhases(): DietPhase[] {
  return loadStoredDietPhases()
}

export function saveDietPhases(records: DietPhase[]): ActionResult<void> {
  const previousRecords = loadStoredDietPhases()
  const result = saveStoredDietPhases(records)
  if (result.ok) {
    queueDietPhaseSyncMutations(previousRecords, loadStoredDietPhases())
  }
  return result
}
