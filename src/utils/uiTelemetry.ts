import type { DiagnosticsEventType } from '../types'
import { recordDiagnosticsEvent } from './diagnostics'

export function recordUiTelemetry(eventType: DiagnosticsEventType, message: string): void {
  void recordDiagnosticsEvent({
    eventType,
    severity: 'info',
    scope: 'diagnostics',
    message,
  })
}
