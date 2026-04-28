import { lookupBarcodeProviders } from '../../server/food-catalog/providers.js'
import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { logApiEvent } from '../../server/http/logging.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'

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
    const barcode = url.searchParams.get('barcode')?.replace(/\D/g, '') ?? ''
    if (barcode.length < 8) {
      logApiEvent({
        event: 'food_catalog_barcode',
        status: 400,
        latencyMs: Date.now() - startedAt,
        scope: 'food_catalog',
        message: 'Missing or invalid barcode parameter.',
      })
      return jsonResponse(400, {
        error: {
          code: 'invalidBarcode',
          message: 'Provide a barcode with at least 8 digits.',
        },
      })
    }

    const result = await lookupBarcodeProviders(barcode)
    if (!result.ok) {
      logApiEvent({
        event: 'food_catalog_barcode',
        status: 404,
        latencyMs: Date.now() - startedAt,
        scope: 'food_catalog',
        message: result.error.message,
      })
      return jsonResponse(404, {
        error: result.error,
      })
    }

    logApiEvent({
      event: 'food_catalog_barcode',
      status: 200,
      latencyMs: Date.now() - startedAt,
      scope: 'food_catalog',
    })
    return jsonResponse(200, result.data)
  } catch (error) {
    logApiEvent({
      event: 'food_catalog_barcode',
      status: 502,
      latencyMs: Date.now() - startedAt,
      scope: 'food_catalog',
      message: error instanceof Error ? error.message : 'Unable to look up barcode.',
    })
    return jsonResponse(502, {
      error: {
        code: 'barcodeLookupFailed',
        message: error instanceof Error ? error.message : 'Unable to look up barcode.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use GET for barcode lookup.',
        },
      })
    }

    return handleGet(request)
  },
}

export default withApiMiddleware(API_ROUTE_CONFIGS.foodCatalogBarcode, (request) => handler.fetch(request))
