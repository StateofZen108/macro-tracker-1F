import { useCallback } from 'react'
import type { ActionResult, BackupFile, BackupPreview, ImportMode } from '../types'
import {
  applyBackupImport,
  exportBackupFile,
  validateBackupText,
} from '../utils/storage/importExport'

export function useImportExport() {
  const exportBackup = useCallback((): ActionResult<BackupFile> => exportBackupFile(), [])

  const validateBackup = useCallback(
    (rawText: string): ActionResult<BackupPreview> => validateBackupText(rawText),
    [],
  )

  const applyImport = useCallback(
    (backup: BackupFile, mode: ImportMode): Promise<ActionResult<BackupPreview['counts']>> =>
      applyBackupImport(backup, mode),
    [],
  )

  return {
    exportBackup,
    validateBackup,
    applyImport,
  }
}
