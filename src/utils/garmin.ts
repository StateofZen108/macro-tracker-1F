import type {
  GarminConnectionInfo,
  GarminImportedWeight,
  GarminModifierRecord,
  GarminWorkoutSummary,
  WellnessEntry,
} from '../types'

export interface GarminConnectResponse {
  authorizationUrl: string
  state: string
  expiresAt: string
  connection: GarminConnectionInfo
}

export interface GarminStatusResponse {
  connection: GarminConnectionInfo
  staleData: boolean
}

export interface GarminSyncResult {
  records: WellnessEntry[]
  importedWeights?: Array<Pick<GarminImportedWeight, 'date' | 'weight' | 'unit' | 'sourceUpdatedAt'>>
  modifierRecords?: Array<
    Pick<
      GarminModifierRecord,
      'date' | 'steps' | 'sleepMinutes' | 'restingHeartRate' | 'activeCalories' | 'derivedCardioMinutes' | 'sourceUpdatedAt'
    >
  >
  workoutSummaries?: Array<
    Pick<
      GarminWorkoutSummary,
      'date' | 'workoutName' | 'startedAt' | 'durationMinutes' | 'activeCalories' | 'averageHeartRate' | 'sourceUpdatedAt'
    >
  >
  connection: GarminConnectionInfo
  window: {
    startDate: string
    endDate: string
    initialBackfill: boolean
  }
}

export interface GarminApiError {
  code: string
  message: string
}

async function requestJson<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<T> {
  const { accessToken, headers, ...requestInit } = init
  const response = await fetch(path, {
    ...requestInit,
    headers: {
      ...(headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })

  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: GarminApiError }
    | null

  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : null
    const message = error?.message ?? `Garmin request failed with status ${response.status}.`
    throw new Error(message)
  }

  return payload as T
}

export function buildGarminApiPath(segment: 'connect' | 'callback' | 'status' | 'sync' | 'disconnect'): string {
  return `/api/garmin/${segment}`
}

export function requestGarminConnect(
  accessToken: string,
  redirectUri?: string,
): Promise<GarminConnectResponse> {
  const url = new URL(buildGarminApiPath('connect'), window.location.origin)
  if (redirectUri) {
    url.searchParams.set('redirectUri', redirectUri)
  }

  return requestJson<GarminConnectResponse>(url.toString(), {
    method: 'GET',
    accessToken,
  })
}

export function requestGarminStatus(accessToken: string): Promise<GarminStatusResponse> {
  return requestJson<GarminStatusResponse>(buildGarminApiPath('status'), {
    method: 'GET',
    accessToken,
  })
}

export function requestGarminSync(accessToken: string): Promise<GarminSyncResult> {
  return requestJson<GarminSyncResult>(buildGarminApiPath('sync'), {
    method: 'POST',
    accessToken,
  })
}

export function requestGarminDisconnect(accessToken: string): Promise<GarminConnectionInfo> {
  return requestJson<GarminConnectionInfo>(buildGarminApiPath('disconnect'), {
    method: 'POST',
    accessToken,
  })
}

export function buildGarminCallbackUrl(code: string, state: string): string {
  const url = new URL(buildGarminApiPath('callback'), window.location.origin)
  url.searchParams.set('code', code)
  url.searchParams.set('state', state)
  return url.toString()
}
