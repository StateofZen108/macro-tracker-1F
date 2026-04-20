import { logApiEvent } from '../../server/http/logging.js'
import { GarminServiceError, getGarminService } from '../../server/garmin/service.js'

export const runtime = 'nodejs'

function buildFallbackReturnTo(requestUrl: URL): string {
  return new URL('/', requestUrl.origin).toString()
}

function buildRedirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
    },
  })
}

function buildCallbackRedirect(
  baseUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(baseUrl)
  url.searchParams.delete('garmin_callback')
  url.searchParams.delete('garmin_callback_error')

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}

async function resolveReturnToUrl(requestUrl: URL, state: string | undefined): Promise<string> {
  if (!state) {
    return buildFallbackReturnTo(requestUrl)
  }

  try {
    const session = await getGarminService().getSession(state)
    return session?.returnToUrl?.trim() || buildFallbackReturnTo(requestUrl)
  } catch {
    return buildFallbackReturnTo(requestUrl)
  }
}

async function handleGet(request: Request): Promise<Response> {
  const startedAt = Date.now()
  const requestUrl = new URL(request.url)
  const state = requestUrl.searchParams.get('state')?.trim() || undefined
  const returnToUrl = await resolveReturnToUrl(requestUrl, state)

  try {
    const errorCode = requestUrl.searchParams.get('error')
    const errorDescription = requestUrl.searchParams.get('error_description')
    if (errorCode) {
      logApiEvent({
        event: 'garmin_callback',
        status: 302,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: errorDescription ?? errorCode,
      })
      return buildRedirectResponse(
        buildCallbackRedirect(returnToUrl, {
          garmin_callback_error: 'garminAuthorizationRejected',
        }),
      )
    }

    const code = requestUrl.searchParams.get('code')?.trim()
    if (!code || !state) {
      logApiEvent({
        event: 'garmin_callback',
        status: 302,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: 'Missing code or state.',
      })
      return buildRedirectResponse(
        buildCallbackRedirect(returnToUrl, {
          garmin_callback_error: 'invalidGarminCallback',
        }),
      )
    }

    await getGarminService().completeConnectionFromCallback({
      code,
      state,
    })
    logApiEvent({
      event: 'garmin_callback',
      status: 302,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
    })
    return buildRedirectResponse(
      buildCallbackRedirect(returnToUrl, {
        garmin_callback: 'connected',
      }),
    )
  } catch (error) {
    if (error instanceof GarminServiceError) {
      logApiEvent({
        event: 'garmin_callback',
        status: 302,
        latencyMs: Date.now() - startedAt,
        scope: 'garmin',
        message: error.message,
      })
      return buildRedirectResponse(
        buildCallbackRedirect(returnToUrl, {
          garmin_callback_error: error.code,
        }),
      )
    }

    logApiEvent({
      event: 'garmin_callback',
      status: 302,
      latencyMs: Date.now() - startedAt,
      scope: 'garmin',
      message: error instanceof Error ? error.message : 'Unable to complete Garmin callback.',
    })
    return buildRedirectResponse(
      buildCallbackRedirect(returnToUrl, {
        garmin_callback_error: 'garminCallbackFailed',
      }),
    )
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
      return new Response(
        JSON.stringify({
          error: {
            code: 'methodNotAllowed',
            message: 'Use GET for Garmin callback.',
          },
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      )
    }

    return handleGet(request)
  },
}

export default handler
