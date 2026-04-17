import { useCallback } from 'react'
import type { ActionResult, HistoryImportPreview, HistoryImportProvider } from '../types'
import {
  applyHistoryImport,
  previewHistoryImport,
  type HistoryImportSourceFile,
} from '../utils/storage/historyImport'

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
  const previewImport = useCallback(
    async (
      provider: HistoryImportProvider,
      files: FileList | File[],
    ): Promise<ActionResult<HistoryImportPreview>> => {
      const sourceFiles = await readFiles(files)
      return previewHistoryImport(provider, sourceFiles)
    },
    [],
  )

  const applyImport = useCallback(
    async (preview: HistoryImportPreview): Promise<ActionResult<HistoryImportPreview['counts']>> =>
      applyHistoryImport(preview.payload),
    [],
  )

  return {
    previewImport,
    applyImport,
  }
}
