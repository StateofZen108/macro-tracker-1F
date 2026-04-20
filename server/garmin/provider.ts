import {
  createHash,
  randomBytes,
} from 'node:crypto'

import type {
  GarminProviderAdapter,
  GarminProviderAuthorizationInput,
  GarminProviderRefreshInput,
  GarminProviderSyncInput,
  GarminProviderSyncResponse,
  GarminProviderTokenExchangeInput,
  GarminTokenBundle,
  GarminWellnessEntry,
} from './types'

type FetchLike = typeof fetch

export interface GarminProviderConfig {
  clientId?: string | null
  clientSecret?: string | null
  authorizationUrl?: string | null
  tokenUrl?: string | null
  healthApiUrl?: string | null
  activityApiUrl?: string | null
  scope?: string | null
  fetchImpl?: FetchLike
}

interface ResolvedGarminProviderConfig {
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  healthApiUrl: string | null
  activityApiUrl: string | null
  scope: string
  fetchImpl: FetchLike
}

export function isGarminProviderConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    env.GARMIN_CLIENT_ID?.trim() &&
      env.GARMIN_CLIENT_SECRET?.trim() &&
      (env.GARMIN_AUTHORIZATION_URL?.trim() || buildDefaultAuthorizationUrl()) &&
      (env.GARMIN_TOKEN_URL?.trim() || buildDefaultTokenUrl()),
  )
}

export class GarminProviderError extends Error {
  status: number
  code: string

  constructor(code: string, message: string, status = 502) {
    super(message)
    this.name = 'GarminProviderError'
    this.code = code
    this.status = status
  }
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function toBase64Url(value: Buffer): string {
  return value
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function buildDefaultAuthorizationUrl() {
  return 'https://connect.garmin.com/oauth-service/oauth/authorize'
}

function buildDefaultTokenUrl() {
  return 'https://connect.garmin.com/oauth-service/oauth/token'
}

function parseRetryAfterHeader(response: Response): string | undefined {
  const headerValue = response.headers.get('Retry-After')
  if (!headerValue) {
    return undefined
  }

  const seconds = Number.parseInt(headerValue, 10)
  if (Number.isFinite(seconds)) {
    return new Date(Date.now() + seconds * 1000).toISOString()
  }

  const retryDate = new Date(headerValue)
  return Number.isNaN(retryDate.getTime()) ? undefined : retryDate.toISOString()
}

function normalizeWellnessEntry(
  entry: Record<string, unknown>,
  fallbackUpdatedAt: string,
): GarminWellnessEntry | null {
  const dateValue =
    typeof entry.date === 'string'
      ? entry.date.trim()
      : typeof entry.day === 'string'
        ? entry.day.trim()
        : typeof entry.activityDate === 'string'
          ? entry.activityDate.trim()
          : ''
  if (!dateValue) {
    return null
  }

  const updatedAt =
    typeof entry.updatedAt === 'string' && entry.updatedAt.trim()
      ? entry.updatedAt.trim()
      : typeof entry.sourceUpdatedAt === 'string' && entry.sourceUpdatedAt.trim()
        ? entry.sourceUpdatedAt.trim()
        : fallbackUpdatedAt
  const sleepRecord =
    typeof entry.sleep === 'object' && entry.sleep !== null
      ? (entry.sleep as Record<string, unknown>)
      : null

  return {
    date: dateValue,
    provider: 'garmin',
    steps: parseNumber(entry.steps),
    sleepMinutes: parseNumber(entry.sleepMinutes ?? sleepRecord?.minutes),
    restingHeartRate: parseNumber(entry.restingHeartRate ?? entry.restingHr),
    stressScore: parseNumber(entry.stressScore ?? entry.stress),
    bodyBatteryMax: parseNumber(entry.bodyBatteryMax ?? entry.bodyBattery),
    intensityMinutes: parseNumber(entry.intensityMinutes),
    derivedCardioMinutes: parseNumber(entry.derivedCardioMinutes),
    sourceUpdatedAt: updatedAt,
    updatedAt,
    deletedAt:
      typeof entry.deletedAt === 'string' && entry.deletedAt.trim()
        ? entry.deletedAt.trim()
        : undefined,
  }
}

function normalizeWellnessEntries(
  payload: unknown,
  fallbackUpdatedAt: string,
): GarminWellnessEntry[] {
  if (payload === null || typeof payload !== 'object') {
    return []
  }

  const record = payload as Record<string, unknown>
  const candidateArrays = [
    record.wellnessEntries,
    record.entries,
    record.data,
    record.records,
  ]

  const entries = candidateArrays.find(Array.isArray) as Array<Record<string, unknown>> | undefined
  if (!entries) {
    return []
  }

  return entries
    .map((entry) => normalizeWellnessEntry(entry, fallbackUpdatedAt))
    .filter((entry): entry is GarminWellnessEntry => entry !== null)
}

function mergeEntries(left: GarminWellnessEntry[], right: GarminWellnessEntry[]): GarminWellnessEntry[] {
  const merged = new Map<string, GarminWellnessEntry>()
  for (const entry of [...left, ...right]) {
    const existing = merged.get(entry.date)
    if (!existing || existing.updatedAt <= entry.updatedAt) {
      merged.set(entry.date, entry)
    }
  }

  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function buildUrlWithSearchParams(baseUrl: string, params: Record<string, string | undefined>): URL {
  const url = new URL(baseUrl)
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value)
    }
  }

  return url
}

function readTokenBundleFromResponse(
  payload: Record<string, unknown>,
  fallbackRefreshToken?: string,
): GarminTokenBundle {
  const accessToken =
    typeof payload.access_token === 'string' && payload.access_token.trim()
      ? payload.access_token.trim()
      : null
  if (!accessToken) {
    throw new GarminProviderError('invalidTokenResponse', 'Garmin did not return an access token.')
  }

  const refreshToken =
    typeof payload.refresh_token === 'string' && payload.refresh_token.trim()
      ? payload.refresh_token.trim()
      : fallbackRefreshToken
  if (!refreshToken) {
    throw new GarminProviderError('invalidTokenResponse', 'Garmin did not return a refresh token.')
  }

  const expiresIn = parseNumber(payload.expires_in) ?? 3600
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType:
      typeof payload.token_type === 'string' && payload.token_type.trim()
        ? payload.token_type.trim()
        : undefined,
    scope:
      typeof payload.scope === 'string' && payload.scope.trim()
        ? payload.scope.trim()
        : undefined,
  }
}

export function createGarminProviderAdapter(
  overrides: Partial<GarminProviderConfig> = {},
): GarminProviderAdapter {
  const config: GarminProviderConfig = {
    clientId: overrides.clientId ?? process.env.GARMIN_CLIENT_ID ?? null,
    clientSecret: overrides.clientSecret ?? process.env.GARMIN_CLIENT_SECRET ?? null,
    authorizationUrl:
      overrides.authorizationUrl ??
      process.env.GARMIN_AUTHORIZATION_URL ??
      buildDefaultAuthorizationUrl(),
    tokenUrl: overrides.tokenUrl ?? process.env.GARMIN_TOKEN_URL ?? buildDefaultTokenUrl(),
    healthApiUrl: overrides.healthApiUrl ?? process.env.GARMIN_HEALTH_API_URL ?? null,
    activityApiUrl: overrides.activityApiUrl ?? process.env.GARMIN_ACTIVITY_API_URL ?? null,
    scope: overrides.scope ?? process.env.GARMIN_OAUTH_SCOPE ?? 'read',
    fetchImpl: overrides.fetchImpl ?? fetch,
  }

  function requireProviderConfig(): ResolvedGarminProviderConfig {
    const clientId = config.clientId?.trim()
    const clientSecret = config.clientSecret?.trim()
    const authorizationUrl = config.authorizationUrl?.trim()
    const tokenUrl = config.tokenUrl?.trim()
    const fetchImpl = config.fetchImpl
    if (!clientId || !clientSecret || !authorizationUrl || !tokenUrl || !fetchImpl) {
      throw new GarminProviderError(
        'providerUnavailable',
        'Garmin Connect credentials are not configured for this environment.',
        503,
      )
    }

    return {
      clientId,
      clientSecret,
      authorizationUrl,
      tokenUrl,
      healthApiUrl: config.healthApiUrl?.trim() || null,
      activityApiUrl: config.activityApiUrl?.trim() || null,
      scope: config.scope?.trim() || 'read',
      fetchImpl,
    }
  }

  return {
    buildAuthorizationUrl(input: GarminProviderAuthorizationInput): string {
      const resolved = requireProviderConfig()
      const url = new URL(resolved.authorizationUrl)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', resolved.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('scope', input.scope || resolved.scope || 'read')
      url.searchParams.set('state', input.state)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', input.codeChallengeMethod)
      return url.toString()
    },

    async exchangeCodeForTokens(input: GarminProviderTokenExchangeInput): Promise<GarminTokenBundle> {
      const resolved = requireProviderConfig()
      const response = await resolved.fetchImpl(resolved.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          code_verifier: input.codeVerifier,
          redirect_uri: input.redirectUri,
          client_id: resolved.clientId,
          client_secret: resolved.clientSecret,
        }),
      })

      if (!response.ok) {
        throw new GarminProviderError(
          'tokenExchangeFailed',
          `Garmin token exchange failed with status ${response.status}.`,
          response.status,
        )
      }

      const payload = (await response.json()) as Record<string, unknown>
      return readTokenBundleFromResponse(payload)
    },

    async refreshAccessToken(input: GarminProviderRefreshInput): Promise<GarminTokenBundle> {
      const resolved = requireProviderConfig()
      const response = await resolved.fetchImpl(resolved.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: input.refreshToken,
          client_id: resolved.clientId,
          client_secret: resolved.clientSecret,
        }),
      })

      if (!response.ok) {
        throw new GarminProviderError(
          'tokenRefreshFailed',
          `Garmin token refresh failed with status ${response.status}.`,
          response.status,
        )
      }

      const payload = (await response.json()) as Record<string, unknown>
      return readTokenBundleFromResponse(payload, input.refreshToken)
    },

    async fetchWellnessData(input: GarminProviderSyncInput): Promise<GarminProviderSyncResponse> {
      const resolved = requireProviderConfig()
      if (!resolved.healthApiUrl && !resolved.activityApiUrl) {
        throw new GarminProviderError(
          'providerUnavailable',
          'Garmin wellness endpoints are not configured for this environment.',
          503,
        )
      }

      const startedAt = new Date().toISOString()
      const responses: GarminProviderSyncResponse[] = []

      async function fetchEndpoint(
        endpointUrl: string,
        kind: 'health' | 'activity',
      ): Promise<void> {
        const url = buildUrlWithSearchParams(endpointUrl, {
          startDate: input.startDate,
          endDate: input.endDate,
          cursor: kind === 'health' ? input.healthCursor : input.activityCursor,
        })
        const response = await resolved.fetchImpl(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            Accept: 'application/json',
          },
        })

        if (response.status === 429) {
          responses.push({
            wellnessEntries: [],
            rateLimitedUntil: parseRetryAfterHeader(response) ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          })
          return
        }

        if (!response.ok) {
          throw new GarminProviderError(
            `${kind}FetchFailed`,
            `Garmin ${kind} data request failed with status ${response.status}.`,
            response.status,
          )
        }

        const payload = (await response.json()) as Record<string, unknown>
        const wellnessEntries = normalizeWellnessEntries(payload, startedAt)
        responses.push({
          wellnessEntries,
          nextHealthCursor:
            kind === 'health' && typeof payload.nextCursor === 'string'
              ? payload.nextCursor
              : undefined,
          nextActivityCursor:
            kind === 'activity' && typeof payload.nextCursor === 'string'
              ? payload.nextCursor
              : undefined,
        })
      }

      if (resolved.healthApiUrl) {
        await fetchEndpoint(resolved.healthApiUrl, 'health')
      }

      if (resolved.activityApiUrl) {
        await fetchEndpoint(resolved.activityApiUrl, 'activity')
      }

      const rateLimited = responses.find((response) => response.rateLimitedUntil)
      if (rateLimited) {
        return {
          wellnessEntries: [],
          rateLimitedUntil: rateLimited.rateLimitedUntil,
        }
      }

      const mergedEntries = mergeEntries(
        responses.flatMap((response) => response.wellnessEntries),
        [],
      )

      return {
        wellnessEntries: mergedEntries,
        nextHealthCursor: responses.find((response) => response.nextHealthCursor)?.nextHealthCursor,
        nextActivityCursor: responses.find((response) => response.nextActivityCursor)?.nextActivityCursor,
      }
    },
  }
}

export function buildGarminAuthorizationUrl(
  input: GarminProviderAuthorizationInput,
  configOverrides: Partial<GarminProviderConfig> = {},
): string {
  return createGarminProviderAdapter(configOverrides).buildAuthorizationUrl(input)
}

export function buildGarminPkceChallenge(): {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
} {
  const codeVerifier = toBase64Url(randomBytes(32))
  const challenge = toBase64Url(createHash('sha256').update(codeVerifier).digest())
  return {
    codeVerifier,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
  }
}
