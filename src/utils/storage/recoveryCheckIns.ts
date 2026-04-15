import type { ActionResult, RecoveryCheckIn } from '../../types'
import { queueRecoveryCheckInSyncMutations } from '../sync/storageQueue'
import {
  loadRecoveryCheckIns as loadStoredRecoveryCheckIns,
  saveRecoveryCheckIns as saveStoredRecoveryCheckIns,
} from './internal'

export function loadRecoveryCheckIns(): RecoveryCheckIn[] {
  return loadStoredRecoveryCheckIns()
}

export function saveRecoveryCheckIns(records: RecoveryCheckIn[]): ActionResult<void> {
  const previousRecords = loadStoredRecoveryCheckIns()
  const result = saveStoredRecoveryCheckIns(records)
  if (result.ok) {
    queueRecoveryCheckInSyncMutations(previousRecords, loadStoredRecoveryCheckIns())
  }
  return result
}
