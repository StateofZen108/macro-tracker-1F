import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, RecoveryCheckIn } from '../types'
import { subscribeToStorage } from '../utils/storage/core'
import { loadRecoveryCheckIns, saveRecoveryCheckIns } from '../utils/storage/recoveryCheckIns'
import { isSyncEnabled } from '../utils/sync/core'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(message: string, code = 'recoveryCheckIn'): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function clampScore(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(value))) as 1 | 2 | 3 | 4 | 5
}

export function useRecoveryCheckIns() {
  const storedRecords = useSyncExternalStore(
    subscribeToStorage,
    loadRecoveryCheckIns,
    loadRecoveryCheckIns,
  )
  const recoveryCheckIns = useMemo(
    () => storedRecords.filter((record) => !record.deletedAt),
    [storedRecords],
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function getEntry(date: string): RecoveryCheckIn | null {
    return recoveryCheckIns.find((record) => record.date === date) ?? null
  }

  function saveEntry(
    date: string,
    draft: Pick<
      RecoveryCheckIn,
      'energyScore' | 'hungerScore' | 'sorenessScore' | 'sleepQualityScore' | 'notes'
    >,
  ): ActionResult<RecoveryCheckIn> {
    const now = new Date().toISOString()
    const nextRecord: RecoveryCheckIn = {
      date,
      energyScore: clampScore(draft.energyScore),
      hungerScore: clampScore(draft.hungerScore),
      sorenessScore: clampScore(draft.sorenessScore),
      sleepQualityScore: clampScore(draft.sleepQualityScore),
      notes: draft.notes?.trim() || undefined,
      updatedAt: now,
      deletedAt: undefined,
    }

    const result = saveRecoveryCheckIns(
      storedRecords.filter((record) => record.date !== date).concat(nextRecord),
    )
    setLastError(result.ok ? null : result.error)
    return result.ok ? ok(nextRecord) : (result as ActionResult<RecoveryCheckIn>)
  }

  function deleteEntry(date: string): ActionResult<void> {
    const existing = storedRecords.find((record) => record.date === date)
    if (!existing) {
      return fail('Recovery check-in not found.')
    }

    const now = new Date().toISOString()
    const nextRecords = isSyncEnabled()
      ? storedRecords.map((record) =>
          record.date === date
            ? {
                ...record,
                updatedAt: now,
                deletedAt: now,
              }
            : record,
        )
      : storedRecords.filter((record) => record.date !== date)

    const result = saveRecoveryCheckIns(nextRecords)
    setLastError(result.ok ? null : result.error)
    return result
  }

  return {
    recoveryCheckIns,
    getEntry,
    saveEntry,
    deleteEntry,
    lastError,
  }
}
