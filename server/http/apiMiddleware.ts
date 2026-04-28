import { captureServerException, setServerRequestContext } from '../observability/sentry.server.js'
import { ApiError, buildApiErrorEnvelope, jsonResponse } from './errors.js'
import { logApiEvent } from './logging.js'
import { enforceRateLimit, type ApiRateLimitConfig } from './rateLimit.js'
import { buildApiRequestContext, type ApiRequestContext } from './requestContext.js'

export interface ApiMiddlewareConfig {
  routeId: string
  allowedMethods: string[]
  timeoutMs: number
  bodyLimitBytes?: number
  queryStringLimitBytes?: number
  rateLimit?: ApiRateLimitConfig
}

export type ApiHandler = (request: Request, context: ApiRequestContext) => Promise<Response>

function isMiddlewareDisabled(): boolean {
  const value = process.env.API_MIDDLEWARE_DISABLED?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'on'
}

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production' ||
    process.env.MODE === 'production'
  )
}

function normalizeMethod(method: string): string {
  return method.trim().toUpperCase()
}

async function appendRequestIdHeader(response: Response, requestId: string): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', requestId)

  if (response.status >= 400 && headers.get('Content-Type')?.includes('application/json')) {
    const text = await response.text()
    try {
      const payload = JSON.parse(text) as { error?: Record<string, unknown> }
      if (payload.error && typeof payload.error.requestId !== 'string') {
        payload.error.requestId = requestId
        return new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }
    } catch {
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function enforceBodyLimit(request: Request, limitBytes?: number): Promise<void> {
  if (!limitBytes || request.method === 'GET' || request.method === 'HEAD') {
    return
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    throw new ApiError(413, 'payloadTooLarge', 'Request payload is too large.')
  }

  const bodyText = await request.clone().text()
  const bodyBytes = new TextEncoder().encode(bodyText).byteLength
  if (bodyBytes > limitBytes) {
    throw new ApiError(413, 'payloadTooLarge', 'Request payload is too large.')
  }
}

function enforceQueryStringLimit(request: Request, limitBytes?: number): void {
  if (!limitBytes) {
    return
  }

  const url = new URL(request.url)
  const queryBytes = new TextEncoder().encode(url.search).byteLength
  if (queryBytes > limitBytes) {
    throw new ApiError(414, 'queryTooLarge', 'Request query string is too large.')
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new ApiError(504, 'requestTimedOut', 'The request timed out.'))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

function errorToResponse(error: unknown, context: ApiRequestContext): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      error.status,
      buildApiErrorEnvelope({
        code: error.code,
        message: error.message,
        requestId: context.requestId,
        retryAfterSeconds: error.retryAfterSeconds,
      }),
      error.retryAfterSeconds
        ? {
            'Retry-After': `${error.retryAfterSeconds}`,
          }
        : {},
    )
  }

  const message = error instanceof Error ? error.message : 'Unexpected API failure.'
  return jsonResponse(500, buildApiErrorEnvelope({
    code: 'internalServerError',
    message,
    requestId: context.requestId,
  }))
}

export function withApiMiddleware(config: ApiMiddlewareConfig, handler: ApiHandler) {
  const allowedMethods = new Set(config.allowedMethods.map(normalizeMethod))

  return {
    async fetch(request: Request): Promise<Response> {
      const context = buildApiRequestContext(request, config.routeId)
      const startedAt = context.startedAt

      if (isMiddlewareDisabled() && !isProductionRuntime()) {
        logApiEvent({
          event: 'api.middleware_disabled',
          status: 200,
          latencyMs: 0,
          scope: config.routeId,
        })
        return handler(request, context)
      }

      try {
        setServerRequestContext(context)
        if (!allowedMethods.has(normalizeMethod(request.method))) {
          throw new ApiError(405, 'methodNotAllowed', `Use ${[...allowedMethods].join(', ')} for this route.`)
        }

        enforceQueryStringLimit(request, config.queryStringLimitBytes)
        await enforceBodyLimit(request, config.bodyLimitBytes)
        await enforceRateLimit(context, config.rateLimit)

        const response = await withTimeout(handler(request, context), config.timeoutMs)
        return appendRequestIdHeader(response, context.requestId)
      } catch (error) {
        if (!(error instanceof ApiError)) {
          captureServerException(error, context)
        }

        const response = await appendRequestIdHeader(errorToResponse(error, context), context.requestId)
        logApiEvent({
          event: 'api.error_captured',
          status: response.status,
          latencyMs: Date.now() - startedAt,
          scope: config.routeId,
          recordId: context.requestId,
          message: error instanceof Error ? error.message : 'API request failed.',
        })
        return response
      }
    },
  }
}
