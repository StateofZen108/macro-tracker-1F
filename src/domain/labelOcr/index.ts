export type {
  CanonicalMacroExtraction,
  CanonicalMacroField,
  CanonicalNutritionField,
  ExtractedMacroValue,
  FieldNormalization,
  LabelOcrBoundingBox,
  LabelOcrResponseInput,
  LabelOcrRowInput,
  NormalizedLabelOcrRow,
  NutritionLabelReviewSession,
  ParsedOcrValue,
  PreservedUnmappedRow,
} from './types'

export {
  getResponseRows,
  normalizeOcrFieldName,
  normalizeOcrLabelText,
  normalizeOcrRow,
  normalizeOcrRows,
  normalizeOcrValue,
} from './normalize'

export { extractCanonicalMacros, preserveUnmappedRows } from './extract'

export { shapeNutritionLabelReviewSession } from './reviewSession'

export {
  buildLegacyLabelNutrientProfileV1,
  extractOcrNutrientMappingV1,
  mapCanonicalNutritionFieldToNutrientKeyV1,
} from './nutrients'
