import { createHash, randomUUID } from 'node:crypto'

export interface ApiRequestContext {
  requestId: string
  routeId: string
  startedAt: number
  ipHash: string
  userId?: string
  deviceId?: string
}

function readHeader(request: Request, name: string): string | null {
  return request.headers.get(name) ?? request.headers.get(name.toLowerCase())
}

function readClientIp(request: Request): string {
  const forwardedFor = readHeader(request, 'x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return (
    readHeader(request, 'x-real-ip') ??
    readHeader(request, 'cf-connecting-ip') ??
    'unknown'
  )
}

export function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

export function readBearerToken(request: Request): string | null {
  const headerValue = readHeader(request, 'authorization')
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function buildApiRequestContext(request: Request, routeId: string): ApiRequestContext {
  const requestId =
    readHeader(request, 'x-request-id') ??
    (typeof randomUUID === 'function'
      ? randomUUID()
      : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const bearerToken = readBearerToken(request)

  return {
    requestId,
    routeId,
    startedAt: Date.now(),
    ipHash: stableHash(readClientIp(request)),
    userId: bearerToken ? stableHash(bearerToken) : undefined,
    deviceId: readHeader(request, 'x-mt-device-id') ?? undefined,
  }
}

