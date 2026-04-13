import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_GEMINI_API_KEY = process.env.GEMINI_API_KEY
const ORIGINAL_GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

function buildRequest(body: unknown) {
  return new Request('http://localhost/api/label-ocr/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  delete process.env.GEMINI_API_KEY
  delete process.env.GOOGLE_API_KEY
})

afterEach(() => {
  if (ORIGINAL_GEMINI_API_KEY === undefined) {
    delete process.env.GEMINI_API_KEY
  } else {
    process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_API_KEY
  }

  if (ORIGINAL_GOOGLE_API_KEY === undefined) {
    delete process.env.GOOGLE_API_KEY
  } else {
    process.env.GOOGLE_API_KEY = ORIGINAL_GOOGLE_API_KEY
  }
})

describe('label OCR API route', () => {
  it('rejects malformed request payloads before calling Gemini', async () => {
    const routeModule = await import('../../api/label-ocr/extract')
    const response = await routeModule.default.fetch(
      buildRequest({
        images: [],
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'invalidLabelOcrRequest',
      },
    })
  })

  it('returns a structured not-configured error when no server key is present', async () => {
    const routeModule = await import('../../api/label-ocr/extract')
    const response = await routeModule.default.fetch(
      buildRequest({
        images: [
          {
            role: 'panel',
            imageBase64: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
          },
        ],
        expectedLocale: 'auto',
      }),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'providerNotConfigured',
      },
    })
  })

  it('maps a live Gemini response into the OCR review session contract', async () => {
    process.env.GEMINI_API_KEY = 'test-key'
    const geminiFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    message: 'OCR draft ready for review.',
                    candidate: {
                      name: 'OCR Oats',
                      brand: 'Test Brand',
                      servingSize: 55,
                      servingUnit: 'g',
                      calories: 210,
                      protein: 8,
                      carbs: 33,
                      fat: 4,
                      fiber: 5,
                    },
                    fields: {
                      servingSizeText: {
                        value: '55 g',
                        status: 'present',
                        confidence: 'high',
                        sourceText: '55 g',
                      },
                      servingsPerContainer: {
                        value: 5,
                        unit: 'servings',
                        status: 'present',
                        confidence: 'medium',
                        sourceText: '5 servings',
                      },
                      calories: {
                        value: 210,
                        unit: 'kcal',
                        status: 'present',
                        confidence: 'high',
                        sourceText: '210 kcal',
                      },
                      protein: {
                        value: 8,
                        unit: 'g',
                        status: 'present',
                        confidence: 'high',
                        sourceText: '8 g',
                      },
                      carbs: {
                        value: 33,
                        unit: 'g',
                        status: 'present',
                        confidence: 'high',
                        sourceText: '33 g',
                      },
                      fat: {
                        value: 4,
                        unit: 'g',
                        status: 'present',
                        confidence: 'high',
                        sourceText: '4 g',
                      },
                      fiber: {
                        value: 5,
                        unit: 'g',
                        status: 'present',
                        confidence: 'medium',
                        sourceText: '5 g',
                      },
                      sugar: {
                        value: 1,
                        unit: 'g',
                        status: 'present',
                        confidence: 'medium',
                        sourceText: '1 g',
                      },
                      sodium: {
                        value: 120,
                        unit: 'mg',
                        status: 'present',
                        confidence: 'medium',
                        sourceText: '120 mg',
                      },
                    },
                    rawText: 'Calories 210 kcal; Protein 8 g; Carbs 33 g; Fat 4 g',
                    warnings: [
                      {
                        code: 'serving-size-inferred',
                        severity: 'info',
                        message: 'Serving size was inferred from the visible label panel.',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', geminiFetch)

    const routeModule = await import('../../api/label-ocr/extract')
    const response = await routeModule.default.fetch(
      buildRequest({
        images: [
          {
            role: 'panel',
            imageBase64: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
          },
        ],
        expectedLocale: 'auto',
      }),
    )

    expect(geminiFetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)

    const payload = (await response.json()) as Record<string, unknown>
    expect(payload).toMatchObject({
      provider: 'gemini',
      status: 'success',
      candidate: expect.objectContaining({
        name: 'OCR Oats',
        brand: 'Test Brand',
      }),
      session: expect.objectContaining({
        provider: 'gemini',
        requiresReview: true,
        foodDraft: expect.objectContaining({
          name: 'OCR Oats',
          brand: 'Test Brand',
          calories: 210,
          protein: 8,
          carbs: 33,
          fat: 4,
          fiber: 5,
          sugars: 1,
          sodium: 120,
        }),
      }),
    })
  })
})
