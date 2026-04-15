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

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0
  }

  return Math.round((numerator / denominator) * 1000) / 10
}

function isBlockingIssue(value: unknown): value is NonNullable<DiagnosticsSummary['foodTruth']>['metrics'] extends { downgradeRateByIssue: Partial<Record<infer T, number>> } ? T : never {
  return (
    value === 'missing_macros' ||
    value === 'estimated_serving' ||
    value === 'unknown_serving_basis' ||
    value === 'per100_fallback' ||
    value === 'provider_conflict' ||
    value === 'low_ocr_confidence'
  )
}

function isCatalogProvider(value: unknown): value is 'open_food_facts' | 'usda_fdc' | 'fatsecret' {
  return value === 'open_food_facts' || value === 'usda_fdc' || value === 'fatsecret'
}

function buildFoodTruthSummary(events: DiagnosticsEvent[]): DiagnosticsSummary['foodTruth'] {
  const barcodeEvents = events.filter((event) =>
    event.eventType === 'barcode_lookup_completed' ||
    event.eventType === 'barcode_lookup_downgraded' ||
    event.eventType === 'barcode_lookup_blocked',
  )
  const ocrReviewEvents = events.filter(
    (event) => event.eventType === 'ocr_review_opened' || event.eventType === 'ocr_review_saved' || event.eventType === 'ocr_review_blocked',
  )
  const exactAutologEligibleCount = barcodeEvents.filter(
    (event) => event.payload?.trustLevel === 'exact_autolog',
  ).length
  const barcodeBlockedCount = barcodeEvents.filter(
    (event) => event.eventType === 'barcode_lookup_blocked' || event.payload?.trustLevel === 'blocked',
  ).length
  const ocrBlockedCount = ocrReviewEvents.filter((event) => event.eventType === 'ocr_review_blocked').length
  const providerConflictCount = events.filter((event) => {
    if (event.eventType === 'serving_basis_conflict_detected') {
      return true
    }

    const blockingIssues = Array.isArray(event.payload?.blockingIssues)
      ? event.payload?.blockingIssues
      : []
    return blockingIssues.includes('provider_conflict')
  }).length
  const localRescanWinCount = barcodeEvents.filter((event) => event.payload?.resolvedLocally === true).length
  const downgradeRateByIssue: NonNullable<DiagnosticsSummary['foodTruth']>['metrics']['downgradeRateByIssue'] = {}
  const downgradedBarcodeEvents = barcodeEvents.filter(
    (event) => event.eventType === 'barcode_lookup_downgraded' || event.eventType === 'barcode_lookup_blocked',
  )
  for (const event of downgradedBarcodeEvents) {
    const blockingIssues = Array.isArray(event.payload?.blockingIssues)
      ? event.payload.blockingIssues
      : []
    for (const issue of blockingIssues) {
      if (!isBlockingIssue(issue)) {
        continue
      }
      downgradeRateByIssue[issue] = (downgradeRateByIssue[issue] ?? 0) + 1
    }
  }
  for (const issue of Object.keys(downgradeRateByIssue).filter(isBlockingIssue)) {
    downgradeRateByIssue[issue] = toPercent(downgradeRateByIssue[issue] ?? 0, downgradedBarcodeEvents.length)
  }

  const providerFailureRateByProvider: NonNullable<DiagnosticsSummary['foodTruth']>['metrics']['providerFailureRateByProvider'] = {}
  const providerFailures = events.filter((event) => event.eventType === 'barcode_provider_failed')
  for (const event of providerFailures) {
    const provider = event.payload?.provider
    if (!isCatalogProvider(provider)) {
      continue
    }
    providerFailureRateByProvider[provider] = (providerFailureRateByProvider[provider] ?? 0) + 1
  }
  for (const provider of Object.keys(providerFailureRateByProvider).filter(isCatalogProvider)) {
    providerFailureRateByProvider[provider] = toPercent(
      providerFailureRateByProvider[provider] ?? 0,
      barcodeEvents.length,
    )
  }

  const alerts = events
    .filter((event) => event.eventType === 'food_truth_rollout_alert')
    .map((event) => ({
      id: event.id,
      message: event.message,
      threshold:
        typeof event.payload?.threshold === 'string' ? event.payload.threshold : 'Food truth threshold breached',
    }))

  return {
    metrics: {
      barcodeLookupCount: barcodeEvents.length,
      barcodeLookupSuccessRate: toPercent(
        barcodeEvents.filter((event) => event.eventType !== 'barcode_lookup_blocked').length,
        barcodeEvents.length,
      ),
      exactAutologEligibilityRate: toPercent(exactAutologEligibleCount, barcodeEvents.length),
      barcodeBlockedRate: toPercent(barcodeBlockedCount, barcodeEvents.length),
      ocrBlockedRate: toPercent(ocrBlockedCount, ocrReviewEvents.length),
      providerConflictRate: toPercent(providerConflictCount, barcodeEvents.length + ocrReviewEvents.length),
      localRescanWinRate: toPercent(localRescanWinCount, barcodeEvents.length),
      downgradeRateByIssue,
      providerFailureRateByProvider,
    },
    alerts,
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
    foodTruth: buildFoodTruthSummary(events),
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
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      summary: loadDiagnosticsSummary(),
      events: loadDiagnosticsEventsSnapshot(),
    },
    null,
    2,
  )
}
