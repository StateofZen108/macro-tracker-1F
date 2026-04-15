import { requireAuthenticatedSyncUser, SyncAuthError } from '../../server/sync/auth.js'
import { logApiEvent } from '../../server/http/logging.js'
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

async function handleGet(request: Request): Promise<Response> {
  const startedAt = Date.now()
  try {
    const { userId } = await requireAuthenticatedSyncUser(request)
    const response = await getGarminService().getConnectionStatus(userId)
    logApiEvent({
      event: 'garmin_status',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof SyncAuthError || error instanceof GarminServiceError) {
      logApiEvent({
        event: 'garmin_status',
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
      event: 'garmin_status',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to load Garmin status.',
    })
    return jsonResponse(502, {
      error: {
        code: 'garminStatusFailed',
        message: error instanceof Error ? error.message : 'Unable to load Garmin status.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      logApiEvent({
        event: 'garmin_status',
        status: 405,
        latencyMs: 0,
        scope: 'garmin',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use GET for Garmin status.',
        },
      })
    }

    return handleGet(request)
  },
}

export default handler
