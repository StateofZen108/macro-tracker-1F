import { requireAuthenticatedSyncUser } from '../../server/sync/auth.js'
import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { logApiEvent } from '../../server/http/logging.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'
import { completeBootstrapWithCloudState, replaceBootstrapRecordsForUser } from '../../server/sync/store.js'
import type { BootstrapResolution, SyncScope } from '../../src/types.js'
import type { SyncRecordDraft } from '../../src/utils/sync/shared.js'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRecords(value: unknown): SyncRecordDraft[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const normalized = value.flatMap((record) => {
    if (!isRecord(record)) {
      return []
    }

    const scope =
      typeof record.scope === 'string' && record.scope.trim()
        ? (record.scope as SyncScope)
        : null
    const recordId =
      typeof record.recordId === 'string' && record.recordId.trim()
        ? record.recordId
        : null
    if (!scope || !recordId || !isRecord(record.payload)) {
      return []
    }

    return [
      {
        scope,
        recordId,
        payload: record.payload,
        deletedAt:
          typeof record.deletedAt === 'string' && record.deletedAt.trim()
            ? record.deletedAt
            : undefined,
      },
    ]
  })

  return normalized.length === value.length ? normalized : null
}

async function handlePost(request: Request, userId: string): Promise<Response> {
  const startedAt = Date.now()
  try {
    const body = (await request.json()) as unknown
    if (!isRecord(body)) {
      logApiEvent({
        event: 'sync_bootstrap',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'bootstrap',
        message: 'Missing bootstrap JSON body.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidBootstrapRequest',
          message: 'Sync bootstrap requires a JSON body.',
        },
      })
    }

    const resolution =
      body.resolution === 'useCloudOnThisDevice' ||
      body.resolution === 'mergeThisDeviceIntoCloud' ||
      body.resolution === 'replaceCloudWithThisDevice'
        ? (body.resolution as BootstrapResolution)
        : null

    if (!resolution) {
      logApiEvent({
        event: 'sync_bootstrap',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'bootstrap',
        message: 'Invalid bootstrap resolution.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidBootstrapResolution',
          message: 'Choose a valid bootstrap resolution before continuing.',
        },
      })
    }

    if (resolution === 'useCloudOnThisDevice') {
      const response = await completeBootstrapWithCloudState(userId)
      logApiEvent({
        event: 'sync_bootstrap',
        status: 200,
        latencyMs: Date.now() - startedAt,
        scope: 'bootstrap',
      })
      return jsonResponse(200, response)
    }

    const records = normalizeRecords(body.records)
    if (!records) {
      logApiEvent({
        event: 'sync_bootstrap',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'bootstrap',
        message: 'Invalid bootstrap records.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidBootstrapRecords',
          message: 'Bootstrap replace and merge require a valid records array.',
        },
      })
    }

    const response = await replaceBootstrapRecordsForUser(userId, records)
    logApiEvent({
      event: 'sync_bootstrap',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'bootstrap',
    })
    return jsonResponse(200, response)
  } catch (error) {
    logApiEvent({
      event: 'sync_bootstrap',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'bootstrap',
      message: error instanceof Error ? error.message : 'Unable to complete bootstrap.',
    })
    return jsonResponse(502, {
      error: {
        code: 'bootstrapFailed',
        message: 'Unable to complete bootstrap.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request, userId: string) {
    if (request.method !== 'POST') {
      logApiEvent({
        event: 'sync_bootstrap',
        status: 405,
        latencyMs: 0,
        scope: 'bootstrap',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use POST for sync bootstrap.',
        },
      })
    }

    return handlePost(request, userId)
  },
}

export default withApiMiddleware(
  { ...API_ROUTE_CONFIGS.syncBootstrap, authenticate: requireAuthenticatedSyncUser },
  (request, context) => handler.fetch(request, context.userId ?? ''),
)
