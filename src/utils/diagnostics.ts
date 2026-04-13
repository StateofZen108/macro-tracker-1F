import { appendDiagnosticsEvent, clearPersistedDiagnosticsEvents, loadDiagnosticsEvents } from './persistence/appDb'
import type {
  DiagnosticsEvent,
  DiagnosticsEventType,
  DiagnosticsSeverity,
  DiagnosticsSummary,
} from '../types'

const DIAGNOSTICS_CHANNEL_NAME = 'macrotracker-diagnostics'
const DIAGNOSTICS_CHANNEL_SOURCE =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `macrotracker-diagnostics-${Date.now()}`

type DiagnosticsListener = () => void

const diagnosticsListeners = new Set<DiagnosticsListener>()
let diagnosticsChannel: BroadcastChannel | null = null
let diagnosticsBound = false
let diagnosticsInitialized = false
let diagnosticsInitPromise: Promise<void> | null = null
let diagnosticsSnapshot: DiagnosticsEvent[] = []

function notifyListeners(): void {
  for (const listener of diagnosticsListeners) {
    listener()
  }
}

function broadcastDiagnosticsChange(): void {
  diagnosticsChannel?.postMessage({
    type: 'diagnostics-updated',
    source: DIAGNOSTICS_CHANNEL_SOURCE,
  })
}

async function refreshDiagnosticsSnapshot(): Promise<void> {
  diagnosticsSnapshot = await loadDiagnosticsEvents()
}

function bindDiagnosticsChannel(): void {
  if (diagnosticsBound || typeof window === 'undefined') {
    return
  }

  diagnosticsBound = true
  if (typeof BroadcastChannel !== 'undefined') {
    diagnosticsChannel = new BroadcastChannel(DIAGNOSTICS_CHANNEL_NAME)
    diagnosticsChannel.addEventListener('message', (event: MessageEvent<{ type?: string; source?: string }>) => {
      if (event.data?.type === 'diagnostics-updated' && event.data.source !== DIAGNOSTICS_CHANNEL_SOURCE) {
        void refreshDiagnosticsSnapshot().then(() => {
          notifyListeners()
        })
      }
    })
  }
}

export async function initializeDiagnosticsPersistence(): Promise<void> {
  if (diagnosticsInitialized) {
    await refreshDiagnosticsSnapshot().catch(() => {
      diagnosticsSnapshot = []
    })
    bindDiagnosticsChannel()
    return
  }

  if (!diagnosticsInitPromise) {
    diagnosticsInitPromise = refreshDiagnosticsSnapshot()
      .catch(() => {
        diagnosticsSnapshot = []
      })
      .then(() => {
        diagnosticsInitialized = true
        bindDiagnosticsChannel()
      })
  }

  await diagnosticsInitPromise
}

function ensureDiagnosticsInitialized(): void {
  if (!diagnosticsInitialized) {
    diagnosticsInitialized = true
    bindDiagnosticsChannel()
  }
}

export function subscribeToDiagnostics(listener: DiagnosticsListener): () => void {
  ensureDiagnosticsInitialized()
  diagnosticsListeners.add(listener)
  return () => {
    diagnosticsListeners.delete(listener)
  }
}

export function loadDiagnosticsEventsSnapshot(): DiagnosticsEvent[] {
  ensureDiagnosticsInitialized()
  return diagnosticsSnapshot
}

export function loadDiagnosticsSummary(): DiagnosticsSummary {
  const events = loadDiagnosticsEventsSnapshot()
  const counts = events.reduce<DiagnosticsSummary['counts']>((summary, event) => {
    summary[event.eventType] = (summary[event.eventType] ?? 0) + 1
    return summary
  }, {})

  return {
    totalCount: events.length,
    lastEventAt: events[0]?.createdAt,
    lastError: events.find((event) => event.severity === 'error'),
    counts,
  }
}

export async function recordDiagnosticsEvent(input: {
  eventType: DiagnosticsEventType
  severity: DiagnosticsSeverity
  scope: DiagnosticsEvent['scope']
  message: string
  recordKey?: string
  payload?: Record<string, unknown>
}): Promise<void> {
  const event: DiagnosticsEvent = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `diagnostics-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...input,
  }

  diagnosticsSnapshot = [event, ...diagnosticsSnapshot].slice(0, 2000)
  notifyListeners()
  broadcastDiagnosticsChange()
  await appendDiagnosticsEvent(event).catch(() => undefined)
}

export async function clearDiagnosticsEvents(): Promise<void> {
  diagnosticsSnapshot = []
  notifyListeners()
  broadcastDiagnosticsChange()
  await clearPersistedDiagnosticsEvents().catch(() => undefined)
}

export function exportDiagnosticsJson(): string {
  return JSON.stringify(loadDiagnosticsEventsSnapshot(), null, 2)
}
