import { APP_BUILD_ID } from '../config/buildInfo'
import type { ObservabilityContext } from '../types'
import { recordDiagnosticsEvent } from '../utils/diagnostics'

type SentryClientModule = typeof import('@sentry/react')

const SESSION_KEY = 'mt_observability_session_id'
const DEVICE_KEY = 'mt_observability_device_id'
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|email|rawtext|imagebase64|base64|foodname|name|notes|barcode|payload|sync)/i
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BASE64_DATA_URL_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

let initialized = false
let initPromise: Promise<SentryClientModule | null> | null = null

function readStoredId(key: string, prefix: string): string {
  try {
    const existing = window.localStorage.getItem(key)
    if (existing) {
      return existing
    }

    const next =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem(key, next)
    return next
  } catch {
    return `${prefix}-unavailable`
  }
}

function isStandalonePwa(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

export function buildObservabilityContext(input: {
  signedIn?: boolean
  userHash?: string
} = {}): ObservabilityContext {
  const release =
    import.meta.env.VITE_SENTRY_RELEASE ??
    import.meta.env.SENTRY_RELEASE ??
    APP_BUILD_ID

  return {
    buildId: APP_BUILD_ID,
    release,
    environment: import.meta.env.SENTRY_ENVIRONMENT ?? import.meta.env.MODE ?? 'development',
    sessionId: readStoredId(SESSION_KEY, 'session'),
    deviceId: readStoredId(DEVICE_KEY, 'device'),
    installMode: isStandalonePwa() ? 'pwa' : 'browser',
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    signedIn: input.signedIn ?? false,
    userHash: input.userHash,
  }
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, '[redacted-email]').replace(BASE64_DATA_URL_PATTERN, '[redacted-image]')
  }

  if (Array.isArray(value)) {
    return value.map(redactValue)
  }

  if (typeof value === 'object' && value !== null) {
    const output: Record<string, unknown> = {}
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(nestedValue)
    }
    return output
  }

  return value
}

export function redactClientSentryEvent<T>(event: T): T | null {
  try {
    return redactValue(event) as T
  } catch {
    void recordDiagnosticsEvent({
      eventType: 'observability.redaction_failed',
      severity: 'error',
      scope: 'diagnostics',
      message: 'Client Sentry event redaction failed; event was dropped.',
    })
    return null
  }
}

function readSampleRate(name: string, fallback: number): number {
  const value = import.meta.env[name]
  if (typeof value !== 'string') {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback
}

function isDisabled(): boolean {
  const flag = import.meta.env.VITE_FF_OBSERVABILITY_V1
  return typeof flag === 'string' && ['false', '0', 'off'].includes(flag.trim().toLowerCase())
}

function readClientObservabilityConfig():
  | {
      dsn: string
      context: ObservabilityContext
      tracesSampleRate: number
    }
  | null {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn || isDisabled()) {
    void recordDiagnosticsEvent({
      eventType: 'observability.client_disabled',
      severity: 'info',
      scope: 'diagnostics',
      message: 'Client observability is disabled because no Sentry DSN is configured or the feature is off.',
    })
    return null
  }

  return {
    dsn,
    context: buildObservabilityContext(),
    tracesSampleRate: readSampleRate('SENTRY_TRACES_SAMPLE_RATE', 0.05),
  }
}

async function ensureClientSentry(): Promise<SentryClientModule | null> {
  if (initialized) {
    return import('@sentry/react')
  }

  if (initPromise) {
    return initPromise
  }

  const config = readClientObservabilityConfig()
  if (!config) {
    return null
  }

  initPromise = import('@sentry/react').then((Sentry) => {
    if (initialized) {
      return Sentry
    }

    Sentry.init({
      dsn: config.dsn,
      environment: config.context.environment,
      release: config.context.release,
      tracesSampleRate: config.tracesSampleRate,
      sendDefaultPii: false,
      beforeSend: redactClientSentryEvent,
    })

    Sentry.setTags({
      buildId: config.context.buildId,
      installMode: config.context.installMode,
      online: String(config.context.online),
      signedIn: String(config.context.signedIn),
    })
    Sentry.setContext('app', { ...config.context })
    void recordDiagnosticsEvent({
      eventType: 'observability.client_initialized',
      severity: 'info',
      scope: 'diagnostics',
      message: 'Client observability initialized.',
      payload: {
        buildId: config.context.buildId,
        release: config.context.release,
        installMode: config.context.installMode,
      },
    })
    initialized = true
    return Sentry
  })

  return initPromise
}

export function initializeClientObservability(): boolean {
  const hasConfig = Boolean(import.meta.env.VITE_SENTRY_DSN?.trim()) && !isDisabled()
  if (!hasConfig) {
    void readClientObservabilityConfig()
    return false
  }

  void ensureClientSentry()
  return true
}

export function captureClientException(error: unknown): void {
  void ensureClientSentry().then((Sentry) => {
    Sentry?.captureException(error)
  })
}
