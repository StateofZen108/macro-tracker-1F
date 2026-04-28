import { requireAuthenticatedSyncUser, SyncAuthError } from '../../server/sync/auth.js'
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

async function handlePost(request: Request): Promise<Response> {
  const startedAt = Date.now()
  try {
    const { userId } = await requireAuthenticatedSyncUser(request)
    const response = await getGarminService().syncConnection(userId)
    logApiEvent({
      event: 'garmin_sync',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof SyncAuthError || error instanceof GarminServiceError) {
      logApiEvent({
        event: 'garmin_sync',
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
      event: 'garmin_sync',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to sync Garmin data.',
    })
    return jsonResponse(502, {
      error: {
        code: 'garminSyncFailed',
        message: error instanceof Error ? error.message : 'Unable to sync Garmin data.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      logApiEvent({
        event: 'garmin_sync',
        status: 405,
        latencyMs: 0,
        scope: 'garmin',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use POST for Garmin sync.',
        },
      })
    }

    return handlePost(request)
  },
}

export default withApiMiddleware(API_ROUTE_CONFIGS.garminSync, (request) => handler.fetch(request))
