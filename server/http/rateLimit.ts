import { ApiError } from './errors.js'
import type { ApiRequestContext } from './requestContext.js'

export type ApiRateLimitScope = 'ip' | 'user' | 'user_or_ip'

export interface ApiRateLimitConfig {
  limit: number
  windowSeconds: number
  scope: ApiRateLimitScope
  failClosedWithoutStore?: boolean
}

interface InMemoryBucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, InMemoryBucket>()

function isProductionRuntime(): boolean {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production' ||
    process.env.MODE === 'production'
  )
}

function isRateLimitDisabled(): boolean {
  const value = process.env.API_RATE_LIMIT_DISABLED?.trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'on'
}

function resolveScopeKey(config: ApiRateLimitConfig, context: ApiRequestContext): string {
  if (config.scope === 'ip') {
    return `ip:${context.ipHash}`
  }

  if (config.scope === 'user') {
    return context.userId ? `user:${context.userId}` : `ip:${context.ipHash}`
  }

  return context.userId ? `user:${context.userId}` : `ip:${context.ipHash}`
}

async function checkUpstashRateLimit(
  key: string,
  config: ApiRateLimitConfig,
): Promise<{ limited: boolean; retryAfterSeconds?: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '')
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new ApiError(
      503,
      'rateLimitUnavailable',
      'Rate limiting is not configured for this environment.',
    )
  }

  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, `${config.windowSeconds}`, 'NX'],
      ['TTL', key],
    ]),
  })

  if (!response.ok) {
    throw new ApiError(503, 'rateLimitUnavailable', 'Rate limiting is unavailable.')
  }

  const result = (await response.json()) as Array<{ result?: unknown }>
  const count = typeof result[0]?.result === 'number' ? result[0].result : Number(result[0]?.result)
  const ttl = typeof result[2]?.result === 'number' ? result[2].result : Number(result[2]?.result)
  if (!Number.isFinite(count)) {
    throw new ApiError(503, 'rateLimitUnavailable', 'Rate limiting returned an invalid response.')
  }

  return {
    limited: count > config.limit,
    retryAfterSeconds:
      Number.isFinite(ttl) && ttl > 0 ? Math.max(1, Math.ceil(ttl)) : config.windowSeconds,
  }
}

function checkInMemoryRateLimit(
  key: string,
  config: ApiRateLimitConfig,
): { limited: boolean; retryAfterSeconds?: number } {
  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + config.windowSeconds * 1000,
    })
    return { limited: false }
  }

  existing.count += 1
  if (existing.count <= config.limit) {
    return { limited: false }
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

export async function enforceRateLimit(
  context: ApiRequestContext,
  config?: ApiRateLimitConfig,
): Promise<void> {
  if (!config || isRateLimitDisabled()) {
    return
  }

  const key = `mt:${context.routeId}:${resolveScopeKey(config, context)}`
  const hasUpstashStore =
    Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim())
  const result =
    hasUpstashStore
      ? await checkUpstashRateLimit(key, config)
      : isProductionRuntime() && config.failClosedWithoutStore
        ? (() => {
            throw new ApiError(
              503,
              'rateLimitUnavailable',
              'Rate limiting is not configured for this route.',
            )
          })()
        : checkInMemoryRateLimit(key, config)

  if (result.limited) {
    throw new ApiError(429, 'rateLimited', 'Too many requests. Try again shortly.', {
      retryAfterSeconds: result.retryAfterSeconds ?? config.windowSeconds,
    })
  }
}

export function resetInMemoryRateLimitForTests(): void {
  buckets.clear()
}

