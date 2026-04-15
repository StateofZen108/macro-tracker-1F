import type { ActionResult, LabelOcrReviewSession } from '../types.js'
import {
  buildSessionFromProviderPayload,
  isLabelOcrReviewSession,
  type LabelOcrExtractResponse,
} from './labelOcrPayload.js'
import { recordDiagnosticsEvent } from './diagnostics.js'

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const OCR_IMAGE_TYPE_BUDGET = 2.5 * 1024 * 1024
const OCR_IMAGE_MAX_LONG_EDGE = 2048
const OCR_IMAGE_QUALITY_STEPS = [0.85, 0.72, 0.6]

export interface NormalizedLabelImage {
  file: File
  previewUrl: string
  originalMimeType: string
  normalizedMimeType: string
  byteLength: number
  width: number
  height: number
}

function fail(code: string, message: string): ActionResult<LabelOcrReviewSession> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function canUseBrowserImagePipeline(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function normalizeMimeType(type: string): string {
  return type.trim().toLowerCase()
}

function replaceFileExtension(fileName: string, nextExtension: string): string {
  const trimmedName = fileName.trim()
  if (!trimmedName) {
    return `nutrition-label.${nextExtension}`
  }

  return trimmedName.includes('.')
    ? trimmedName.replace(/\.[^.]+$/, `.${nextExtension}`)
    : `${trimmedName}.${nextExtension}`
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

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to decode the selected nutrition-label image.'))
    }
    image.src = objectUrl
  })
}

function scaleDimensions(width: number, height: number): { width: number; height: number } {
  const longEdge = Math.max(width, height)
  if (longEdge <= OCR_IMAGE_MAX_LONG_EDGE) {
    return { width, height }
  }

  const scale = OCR_IMAGE_MAX_LONG_EDGE / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to prepare the selected nutrition-label image.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })

  if (Array.isArray(converted)) {
    const [firstImage] = converted
    if (!firstImage) {
      throw new Error('Unable to convert the selected HEIC image.')
    }

    return firstImage
  }

  return converted
}

function getUnsupportedImageMessage(): string {
  return 'Choose a nutrition-label photo in JPEG, PNG, WebP, or HEIC/HEIF format.'
}

function buildNormalizedFile(fileName: string, blob: Blob): File {
  return new File([blob], replaceFileExtension(fileName, 'jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

export function revokeNormalizedLabelImage(image: NormalizedLabelImage | null): void {
  if (!image?.previewUrl) {
    return
  }

  URL.revokeObjectURL(image.previewUrl)
}

export async function normalizeLabelImage(file: File): Promise<ActionResult<NormalizedLabelImage>> {
  const normalizedMimeType = normalizeMimeType(file.type)
  if (!ACCEPTED_IMAGE_TYPES.has(normalizedMimeType)) {
    return {
      ok: false,
      error: {
        code: 'invalidImage',
        message: getUnsupportedImageMessage(),
      },
    }
  }

  if (!canUseBrowserImagePipeline()) {
    return {
      ok: false,
      error: {
        code: 'invalidImage',
        message: 'Image normalization is unavailable in this browser context.',
      },
    }
  }

  try {
    const inputBlob =
      normalizedMimeType === 'image/heic' || normalizedMimeType === 'image/heif'
        ? await convertHeicToJpeg(file)
        : file

    const image = await loadImage(inputBlob)
    const { width, height } = scaleDimensions(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    if (!context) {
      return {
        ok: false,
        error: {
          code: 'invalidImage',
          message: 'Unable to prepare the selected nutrition-label image.',
        },
      }
    }

    context.drawImage(image, 0, 0, width, height)

    let encodedBlob: Blob | null = null
    for (const quality of OCR_IMAGE_QUALITY_STEPS) {
      const candidateBlob = await canvasToBlob(canvas, quality)
      encodedBlob = candidateBlob
      if (candidateBlob.size <= OCR_IMAGE_TYPE_BUDGET) {
        break
      }
    }

    if (!encodedBlob || encodedBlob.size > OCR_IMAGE_TYPE_BUDGET) {
      return {
        ok: false,
        error: {
          code: 'invalidImage',
          message: 'Choose a clearer nutrition-label photo. This image is still too large after compression.',
        },
      }
    }

    const normalizedFile = buildNormalizedFile(file.name, encodedBlob)
    const previewUrl = URL.createObjectURL(normalizedFile)
    return {
      ok: true,
      data: {
        file: normalizedFile,
        previewUrl,
        originalMimeType: normalizedMimeType || 'unknown',
        normalizedMimeType: normalizedFile.type,
        byteLength: normalizedFile.size,
        width,
        height,
      },
    }
  } catch (error) {
    void recordDiagnosticsEvent({
      eventType: 'ocr_extract_failed',
      severity: 'error',
      scope: 'ocr',
      message:
        error instanceof Error
          ? error.message
          : 'Unable to prepare the selected nutrition-label image.',
    })

    return {
      ok: false,
      error: {
        code: 'invalidImage',
        message:
          error instanceof Error
            ? error.message
            : 'Unable to prepare the selected nutrition-label image.',
      },
    }
  }
}

export async function extractNutritionLabel(file: File): Promise<ActionResult<LabelOcrReviewSession>> {
  const normalizedMimeType = normalizeMimeType(file.type)
  if (!normalizedMimeType.startsWith('image/')) {
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
