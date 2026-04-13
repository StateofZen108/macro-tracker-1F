import { extractCanonicalMacros, preserveUnmappedRows } from './extract'
import { normalizeOcrRows } from './normalize'
import type { LabelOcrResponseInput, NutritionLabelReviewSession } from './types'

function buildSessionId(response: LabelOcrResponseInput): string {
  if (response.id?.trim()) {
    return response.id.trim()
  }

  const rowCount = response.rows?.length ?? 0
  return `ocr-session-${rowCount}`
}

export function shapeNutritionLabelReviewSession(
  response: LabelOcrResponseInput,
): NutritionLabelReviewSession {
  const normalizedRows = normalizeOcrRows(response.rows ?? [])
  const mappedRows = normalizedRows.filter((row) => row.canonicalField !== null)
  const unmappedRows = preserveUnmappedRows(normalizedRows)
  const extraction = extractCanonicalMacros(normalizedRows)

  const reviewReasons: string[] = []
  if (extraction.missingFields.length > 0) {
    reviewReasons.push(`Missing canonical fields: ${extraction.missingFields.join(', ')}.`)
  }

  if (extraction.duplicateFields.length > 0) {
    reviewReasons.push(`Duplicate OCR matches found for: ${extraction.duplicateFields.join(', ')}.`)
  }

  if (unmappedRows.length > 0) {
    reviewReasons.push(`Preserved ${unmappedRows.length} unmapped OCR row${unmappedRows.length === 1 ? '' : 's'} for manual review.`)
  }

  return {
    sessionId: buildSessionId(response),
    source: response.source?.trim() || null,
    receivedAt: response.receivedAt?.trim() || null,
    rowCount: normalizedRows.length,
    normalizedRows,
    mappedRows,
    unmappedRows,
    extraction,
    status: reviewReasons.length > 0 ? 'needsReview' : 'ready',
    reviewReasons,
  }
}
