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
      eventType: 'barcode_lookup_completed',
      severity: 'info',
      scope: 'diagnostics',
      message: 'Barcode lookup succeeded.',
      payload: {
        barcode: '0123456789012',
        provider: 'open_food_facts',
        trustLevel: 'exact_autolog',
        servingBasis: 'serving',
        servingBasisSource: 'provider_serving',
        blockingIssues: [],
        hadCompleteMacros: true,
        resolvedLocally: false,
      },
    })

    const summary = loadDiagnosticsSummary()
    expect(summary.totalCount).toBe(1)
    expect(summary.counts.barcode_lookup_completed).toBe(1)
    expect(summary.foodTruth?.metrics.barcodeLookupCount).toBe(1)
    expect(summary.foodTruth?.metrics.exactAutologEligibilityRate).toBe(100)
    expect(summary.lastError).toBeUndefined()
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
    expect(exported).toContain('"summary"')
  })
})
