import { requireAuthenticatedSyncUser, SyncAuthError } from '../../../server/sync/auth.js'
import { logApiEvent } from '../../../server/http/logging.js'
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

async function handleGet(request: Request): Promise<Response> {
  const startedAt = Date.now()
  try {
    const { userId } = await requireAuthenticatedSyncUser(request)
    const response = await getBootstrapStatusForUser(userId)
    logApiEvent({
      event: 'sync_bootstrap_status',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'bootstrap_status',
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof SyncAuthError) {
      logApiEvent({
        event: 'sync_bootstrap_status',
        status: error.status,
        latencyMs: Date.now() - startedAt,
        scope: 'bootstrap_status',
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
      event: 'sync_bootstrap_status',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'bootstrap_status',
      message: error instanceof Error ? error.message : 'Unable to load bootstrap status.',
    })
    return jsonResponse(502, {
      error: {
        code: 'bootstrapStatusFailed',
        message: error instanceof Error ? error.message : 'Unable to load bootstrap status.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
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

    return handleGet(request)
  },
}

export default handler
