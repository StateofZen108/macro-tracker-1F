import type { ActionResult, LabelOcrReviewSession } from '../types.js'
import {
  buildSessionFromProviderPayload,
  isLabelOcrReviewSession,
  type LabelOcrExtractResponse,
} from './labelOcrPayload.js'
import { recordDiagnosticsEvent } from './diagnostics.js'

function fail(code: string, message: string): ActionResult<LabelOcrReviewSession> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Unable to read the selected image.'))
    }
    reader.onerror = () => {
      reject(new Error('Unable to read the selected image.'))
    }
    reader.readAsDataURL(file)
  })
}

export async function extractNutritionLabel(file: File): Promise<ActionResult<LabelOcrReviewSession>> {
  if (!file.type.startsWith('image/')) {
    void recordDiagnosticsEvent({
      eventType: 'ocr_extract_failed',
      severity: 'warning',
      scope: 'ocr',
      message: 'Nutrition label OCR rejected a non-image file.',
      payload: { type: file.type || 'unknown' },
    })
    return fail('invalidImage', 'Select a nutrition-label image before continuing.')
  }

  let imageBase64 = ''
  try {
    imageBase64 = await readFileAsDataUrl(file)
  } catch (error) {
    void recordDiagnosticsEvent({
      eventType: 'ocr_extract_failed',
      severity: 'error',
      scope: 'ocr',
      message: error instanceof Error ? error.message : 'Unable to read the selected image.',
    })
    return fail(
      'invalidImage',
      error instanceof Error ? error.message : 'Unable to read the selected image.',
    )
  }

  try {
    const response = await fetch('/api/label-ocr/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        images: [
          {
            role: 'panel',
            imageBase64,
          },
        ],
        expectedLocale: 'auto',
      }),
    })

    const payload = (await response.json().catch(() => null)) as LabelOcrExtractResponse | null
    if (!response.ok) {
      void recordDiagnosticsEvent({
        eventType: 'ocr_extract_failed',
        severity: 'error',
        scope: 'ocr',
        message:
          payload?.error?.message ??
          (response.status === 404
            ? 'Nutrition label OCR is not configured in this build yet.'
            : 'Nutrition label OCR is unavailable right now.'),
        payload: {
          status: response.status,
          code: payload?.error?.code ?? 'labelOcrUnavailable',
        },
      })
      return fail(
        payload?.error?.code ?? 'labelOcrUnavailable',
        payload?.error?.message ??
          (response.status === 404
            ? 'Nutrition label OCR is not configured in this build yet.'
            : 'Nutrition label OCR is unavailable right now.'),
      )
    }

    if (payload && isLabelOcrReviewSession(payload.session)) {
      return {
        ok: true,
        data: payload.session,
      }
    }

    const mappedSession = payload ? buildSessionFromProviderPayload(payload) : null
    if (!mappedSession) {
      void recordDiagnosticsEvent({
        eventType: 'ocr_extract_failed',
        severity: 'error',
        scope: 'ocr',
        message: 'Nutrition label OCR returned an invalid review session.',
      })
      return fail('invalidOcrResponse', 'Nutrition label OCR returned an invalid review session.')
    }

    return {
      ok: true,
      data: mappedSession,
    }
  } catch (error) {
    void recordDiagnosticsEvent({
      eventType: 'ocr_extract_failed',
      severity: 'error',
      scope: 'ocr',
      message:
        error instanceof Error
          ? error.message
          : 'Nutrition label OCR is unavailable right now. Please retry in a moment.',
    })
    return fail(
      'labelOcrUnavailable',
      error instanceof Error
        ? error.message
        : 'Nutrition label OCR is unavailable right now. Please retry in a moment.',
    )
  }
}
