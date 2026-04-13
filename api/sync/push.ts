import { requireAuthenticatedSyncUser, SyncAuthError } from '../../server/sync/auth.js'
import { logApiEvent } from '../../server/http/logging.js'
import { pushUserMutations } from '../../server/sync/store.js'
import type { SyncScope } from '../../src/types.js'

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

function normalizeMutations(body: unknown): Array<{
  mutationId: string
  scope: SyncScope
  recordId: string
  operation: 'upsert' | 'delete'
  payload: Record<string, unknown> | null
  baseServerVersion: number | null
  queuedAt: string
}> | null {
  if (!isRecord(body) || !Array.isArray(body.mutations)) {
    return null
  }

  const normalized = body.mutations.flatMap((mutation) => {
    if (!isRecord(mutation)) {
      return []
    }

    const mutationId =
      typeof mutation.mutationId === 'string' && mutation.mutationId.trim()
        ? mutation.mutationId
        : null
    const scope =
      typeof mutation.scope === 'string' && mutation.scope.trim()
        ? (mutation.scope as SyncScope)
        : null
    const recordId =
      typeof mutation.recordId === 'string' && mutation.recordId.trim()
        ? mutation.recordId
        : null
    const operation =
      mutation.operation === 'delete' || mutation.operation === 'upsert'
        ? mutation.operation
        : null
    const queuedAt =
      typeof mutation.queuedAt === 'string' && mutation.queuedAt.trim()
        ? mutation.queuedAt
        : null
    if (!mutationId || !scope || !recordId || !operation || !queuedAt) {
      return []
    }

    return [
      {
        mutationId,
        scope,
        recordId,
        operation: operation as 'upsert' | 'delete',
        payload: isRecord(mutation.payload) ? mutation.payload : null,
        baseServerVersion:
          typeof mutation.baseServerVersion === 'number' && Number.isFinite(mutation.baseServerVersion)
            ? mutation.baseServerVersion
            : null,
        queuedAt,
      },
    ]
  })

  return normalized.length === body.mutations.length ? normalized : null
}

async function handlePost(request: Request): Promise<Response> {
  const startedAt = Date.now()
  try {
    const { userId } = await requireAuthenticatedSyncUser(request)
    const body = (await request.json()) as unknown
    const deviceId =
      isRecord(body) && typeof body.deviceId === 'string' && body.deviceId.trim()
        ? body.deviceId
        : null
    const mutations = normalizeMutations(body)

    if (!deviceId || !mutations) {
      logApiEvent({
        event: 'sync_push',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'push',
        deviceId: deviceId ?? undefined,
        message: 'Invalid sync push request.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidSyncPushRequest',
          message: 'Sync push requires a deviceId and a valid mutations array.',
        },
      })
    }

    const response = await pushUserMutations(userId, deviceId, mutations)
    logApiEvent({
      event: 'sync_push',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'push',
      deviceId,
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof SyncAuthError) {
      logApiEvent({
        event: 'sync_push',
        status: error.status,
        latencyMs: Date.now() - startedAt,
        scope: 'push',
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
      event: 'sync_push',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'push',
      message: error instanceof Error ? error.message : 'Unable to push sync mutations.',
    })
    return jsonResponse(502, {
      error: {
        code: 'syncPushFailed',
        message: error instanceof Error ? error.message : 'Unable to push sync mutations.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      logApiEvent({
        event: 'sync_push',
        status: 405,
        latencyMs: 0,
        scope: 'push',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use POST for sync push.',
        },
      })
    }

    return handlePost(request)
  },
}

export default handler
