import type {
  CanonicalMacroExtraction,
  CanonicalMacroField,
  ExtractedMacroValue,
  NormalizedLabelOcrRow,
  PreservedUnmappedRow,
} from './types'

const MACRO_FIELDS: CanonicalMacroField[] = ['calories', 'protein', 'carbs', 'fat', 'fiber']

function emptyExtractedValue(field: CanonicalMacroField): ExtractedMacroValue {
  return {
    field,
    value: null,
    unit: null,
    comparator: null,
    confidence: null,
    sourceRowId: null,
    sourceRowIndex: null,
    rawLabel: null,
    rawValue: null,
    candidateCount: 0,
  }
}

function getAliasRank(row: NormalizedLabelOcrRow, field: CanonicalMacroField): number {
  if (row.canonicalField !== field) {
    return 10
  }

  if (row.matchedAlias === null) {
    return 5
  }

  if (field === 'calories' && row.matchedAlias === 'calories') {
    return 0
  }

  if (field === 'carbs' && row.matchedAlias === 'totalcarbohydrate') {
    return 0
  }

  if (field === 'fat' && row.matchedAlias === 'totalfat') {
    return 0
  }

  return 1
}

function compareRows(left: NormalizedLabelOcrRow, right: NormalizedLabelOcrRow, field: CanonicalMacroField): number {
  const leftAliasRank = getAliasRank(left, field)
  const rightAliasRank = getAliasRank(right, field)
  if (leftAliasRank !== rightAliasRank) {
    return leftAliasRank - rightAliasRank
  }

  const leftConfidence = left.confidence ?? -1
  const rightConfidence = right.confidence ?? -1
  if (leftConfidence !== rightConfidence) {
    return rightConfidence - leftConfidence
  }

  return left.index - right.index
}

function buildWarning(field: CanonicalMacroField, rows: NormalizedLabelOcrRow[]): string | null {
  if (rows.length <= 1) {
    return null
  }

  const distinctValues = new Set(
    rows.map((row) => `${row.numericValue ?? 'null'}|${row.unit ?? ''}|${row.comparator ?? ''}`),
  )

  if (distinctValues.size > 1) {
    return `Multiple OCR rows mapped to ${field} with conflicting values.`
  }

  return `Multiple OCR rows mapped to ${field}; using the highest ranked row.`
}

export function extractCanonicalMacros(rows: ReadonlyArray<NormalizedLabelOcrRow>): CanonicalMacroExtraction {
  const fields = MACRO_FIELDS.reduce(
    (result, field) => ({
      ...result,
      [field]: emptyExtractedValue(field),
    }),
    {} as Record<CanonicalMacroField, ExtractedMacroValue>,
  )
  const draft: Partial<Record<CanonicalMacroField, number>> = {}
  const missingFields: CanonicalMacroField[] = []
  const duplicateFields: CanonicalMacroField[] = []
  const warnings: string[] = []

  for (const field of MACRO_FIELDS) {
    const candidates = rows
      .filter((row) => row.canonicalField === field && row.numericValue !== null)
      .sort((left, right) => compareRows(left, right, field))

    if (!candidates.length) {
      missingFields.push(field)
      continue
    }

    const selectedRow = candidates[0]
    fields[field] = {
      field,
      value: selectedRow.numericValue,
      unit: selectedRow.unit,
      comparator: selectedRow.comparator,
      confidence: selectedRow.confidence,
      sourceRowId: selectedRow.id,
      sourceRowIndex: selectedRow.index,
      rawLabel: selectedRow.rawLabel,
      rawValue: selectedRow.rawValue,
      candidateCount: candidates.length,
    }

    draft[field] = selectedRow.numericValue ?? undefined

    if (candidates.length > 1) {
      duplicateFields.push(field)
      const warning = buildWarning(field, candidates)
      if (warning) {
        warnings.push(warning)
      }
    }
  }

  return {
    draft,
    fields,
    missingFields,
    duplicateFields,
    warnings,
  }
}

export function preserveUnmappedRows(rows: ReadonlyArray<NormalizedLabelOcrRow>): PreservedUnmappedRow[] {
  return rows
    .filter((row) => row.canonicalField === null)
    .map((row) => ({
      id: row.id,
      index: row.index,
      rawLabel: row.rawLabel,
      rawValue: row.rawValue,
      normalizedLabel: row.normalizedLabel,
      normalizedValue: row.normalizedValue,
      confidence: row.confidence,
      page: row.page,
      numericValue: row.numericValue,
      unit: row.unit,
      reason: row.rawLabel ? 'unmappedField' : 'missingLabel',
      raw: row.raw,
    }))
}
