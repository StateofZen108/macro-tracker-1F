import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { logApiEvent } from '../../server/http/logging.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'
import { GarminServiceError, getGarminService } from '../../server/garmin/service.js'

export const runtime = 'nodejs'

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

async function handlePost(request: Request): Promise<Response> {
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
    if (error instanceof GarminServiceError) {
      logApiEvent({
        event: 'garmin_background_sync',
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
      event: 'garmin_background_sync',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to run Garmin background sync.',
    })
    return jsonResponse(502, {
      error: {
        code: 'garminBackgroundSyncFailed',
        message: 'Unable to run Garmin background sync.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      logApiEvent({
        event: 'garmin_background_sync',
        status: 405,
        latencyMs: 0,
        scope: 'garmin',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use POST for Garmin background sync.',
        },
      })
    }

    return handlePost(request)
  },
}

export default withApiMiddleware(API_ROUTE_CONFIGS.garminBackgroundSync, (request) => handler.fetch(request))
