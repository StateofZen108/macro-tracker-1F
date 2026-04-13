// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDiagnosticsEvents,
  exportDiagnosticsJson,
  initializeDiagnosticsPersistence,
  loadDiagnosticsEventsSnapshot,
  loadDiagnosticsSummary,
  recordDiagnosticsEvent,
} from '../../src/utils/diagnostics'

describe('diagnostics store', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('macrotracker-app')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
    await initializeDiagnosticsPersistence()
    await clearDiagnosticsEvents()
  })

  it('records events and exposes a summary', async () => {
    await recordDiagnosticsEvent({
      eventType: 'sync_push_failed',
      severity: 'error',
      scope: 'diagnostics',
      message: 'Push failed.',
    })

    const summary = loadDiagnosticsSummary()
    expect(summary.totalCount).toBe(1)
    expect(summary.counts.sync_push_failed).toBe(1)
    expect(summary.lastError?.message).toBe('Push failed.')
    expect(loadDiagnosticsEventsSnapshot()).toHaveLength(1)
  })

  it('exports diagnostics as formatted json', async () => {
    await recordDiagnosticsEvent({
      eventType: 'ocr_extract_failed',
      severity: 'warning',
      scope: 'ocr',
      message: 'OCR unavailable.',
    })

    const exported = exportDiagnosticsJson()
    expect(exported).toContain('ocr_extract_failed')
    expect(exported).toContain('OCR unavailable.')
  })
})
