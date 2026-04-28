export interface ApiErrorEnvelope {
  error: {
    code: string
    message: string
    requestId: string
    retryAfterSeconds?: number
  }
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: string,
    message: string,
    options: { retryAfterSeconds?: number } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

export function buildApiErrorEnvelope(error: {
  code: string
  message: string
  requestId: string
  retryAfterSeconds?: number
}): ApiErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId: error.requestId,
      retryAfterSeconds: error.retryAfterSeconds,
    },
  }
}

