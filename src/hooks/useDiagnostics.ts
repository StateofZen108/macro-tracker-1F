import { useSyncExternalStore } from 'react'
import {
  clearDiagnosticsEvents,
  exportDiagnosticsJson,
  loadDiagnosticsEventsSnapshot,
  loadDiagnosticsSummary,
  subscribeToDiagnostics,
} from '../utils/diagnostics'

export function useDiagnostics() {
  const events = useSyncExternalStore(
    subscribeToDiagnostics,
    loadDiagnosticsEventsSnapshot,
    loadDiagnosticsEventsSnapshot,
  )

  return {
    events,
    summary: loadDiagnosticsSummary(),
    clearDiagnosticsEvents,
    exportDiagnosticsJson,
  }
}
