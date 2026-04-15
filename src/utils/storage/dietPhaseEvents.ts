import type { ActionResult, DietPhaseEvent } from '../../types'
import { queueDietPhaseEventSyncMutations } from '../sync/storageQueue'
import {
  loadDietPhaseEvents as loadStoredDietPhaseEvents,
  saveDietPhaseEvents as saveStoredDietPhaseEvents,
} from './internal'

export function loadDietPhaseEvents(): DietPhaseEvent[] {
  return loadStoredDietPhaseEvents()
}

export function saveDietPhaseEvents(records: DietPhaseEvent[]): ActionResult<void> {
  const previousRecords = loadStoredDietPhaseEvents()
  const result = saveStoredDietPhaseEvents(records)
  if (result.ok) {
    queueDietPhaseEventSyncMutations(previousRecords, loadStoredDietPhaseEvents())
  }
  return result
}
