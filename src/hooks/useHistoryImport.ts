import { useCallback } from 'react'
import type { ActionResult, HistoryImportPreview, HistoryImportProvider } from '../types'
import {
  applyHistoryImport,
  previewHistoryImport,
  type HistoryImportSourceFile,
} from '../utils/storage/historyImport'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { loadAllFoodLogs } from '../utils/storage/logs'
import { loadWeights } from '../utils/storage/weights'

async function readFiles(files: FileList | File[]): Promise<HistoryImportSourceFile[]> {
  const entries = Array.from(files)
  return Promise.all(
    entries.map(async (file) => ({
      name: file.name,
      text: await file.text(),
    })),
  )
}

export function useHistoryImport() {
  const buildLocalImportDateSet = useCallback((): ReadonlySet<string> => {
    const logDates = Object.keys(loadAllFoodLogs())
    const weightDates = loadWeights()
      .filter((entry) => !entry.deletedAt)
      .map((entry) => entry.date)
    return new Set([...logDates, ...weightDates])
  }, [])

  const previewImport = useCallback(
    async (
      provider: HistoryImportProvider,
      files: FileList | File[],
    ): Promise<ActionResult<HistoryImportPreview>> => {
      const sourceFiles = await readFiles(files)
      const result = await previewHistoryImport(provider, sourceFiles, {
        localDates: buildLocalImportDateSet(),
        includeMacrofactorReplay: true,
      })
      void recordDiagnosticsEvent({
        eventType: result.ok ? 'history_import.preview_generated' : 'history_import.preview_failed',
        severity: result.ok ? 'info' : 'warning',
        scope: 'diagnostics',
        recordKey: provider,
        message: result.ok
          ? `History import preview generated for ${provider}.`
          : `History import preview failed for ${provider}: ${result.error.message}`,
        payload: result.ok ? result.data.counts : { errorCode: result.error.code },
      })
      return result
    },
    [buildLocalImportDateSet],
  )

  const applyImport = useCallback(
    async (preview: HistoryImportPreview): Promise<ActionResult<HistoryImportPreview['counts']>> => {
      const result = await applyHistoryImport(preview.payload)
      void recordDiagnosticsEvent({
        eventType: result.ok ? 'history_import.applied' : 'history_import.apply_failed',
        severity: result.ok ? 'info' : 'warning',
        scope: 'diagnostics',
        recordKey: preview.provider,
        message: result.ok
          ? `History import applied for ${preview.provider}.`
          : `History import apply failed for ${preview.provider}: ${result.error.message}`,
        payload: result.ok ? result.data : { errorCode: result.error.code },
      })
      return result
    },
    [],
  )

  return {
    previewImport,
    applyImport,
  }
}
