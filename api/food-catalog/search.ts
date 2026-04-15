import { searchCatalogProviders } from '../../server/food-catalog/providers.js'
import { logApiEvent } from '../../server/http/logging.js'

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

function parseLimit(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseLocale(value: string | null): 'en-GB' | 'en-US' | undefined {
  if (!value) {
    return undefined
  }

  return value === 'en-US' ? 'en-US' : value === 'en-GB' ? 'en-GB' : undefined
}

async function handleGet(request: Request): Promise<Response> {
  const startedAt = Date.now()
  try {
    const url = new URL(request.url)
    const query = url.searchParams.get('q')?.trim() ?? ''
    if (!query) {
      logApiEvent({
        event: 'food_catalog_search',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'food_catalog',
        message: 'Missing q parameter.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidFoodCatalogQuery',
          message: 'Provide a non-empty q parameter.',
        },
      })
    }

    const response = await searchCatalogProviders(query, {
      limit: parseLimit(url.searchParams.get('limit')),
      cursor: url.searchParams.get('cursor') ?? undefined,
      locale: parseLocale(url.searchParams.get('locale')),
    })

    logApiEvent({
      event: 'food_catalog_search',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'food_catalog',
    })
    return jsonResponse(200, response)
  } catch (error) {
    logApiEvent({
      event: 'food_catalog_search',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'food_catalog',
      message: error instanceof Error ? error.message : 'Unable to search the food catalog.',
    })
    return jsonResponse(502, {
      error: {
        code: 'foodCatalogSearchFailed',
        message: error instanceof Error ? error.message : 'Unable to search the food catalog.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      logApiEvent({
        event: 'food_catalog_search',
        status: 405,
        latencyMs: 0,
        scope: 'food_catalog',
        message: 'Method not allowed.',
      })
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use GET for food catalog search.',
        },
      })
    }

    return handleGet(request)
  },
}

export default handler
