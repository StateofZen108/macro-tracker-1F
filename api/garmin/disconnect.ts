import { requireAuthenticatedSyncUser } from '../../server/sync/auth.js'
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

async function handlePost(_request: Request, userId: string): Promise<Response> {
  const startedAt = Date.now()
  try {
    const response = await getGarminService().disconnectConnection(userId)
    logApiEvent({
      event: 'garmin_disconnect',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof GarminServiceError) {
      logApiEvent({
        event: 'garmin_disconnect',
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
      event: 'garmin_disconnect',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to disconnect Garmin.',
    })
    return jsonResponse(502, {
      error: {
        code: 'garminDisconnectFailed',
        message: 'Unable to disconnect Garmin.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request, userId: string) {
    if (request.method !== 'POST') {
      logApiEvent({
        event: 'garmin_disconnect',
        status: 405,
        latencyMs: 0,
        scope: 'garmin',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use POST for Garmin disconnect.',
        },
      })
    }

    return handlePost(request, userId)
  },
}

export default withApiMiddleware(
  { ...API_ROUTE_CONFIGS.garminDisconnect, authenticate: requireAuthenticatedSyncUser },
  (request, context) => handler.fetch(request, context.userId ?? ''),
)
