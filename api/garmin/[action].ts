import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { logApiEvent } from '../../server/http/logging.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'
import type { ApiRequestContext } from '../../server/http/requestContext.js'
import { GarminServiceError, getGarminService } from '../../server/garmin/service.js'
import { requireAuthenticatedSyncUser } from '../../server/sync/auth.js'

export const runtime = 'nodejs'

type GarminAction = 'background-sync' | 'callback' | 'connect' | 'disconnect' | 'status' | 'sync'
type GarminHandler = (request: Request, context: ApiRequestContext) => Promise<Response>

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function readBearerToken(request: Request): string | null {
  const headerValue = request.headers.get('Authorization') ?? request.headers.get('authorization')
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function buildFallbackReturnTo(requestUrl: URL): string {
  return new URL('/', requestUrl.origin).toString()
}

function buildRedirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
    },
  })
}

function buildCallbackRedirect(
  baseUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(baseUrl)
  url.searchParams.delete('garmin_callback')
  url.searchParams.delete('garmin_callback_error')

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

function garminJsonError(
  error: unknown,
  event: string,
  startedAt: number,
  fallbackCode: string,
  fallbackMessage: string,
): Response {
  if (error instanceof GarminServiceError) {
    logApiEvent({
      event,
      status: error.status,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error.message,
    })
    return jsonResponse(error.status, {
      error: {
        code: error.code,
        message: error.message,
      },
    })
  }

  logApiEvent({
    event,
    status: 502,
    latencyMs: Date.now() - startedAt,
    scope: 'garmin',
    message: error instanceof Error ? error.message : fallbackMessage,
  })
  return jsonResponse(502, {
    error: {
      code: fallbackCode,
      message: fallbackMessage,
    },
  })
}

async function handleBackgroundSync(request: Request): Promise<Response> {
  const startedAt = Date.now()
  try {
    const configuredSecret = process.env.GARMIN_BACKGROUND_SYNC_SECRET?.trim()
    const suppliedSecret = readBearerToken(request)
    if (!configuredSecret || suppliedSecret !== configuredSecret) {
      logApiEvent({
        event: 'garmin_background_sync',
        status: 401,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: 'Missing or invalid background sync secret.',
      })
      return jsonResponse(401, {
        error: {
          code: 'invalidBackgroundSyncSecret',
          message: 'A valid background sync secret is required.',
        },
      })
    }

    const response = await getGarminService().runBackgroundSync()
    logApiEvent({
      event: 'garmin_background_sync',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    return garminJsonError(
      error,
      'garmin_background_sync',
      startedAt,
      'garminBackgroundSyncFailed',
      'Unable to run Garmin background sync.',
    )
  }
}

async function resolveReturnToUrl(requestUrl: URL, state: string | undefined): Promise<string> {
  if (!state) {
    return buildFallbackReturnTo(requestUrl)
  }

  try {
    const session = await getGarminService().getSession(state)
    return session?.returnToUrl?.trim() || buildFallbackReturnTo(requestUrl)
  } catch {
    return buildFallbackReturnTo(requestUrl)
  }
}

async function handleCallback(request: Request): Promise<Response> {
  const startedAt = Date.now()
  const requestUrl = new URL(request.url)
  const state = requestUrl.searchParams.get('state')?.trim() || undefined
  const returnToUrl = await resolveReturnToUrl(requestUrl, state)

  try {
    const errorCode = requestUrl.searchParams.get('error')
    const errorDescription = requestUrl.searchParams.get('error_description')
    if (errorCode) {
      logApiEvent({
        event: 'garmin_callback',
        status: 302,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: errorDescription ?? errorCode,
      })
      return buildRedirectResponse(
        buildCallbackRedirect(returnToUrl, {
          garmin_callback_error: 'garminAuthorizationRejected',
        }),
      )
    }

    const code = requestUrl.searchParams.get('code')?.trim()
    if (!code || !state) {
      logApiEvent({
        event: 'garmin_callback',
        status: 302,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: 'Missing code or state.',
      })
      return buildRedirectResponse(
        buildCallbackRedirect(returnToUrl, {
          garmin_callback_error: 'invalidGarminCallback',
        }),
      )
    }

    await getGarminService().completeConnectionFromCallback({
      code,
      state,
    })
    logApiEvent({
      event: 'garmin_callback',
      status: 302,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return buildRedirectResponse(
      buildCallbackRedirect(returnToUrl, {
        garmin_callback: 'connected',
      }),
    )
  } catch (error) {
    const callbackError = error instanceof GarminServiceError ? error.code : 'garminCallbackFailed'
    logApiEvent({
      event: 'garmin_callback',
      status: 302,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to complete Garmin callback.',
    })
    return buildRedirectResponse(
      buildCallbackRedirect(returnToUrl, {
        garmin_callback_error: callbackError,
      }),
    )
  }
}

async function handleConnect(request: Request, context: ApiRequestContext): Promise<Response> {
  const startedAt = Date.now()
  try {
    const url = new URL(request.url)
    const redirectUri = url.searchParams.get('redirectUri') ?? undefined
    const returnTo = url.searchParams.get('returnTo') ?? undefined
    const response = await getGarminService().createConnectionSession(
      context.userId ?? '',
      redirectUri,
      returnTo,
    )
    logApiEvent({
      event: 'garmin_connect',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    return garminJsonError(
      error,
      'garmin_connect',
      startedAt,
      'garminConnectFailed',
      'Unable to start Garmin connect.',
    )
  }
}

async function handleDisconnect(_request: Request, context: ApiRequestContext): Promise<Response> {
  const startedAt = Date.now()
  try {
    const response = await getGarminService().disconnectConnection(context.userId ?? '')
    logApiEvent({
      event: 'garmin_disconnect',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    return garminJsonError(
      error,
      'garmin_disconnect',
      startedAt,
      'garminDisconnectFailed',
      'Unable to disconnect Garmin.',
    )
  }
}

async function handleStatus(_request: Request, context: ApiRequestContext): Promise<Response> {
  const startedAt = Date.now()
  try {
    const response = await getGarminService().getConnectionStatus(context.userId ?? '')
    logApiEvent({
      event: 'garmin_status',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    return garminJsonError(
      error,
      'garmin_status',
      startedAt,
      'garminStatusFailed',
      'Unable to load Garmin status.',
    )
  }
}

async function handleSync(_request: Request, context: ApiRequestContext): Promise<Response> {
  const startedAt = Date.now()
  try {
    const response = await getGarminService().syncConnection(context.userId ?? '')
    logApiEvent({
      event: 'garmin_sync',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    return garminJsonError(
      error,
      'garmin_sync',
      startedAt,
      'garminSyncFailed',
      'Unable to sync Garmin data.',
    )
  }
}

const garminRoutes: Record<
  GarminAction,
  { config: Parameters<typeof withApiMiddleware>[0]; handler: GarminHandler }
> = {
  'background-sync': {
    config: API_ROUTE_CONFIGS.garminBackgroundSync,
    handler: handleBackgroundSync,
  },
  callback: {
    config: API_ROUTE_CONFIGS.garminCallback,
    handler: handleCallback,
  },
  connect: {
    config: { ...API_ROUTE_CONFIGS.garminConnect, authenticate: requireAuthenticatedSyncUser },
    handler: handleConnect,
  },
  disconnect: {
    config: { ...API_ROUTE_CONFIGS.garminDisconnect, authenticate: requireAuthenticatedSyncUser },
    handler: handleDisconnect,
  },
  status: {
    config: { ...API_ROUTE_CONFIGS.garminStatus, authenticate: requireAuthenticatedSyncUser },
    handler: handleStatus,
  },
  sync: {
    config: { ...API_ROUTE_CONFIGS.garminSync, authenticate: requireAuthenticatedSyncUser },
    handler: handleSync,
  },
}

function resolveGarminAction(request: Request): GarminAction | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
  const prefix = '/api/garmin/'
  if (!pathname.startsWith(prefix)) {
    return null
  }

  const action = decodeURIComponent(pathname.slice(prefix.length))
  if (action.includes('/')) {
    return null
  }

  return Object.prototype.hasOwnProperty.call(garminRoutes, action)
    ? (action as GarminAction)
    : null
}

export default {
  async fetch(request: Request): Promise<Response> {
    const action = resolveGarminAction(request)
    if (!action) {
      return jsonResponse(404, {
        error: {
          code: 'garminRouteNotFound',
          message: 'Unknown Garmin route.',
        },
      })
    }

    const route = garminRoutes[action]
    return withApiMiddleware(route.config, route.handler).fetch(request)
  },
}
