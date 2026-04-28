import { buildSessionFromProviderPayload } from '../../src/utils/labelOcrPayload.js'
import { ApiError } from '../../server/http/errors.js'
import { withApiMiddleware } from '../../server/http/apiMiddleware.js'
import { API_ROUTE_CONFIGS } from '../../server/http/routeConfigs.js'
import {
  extractNutritionLabel,
  LabelOcrProviderError,
  LABEL_OCR_SUPPORTED_MIME_TYPES,
  type LabelOcrMimeType,
  type LabelOcrRequest,
} from '../../server/label-ocr/provider.js'

export const runtime = 'nodejs'

interface PublicLabelOcrImage {
  role?: string
  imageBase64?: string
  mimeType?: string
  fileName?: string
  byteLength?: number
}

interface PublicLabelOcrBody {
  images?: PublicLabelOcrImage[]
  expectedLocale?: string
  hints?: {
    brand?: string
    productName?: string
    market?: string
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inferMimeType(imageBase64: string): LabelOcrMimeType | null {
  const match = imageBase64.match(/^data:([^;,]+)[;,]/i)
  if (!match?.[1]) {
    return null
  }

  const mimeType = match[1].trim().toLowerCase()
  return LABEL_OCR_SUPPORTED_MIME_TYPES.find((candidate) => candidate === mimeType) ?? null
}

function buildInternalRequest(body: unknown): LabelOcrRequest | null {
  if (!isRecord(body) || !Array.isArray(body.images) || body.images.length !== 1) {
    return null
  }

  const firstImage = body.images[0]
  if (!isRecord(firstImage) || typeof firstImage.imageBase64 !== 'string') {
    return null
  }

  const requestedMimeType =
    typeof firstImage.mimeType === 'string' ? firstImage.mimeType.trim().toLowerCase() : null
  const mimeType =
    (requestedMimeType &&
      LABEL_OCR_SUPPORTED_MIME_TYPES.find((candidate) => candidate === requestedMimeType)) ??
    inferMimeType(firstImage.imageBase64)

  if (!mimeType) {
    return null
  }

  return {
    provider: 'gemini',
    documentType: 'nutrition-label',
    image: {
      mimeType,
      base64Data: firstImage.imageBase64,
      fileName: typeof firstImage.fileName === 'string' ? firstImage.fileName : undefined,
      byteLength:
        typeof firstImage.byteLength === 'number' && Number.isFinite(firstImage.byteLength)
          ? firstImage.byteLength
          : undefined,
    },
    locale: typeof body.expectedLocale === 'string' ? body.expectedLocale : undefined,
    hints:
      isRecord(body.hints) &&
      (typeof body.hints.brand === 'string' ||
        typeof body.hints.productName === 'string' ||
        typeof body.hints.market === 'string')
        ? {
            brand: typeof body.hints.brand === 'string' ? body.hints.brand : undefined,
            productName:
              typeof body.hints.productName === 'string' ? body.hints.productName : undefined,
            market: typeof body.hints.market === 'string' ? body.hints.market : undefined,
          }
        : undefined,
  }
}

function enforceDecodedImageLimit(input: LabelOcrRequest, limitBytes = 5 * 1024 * 1024): void {
  const declaredBytes = input.image.byteLength
  const estimatedBytes =
    declaredBytes ??
    Math.floor((input.image.base64Data.replace(/^data:[^,]+,/, '').trim().length * 3) / 4)
  if (estimatedBytes > limitBytes) {
    throw new ApiError(413, 'payloadTooLarge', 'Nutrition label image is too large.')
  }
}

async function handlePost(request: Request): Promise<Response> {
  let body: PublicLabelOcrBody | null = null
  try {
    body = (await request.json()) as PublicLabelOcrBody
  } catch {
    return jsonResponse(400, {
      error: {
        code: 'invalidLabelOcrRequest',
        message: 'Nutrition label OCR expects a JSON body with exactly one image.',
      },
    })
  }

  const internalRequest = buildInternalRequest(body)
  if (!internalRequest) {
    return jsonResponse(400, {
      error: {
        code: 'invalidLabelOcrRequest',
        message: 'Nutrition label OCR expects one supported image in the request payload.',
      },
    })
  }
  enforceDecodedImageLimit(internalRequest)

  try {
    const providerResponse = await extractNutritionLabel(internalRequest)

    if (providerResponse.status === 'invalid-request') {
      return jsonResponse(400, {
        error: {
          code: 'invalidLabelOcrRequest',
          message: providerResponse.message,
        },
      })
    }

    if (providerResponse.status === 'not-configured') {
      return jsonResponse(503, {
        error: {
          code: 'providerNotConfigured',
          message: providerResponse.message,
        },
      })
    }

    const session = buildSessionFromProviderPayload(providerResponse)
    if (!session) {
      return jsonResponse(502, {
        error: {
          code: 'malformedProviderResponse',
          message: 'Gemini OCR returned an invalid review payload.',
        },
      })
    }

    return jsonResponse(200, {
      ...providerResponse,
      session,
    })
  } catch (error) {
    if (error instanceof LabelOcrProviderError) {
      return jsonResponse(error.status, {
        error: {
          code: error.code,
          message: error.message,
        },
      })
    }

    return jsonResponse(502, {
      error: {
        code: 'labelOcrUnavailable',
        message: error instanceof Error ? error.message : 'Nutrition label OCR is unavailable.',
      },
    })
  }
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return jsonResponse(405, {
        error: {
          code: 'methodNotAllowed',
          message: 'Use POST for nutrition label OCR extraction.',
        },
      })
    }

    return handlePost(request)
  },
}

export default withApiMiddleware(API_ROUTE_CONFIGS.labelOcrExtract, (request) => handler.fetch(request))
