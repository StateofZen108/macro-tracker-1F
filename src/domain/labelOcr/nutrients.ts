import type { LabelNutritionField } from '../../types'
import {
  canonicalizeNutrientKeyV1,
  emptyNutrientProfileV1,
  getDefaultNutrientUnitV1,
  setNutrientAmountV1,
} from '../nutrition'
import type {
  CanonicalNutrientKeyV1,
  NutrientProfileV1,
} from '../nutrition'
import type {
  CanonicalNutritionField,
  NormalizedLabelOcrRow,
} from './types'

export interface OcrNutrientSelectionV1 {
  nutrient: CanonicalNutrientKeyV1
  value: number
  unit: string | null
  sourceRowId: string | null
  sourceRowIndex: number | null
  rawLabel: string | null
  rawValue: string | null
  candidateCount: number
}

export interface OcrNutrientMappingV1 {
  profile: NutrientProfileV1
  selected: Partial<Record<CanonicalNutrientKeyV1, OcrNutrientSelectionV1>>
  duplicateKeys: CanonicalNutrientKeyV1[]
  warnings: string[]
}

export function mapCanonicalNutritionFieldToNutrientKeyV1(
  field: CanonicalNutritionField | null | undefined,
): CanonicalNutrientKeyV1 | null {
  if (!field) {
    return null
  }

  switch (field) {
    case 'sugar':
      return 'sugars'
    case 'addedSugar':
      return 'addedSugars'
    case 'servingSize':
    case 'servingsPerContainer':
      return null
    default:
      return canonicalizeNutrientKeyV1(field)
  }
}

function compareRows(left: NormalizedLabelOcrRow, right: NormalizedLabelOcrRow): number {
  const leftConfidence = left.confidence ?? -1
  const rightConfidence = right.confidence ?? -1
  if (leftConfidence !== rightConfidence) {
    return rightConfidence - leftConfidence
  }

  return left.index - right.index
}

export function extractOcrNutrientMappingV1(
  rows: ReadonlyArray<NormalizedLabelOcrRow>,
): OcrNutrientMappingV1 {
  const groupedRows = new Map<CanonicalNutrientKeyV1, NormalizedLabelOcrRow[]>()

  for (const row of rows) {
    if (row.numericValue === null) {
      continue
    }

    const nutrientKey = mapCanonicalNutritionFieldToNutrientKeyV1(row.canonicalField)
    if (!nutrientKey) {
      continue
    }

    const nextRows = groupedRows.get(nutrientKey) ?? []
    nextRows.push(row)
    groupedRows.set(nutrientKey, nextRows)
  }

  let profile = emptyNutrientProfileV1('serving')
  const selected: Partial<Record<CanonicalNutrientKeyV1, OcrNutrientSelectionV1>> = {}
  const duplicateKeys: CanonicalNutrientKeyV1[] = []
  const warnings: string[] = []

  for (const [nutrientKey, candidates] of groupedRows.entries()) {
    const rankedCandidates = [...candidates].sort(compareRows)
    const chosen = rankedCandidates[0]
    profile = setNutrientAmountV1(
      profile,
      nutrientKey,
      chosen.numericValue ?? 0,
      getDefaultNutrientUnitV1(nutrientKey),
    )
    selected[nutrientKey] = {
      nutrient: nutrientKey,
      value: chosen.numericValue ?? 0,
      unit: chosen.unit,
      sourceRowId: chosen.id,
      sourceRowIndex: chosen.index,
      rawLabel: chosen.rawLabel,
      rawValue: chosen.rawValue,
      candidateCount: rankedCandidates.length,
    }

    if (rankedCandidates.length > 1) {
      duplicateKeys.push(nutrientKey)
      warnings.push(`Multiple OCR rows mapped to ${nutrientKey}; using the highest ranked row.`)
    }
  }

  return {
    profile,
    selected,
    duplicateKeys,
    warnings,
  }
}

export function buildLegacyLabelNutrientProfileV1(
  fields: ReadonlyArray<Pick<LabelNutritionField, 'normalizedKey' | 'rawLabel' | 'value'>>,
): NutrientProfileV1 {
  return fields.reduce<NutrientProfileV1>((profile, field) => {
    if (typeof field.value !== 'number' || !Number.isFinite(field.value)) {
      return profile
    }

    const nutrientKey = canonicalizeNutrientKeyV1(field.normalizedKey ?? field.rawLabel)
    if (!nutrientKey) {
      return profile
    }

    return setNutrientAmountV1(profile, nutrientKey, field.value)
  }, emptyNutrientProfileV1('serving'))
}
