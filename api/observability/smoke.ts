import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { ApiError } from '../../server/http/errors.js'
import { captureServerMessage } from '../../server/observability/sentry.server.js'

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

function readHeader(request: Request, name: string): string | null {
  return request.headers.get(name) ?? request.headers.get(name.toLowerCase())
}

async function handlePost(request: Request): Promise<Response> {
  const expectedSecret = process.env.OBSERVABILITY_SMOKE_SECRET?.trim()
  const suppliedSecret = readHeader(request, 'x-observability-smoke-secret')?.trim()
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw new ApiError(401, 'observabilitySmokeUnauthorized', 'A valid observability smoke secret is required.')
  }

  const eventId = captureServerMessage('production-readiness-observability-smoke')
  if (!eventId) {
    throw new ApiError(503, 'observabilitySmokeUnavailable', 'Sentry did not return an event ID.')
  }

  return jsonResponse(200, {
    ok: true,
    eventId,
    buildId: process.env.VITE_APP_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    gitSha: process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  })
}

export default withApiMiddleware(
  {
    routeId: 'observability.smoke',
    allowedMethods: ['POST'],
    timeoutMs: 3_000,
    bodyLimitBytes: 1024,
    rateLimit: {
      limit: 3,
      windowSeconds: 60,
      scope: 'ip',
      failClosedWithoutStore: false,
    },
  },
  handlePost,
)
