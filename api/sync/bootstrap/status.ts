import { requireAuthenticatedSyncUser } from '../../../server/sync/auth.js'
import { withApiMiddleware } from '../../../server/http/apiMiddleware.js'
import { logApiEvent } from '../../../server/http/logging.js'
import { API_ROUTE_CONFIGS } from '../../../server/http/routeConfigs.js'
import { getBootstrapStatusForUser } from '../../../server/sync/store.js'

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

async function handleGet(_request: Request, userId: string): Promise<Response> {
  const startedAt = Date.now()
  try {
    const response = await getBootstrapStatusForUser(userId)
    logApiEvent({
      event: 'sync_bootstrap_status',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'bootstrap_status',
    })
    return jsonResponse(200, response)
  } catch (error) {
    logApiEvent({
      event: 'sync_bootstrap_status',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'bootstrap_status',
      message: error instanceof Error ? error.message : 'Unable to load bootstrap status.',
    })
    return jsonResponse(502, {
      error: {
        code: 'bootstrapStatusFailed',
        message: 'Unable to load bootstrap status.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request, userId: string) {
    if (request.method !== 'GET') {
      logApiEvent({
        event: 'sync_bootstrap_status',
        status: 405,
        latencyMs: 0,
        scope: 'bootstrap_status',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use GET for bootstrap status.',
        },
      })
    }

    return handleGet(request, userId)
  },
}

export default withApiMiddleware(
  { ...API_ROUTE_CONFIGS.syncBootstrapStatus, authenticate: requireAuthenticatedSyncUser },
  (request, context) => handler.fetch(request, context.userId ?? ''),
)
