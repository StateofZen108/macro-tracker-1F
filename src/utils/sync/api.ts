import type {
  BootstrapResolution,
  BootstrapStatusSummary,
  SyncPullResponse,
  SyncPushResponse,
} from '../../types.js'
import type { SyncRecordDraft } from './shared.js'

function buildHeaders(accessToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function buildErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string' &&
    payload.error.message.trim()
  ) {
    return payload.error.message.trim()
  }

  return fallback
}

export async function fetchBootstrapStatus(accessToken: string): Promise<BootstrapStatusSummary> {
  const response = await fetch('/api/sync/bootstrap/status', {
    headers: buildHeaders(accessToken),
  })
  const payload = await parseJson<BootstrapStatusSummary | { error?: { message?: string } }>(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Unable to load sync bootstrap status.'))
  }

  return payload as BootstrapStatusSummary
}

export async function pushSyncMutations(
  accessToken: string,
  deviceId: string,
  mutations: SyncPushRequest['mutations'],
): Promise<SyncPushResponse> {
  const response = await fetch('/api/sync/push', {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      deviceId,
      mutations,
    }),
  })

  const payload = await parseJson<SyncPushResponse | { error?: { message?: string } }>(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Unable to push sync mutations.'))
  }

  return payload as SyncPushResponse
}

export async function pullSyncRecords(
  accessToken: string,
  afterVersion: number,
): Promise<SyncPullResponse> {
  const response = await fetch(`/api/sync/pull?afterVersion=${encodeURIComponent(`${afterVersion}`)}`, {
    headers: buildHeaders(accessToken),
  })
  const payload = await parseJson<SyncPullResponse | { error?: { message?: string } }>(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Unable to pull synced records.'))
  }

  return payload as SyncPullResponse
}

interface SyncPushRequest {
  deviceId: string
  mutations: Array<{
    mutationId: string
    scope: string
    recordId: string
    operation: 'upsert' | 'delete'
    payload: Record<string, unknown> | null
    baseServerVersion: number | null
    queuedAt: string
  }>
}

export async function submitBootstrapResolution(
  accessToken: string,
  resolution: BootstrapResolution,
  records: SyncRecordDraft[],
): Promise<SyncPullResponse> {
  const response = await fetch('/api/sync/bootstrap', {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      resolution,
      records,
    }),
  })
  const payload = await parseJson<SyncPullResponse | { error?: { message?: string } }>(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, 'Unable to complete sync bootstrap.'))
  }

  return payload as SyncPullResponse
}
