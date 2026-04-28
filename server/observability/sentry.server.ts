import * as Sentry from '@sentry/node'
import type { ApiRequestContext } from '../http/requestContext.js'

let initialized = false

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|email|rawtext|imagebase64|base64|foodname|name|notes|barcode|payload|sync)/i
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const BASE64_DATA_URL_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

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

export function redactSentryEvent<T>(event: T): T | null {
  try {
    return redactValue(event) as T
  } catch {
    return null
  }
}

function readSampleRate(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback
}

export function initializeServerObservability(): boolean {
  if (initialized) {
    return true
  }

  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn || process.env.OBSERVABILITY_DISABLED === 'true') {
    return false
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.VITE_APP_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: readSampleRate('SENTRY_TRACES_SAMPLE_RATE', 0.05),
    profilesSampleRate: readSampleRate('SENTRY_PROFILES_SAMPLE_RATE', 0),
    sendDefaultPii: false,
    beforeSend: redactSentryEvent,
  })
  initialized = true
  return true
}

export function setServerRequestContext(context: ApiRequestContext): void {
  if (!initializeServerObservability()) {
    return
  }

  Sentry.setTags({
    requestId: context.requestId,
    routeId: context.routeId,
  })
  Sentry.setContext('apiRequest', {
    requestId: context.requestId,
    routeId: context.routeId,
    ipHash: context.ipHash,
    userId: context.userId,
    deviceId: context.deviceId,
  })
}

export function captureServerException(error: unknown, context?: ApiRequestContext): void {
  if (!initializeServerObservability()) {
    return
  }

  Sentry.withScope((scope) => {
    if (context) {
      scope.setTag('requestId', context.requestId)
      scope.setTag('routeId', context.routeId)
      scope.setContext('apiRequest', {
        requestId: context.requestId,
        routeId: context.routeId,
        ipHash: context.ipHash,
        userId: context.userId,
        deviceId: context.deviceId,
      })
    }
    Sentry.captureException(error)
  })
}
