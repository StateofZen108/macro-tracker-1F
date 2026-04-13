export type CanonicalNutritionField =
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'fiber'
  | 'servingSize'
  | 'servingsPerContainer'
  | 'sugar'
  | 'addedSugar'
  | 'sodium'

export type CanonicalMacroField = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'

export interface LabelOcrBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface LabelOcrRowInput {
  id?: string
  label?: string | null
  value?: string | number | null
  text?: string | null
  cells?: ReadonlyArray<string | number | null | undefined>
  confidence?: number | null
  page?: number | null
  boundingBox?: LabelOcrBoundingBox | null
  raw?: unknown
}

export interface LabelOcrResponseInput {
  id?: string
  source?: string
  receivedAt?: string
  rows?: ReadonlyArray<LabelOcrRowInput> | null
  rawText?: string | null
  raw?: unknown
}

export interface ParsedOcrValue {
  rawValue: string
  normalizedValue: string
  numericValue: number | null
  unit: string | null
  comparator: '<' | '>' | null
}

export interface FieldNormalization {
  rawLabel: string
  normalizedLabel: string
  canonicalField: CanonicalNutritionField | null
  matchedAlias: string | null
}

export interface NormalizedLabelOcrRow {
  id: string
  index: number
  rawLabel: string
  rawValue: string
  normalizedLabel: string
  normalizedValue: string
  canonicalField: CanonicalNutritionField | null
  matchedAlias: string | null
  numericValue: number | null
  unit: string | null
  comparator: '<' | '>' | null
  confidence: number | null
  page: number | null
  boundingBox?: LabelOcrBoundingBox
  raw?: unknown
}

export interface ExtractedMacroValue {
  field: CanonicalMacroField
  value: number | null
  unit: string | null
  comparator: '<' | '>' | null
  confidence: number | null
  sourceRowId: string | null
  sourceRowIndex: number | null
  rawLabel: string | null
  rawValue: string | null
  candidateCount: number
}

export interface CanonicalMacroExtraction {
  draft: Partial<Record<CanonicalMacroField, number>>
  fields: Record<CanonicalMacroField, ExtractedMacroValue>
  missingFields: CanonicalMacroField[]
  duplicateFields: CanonicalMacroField[]
  warnings: string[]
}

export interface PreservedUnmappedRow {
  id: string
  index: number
  rawLabel: string
  rawValue: string
  normalizedLabel: string
  normalizedValue: string
  confidence: number | null
  page: number | null
  numericValue: number | null
  unit: string | null
  reason: 'unmappedField' | 'missingLabel'
  raw?: unknown
}

export interface NutritionLabelReviewSession {
  sessionId: string
  source: string | null
  receivedAt: string | null
  rowCount: number
  normalizedRows: NormalizedLabelOcrRow[]
  mappedRows: NormalizedLabelOcrRow[]
  unmappedRows: PreservedUnmappedRow[]
  extraction: CanonicalMacroExtraction
  status: 'ready' | 'needsReview'
  reviewReasons: string[]
}
