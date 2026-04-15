import { logApiEvent } from '../../server/http/logging.js'
import { GarminServiceError, getGarminService } from '../../server/garmin/service.js'

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
    const url = new URL(request.url)
    const errorCode = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')
    if (errorCode) {
      logApiEvent({
        event: 'garmin_callback',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: errorDescription ?? errorCode,
      })
      return jsonResponse(400, {
        error: {
          code: 'garminAuthorizationRejected',
          message: errorDescription ?? 'Garmin authorization was rejected.',
          providerError: errorCode,
        },
      })
    }

    const code = url.searchParams.get('code')?.trim()
    const state = url.searchParams.get('state')?.trim()
    if (!code || !state) {
      logApiEvent({
        event: 'garmin_callback',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: 'Missing code or state.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidGarminCallback',
          message: 'Garmin callback requires both code and state query parameters.',
        },
      })
    }

    const response = await getGarminService().completeConnectionFromCallback({
      code,
      state,
    })
    logApiEvent({
      event: 'garmin_callback',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return jsonResponse(200, response)
  } catch (error) {
    if (error instanceof GarminServiceError) {
      logApiEvent({
        event: 'garmin_callback',
        status: error.status,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
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
      event: 'garmin_callback',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to complete Garmin callback.',
    })
    return jsonResponse(502, {
      error: {
        code: 'garminCallbackFailed',
        message: error instanceof Error ? error.message : 'Unable to complete Garmin callback.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      logApiEvent({
        event: 'garmin_callback',
        status: 405,
        latencyMs: 0,
        scope: 'garmin',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use GET for Garmin callback.',
        },
      })
    }

    return handleGet(request)
  },
}

export default handler
