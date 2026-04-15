import type { ActionResult, CheckInRecord } from '../../types'
import {
  loadCheckInHistory as loadStoredCheckInHistory,
  saveCheckInHistory as saveStoredCheckInHistory,
} from './internal'
import { queueWeeklyCheckInSyncMutations } from '../sync/storageQueue'

export function loadCheckInHistory(): CheckInRecord[] {
  return loadStoredCheckInHistory()
}

export function saveCheckInHistory(records: CheckInRecord[]): ActionResult<void> {
  const previousRecords = loadStoredCheckInHistory()
  const normalizedRecords = records.map((record) => ({
    ...record,
    updatedAt: record.updatedAt ?? record.appliedAt ?? record.createdAt,
  }))
  const result = saveStoredCheckInHistory(normalizedRecords)
  if (!result.ok) {
    return result
  }

  queueWeeklyCheckInSyncMutations(previousRecords, normalizedRecords)
  return result
}
