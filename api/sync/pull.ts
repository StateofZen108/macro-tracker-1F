import { requireAuthenticatedSyncUser, SyncAuthError } from '../../server/sync/auth.js'
import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { logApiEvent } from '../../server/http/logging.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'
import { getSyncRecordsAfterVersion } from '../../server/sync/store.js'

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
    const url = new URL(request.url)
    const afterVersion = Number.parseInt(url.searchParams.get('afterVersion') ?? '0', 10)
    if (!Number.isFinite(afterVersion) || afterVersion < 0) {
      logApiEvent({
        event: 'sync_pull',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'pull',
        message: 'Invalid afterVersion.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidSyncPullRequest',
          message: 'Sync pull requires a non-negative afterVersion query value.',
        },
      })
    }

    const response = await getSyncRecordsAfterVersion(userId, afterVersion)
    logApiEvent({
      event: 'sync_pull',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'pull',
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof SyncAuthError) {
      logApiEvent({
        event: 'sync_pull',
        status: error.status,
        latencyMs: Date.now() - startedAt,
        scope: 'pull',
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
      event: 'sync_pull',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'pull',
      message: error instanceof Error ? error.message : 'Unable to pull sync records.',
    })
    return jsonResponse(502, {
      error: {
        code: 'syncPullFailed',
        message: error instanceof Error ? error.message : 'Unable to pull sync records.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      logApiEvent({
        event: 'sync_pull',
        status: 405,
        latencyMs: 0,
        scope: 'pull',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use GET for sync pull.',
        },
      })
    }

    return handleGet(request)
  },
}

export default withApiMiddleware(API_ROUTE_CONFIGS.syncPull, (request) => handler.fetch(request))
