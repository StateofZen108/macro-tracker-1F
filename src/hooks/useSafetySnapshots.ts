import { useCallback, useSyncExternalStore } from 'react'
import type { ActionResult, BackupPreview } from '../types'
import {
  applyBackupImport,
  exportBackupFile,
  validateBackupText,
} from '../utils/storage/importExport'
import { initializeStorage, isStorageInitialized } from '../utils/storage/schema'
import {
  captureSafetySnapshot,
  getSafetySnapshotSummarySnapshot,
  getLatestSafetySnapshot,
  listSafetySnapshots,
  refreshSafetySnapshotSummary,
  subscribeSafetySnapshotSummary,
  type SafetySnapshotReason,
  type SafetySnapshotRecord,
} from '../utils/storage/safetySnapshots'

function fail(code: string, message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

async function ensureStorageReady(): Promise<void> {
  if (!isStorageInitialized()) {
    await initializeStorage()
  }
}

export function useSafetySnapshots() {
  const summary = useSyncExternalStore(
    subscribeSafetySnapshotSummary,
    getSafetySnapshotSummarySnapshot,
    getSafetySnapshotSummarySnapshot,
  )

  const refresh = useCallback(async () => {
    await refreshSafetySnapshotSummary()
  }, [])

  const captureSnapshot = useCallback(
    async (reason: SafetySnapshotReason): Promise<ActionResult<SafetySnapshotRecord>> => {
      try {
        await ensureStorageReady()
        const backupResult = exportBackupFile()
        if (!backupResult.ok) {
          return backupResult as ActionResult<SafetySnapshotRecord>
        }

        const snapshot = await captureSafetySnapshot(backupResult.data, reason)
        if (!snapshot) {
          return fail('snapshotUnavailable', 'Safety snapshots are unavailable in this browser.')
        }

        await refresh()
        return {
          ok: true,
          data: snapshot,
        }
      } catch (error) {
        return fail(
          'snapshotFailed',
          error instanceof Error ? error.message : 'Unable to write a safety snapshot right now.',
        )
      }
    },
    [refresh],
  )

  const captureDailySnapshot = useCallback(async (): Promise<ActionResult<boolean>> => {
    const snapshots = await listSafetySnapshots()
    const today = new Date().toISOString().slice(0, 10)
    if (snapshots.some((snapshot) => snapshot.reason === 'daily-auto' && snapshot.createdAt.startsWith(today))) {
      return {
        ok: true,
        data: false,
      }
    }

    const snapshotResult = await captureSnapshot('daily-auto')
    if (!snapshotResult.ok) {
      return snapshotResult as ActionResult<boolean>
    }

    return {
      ok: true,
      data: true,
    }
  }, [captureSnapshot])

  const restoreLatestSnapshot = useCallback(async (): Promise<ActionResult<BackupPreview['counts']>> => {
    try {
      await ensureStorageReady()
      const snapshot = await getLatestSafetySnapshot()
      if (!snapshot) {
        return fail('snapshotMissing', 'No safety snapshot is available to restore.')
      }

      const result = await applyBackupImport(snapshot.backup, 'replace')
      await refresh()
      return result
    } catch (error) {
      return fail(
        'snapshotRestoreFailed',
        error instanceof Error ? error.message : 'Unable to restore the latest safety snapshot.',
      )
    }
  }, [refresh])

  const validateSnapshotBackup = useCallback((snapshot: SafetySnapshotRecord): ActionResult<BackupPreview> => {
    return validateBackupText(JSON.stringify(snapshot.backup))
  }, [])

  return {
    summary,
    refresh,
    captureSnapshot,
    captureDailySnapshot,
    restoreLatestSnapshot,
    getLatestSafetySnapshot,
    validateSnapshotBackup,
  }
}
