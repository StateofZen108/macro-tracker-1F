import { describe, expect, it } from 'vitest'
import { buildSupportBundle } from '../../src/domain/supportBundle'
import { buildServerSupportBundle } from '../../server/support/bundle'

describe('support bundle redaction', () => {
  it('redacts sensitive food, OCR, image, auth, email, and token data before support export', () => {
    const bundle = buildSupportBundle({
      exportedAt: '2026-04-30T00:00:00.000Z',
      sections: {
        user: {
          email: 'athlete@example.com',
          sessionToken: 'secret-token',
        },
        foodLog: {
          foodName: 'Private recipe',
          notes: 'private prep notes',
          macros: { calories: 500 },
        },
        ocr: {
          rawOcrText: 'private label text',
          imageData: 'data:image/png;base64,AAAA',
        },
      },
    })

    expect(bundle.redactedKeys).toEqual([
      'foodLog.foodName',
      'foodLog.notes',
      'ocr.imageData',
      'ocr.rawOcrText',
      'user.email',
      'user.sessionToken',
    ])
    expect(JSON.stringify(bundle.payload)).not.toContain('athlete@example.com')
    expect(JSON.stringify(bundle.payload)).not.toContain('Private recipe')
    expect(JSON.stringify(bundle.payload)).toContain('"calories":500')
  })

  it('uses the same redaction path on server support exports', () => {
    const bundle = buildServerSupportBundle({
      exportedAt: '2026-04-30T00:00:00.000Z',
      sections: { request: { authorization: 'Bearer abc' } },
    })

    expect(bundle.redactedKeys).toEqual(['request.authorization'])
    expect(bundle.payload).toEqual({ request: { authorization: '[redacted]' } })
  })
})
