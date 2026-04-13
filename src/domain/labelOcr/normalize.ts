import type {
  CanonicalNutritionField,
  FieldNormalization,
  LabelOcrResponseInput,
  LabelOcrRowInput,
  NormalizedLabelOcrRow,
  ParsedOcrValue,
} from './types'

const FIELD_ALIASES: ReadonlyArray<readonly [CanonicalNutritionField, readonly string[]]> = [
  ['calories', ['calories', 'calorie', 'energy', 'energykcal', 'kcal']],
  ['protein', ['protein']],
  ['carbs', ['carbs', 'carb', 'carbohydrate', 'carbohydrates', 'totalcarbohydrate', 'totalcarbohydrates']],
  ['fat', ['fat', 'totalfat', 'totalfats', 'total lipid', 'totallipid']],
  ['fiber', ['fiber', 'dietaryfiber', 'fibers']],
  ['servingSize', ['servingsize', 'size', 'portionsize']],
  ['servingsPerContainer', ['servingspercontainer', 'servingpercontainer']],
  ['sugar', ['sugar', 'sugars', 'totalsugar', 'totalsugars']],
  ['addedSugar', ['addedsugar', 'addedsugars', 'includesaddedsugars']],
  ['sodium', ['sodium']],
] as const

const FRACTION_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['1/2', '0.5'],
  ['1/3', '0.333'],
  ['2/3', '0.667'],
  ['1/4', '0.25'],
  ['3/4', '0.75'],
]

const UNICODE_FRACTIONS: ReadonlyArray<readonly [string, string]> = [
  ['½', '0.5'],
  ['⅓', '0.333'],
  ['⅔', '0.667'],
  ['¼', '0.25'],
  ['¾', '0.75'],
  ['⅛', '0.125'],
] as const

function sanitizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function stripLabelNoise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[%():*,-]/g, ' ')
    .replace(/\bamount per serving\b/g, ' ')
    .replace(/\bdaily value\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toAliasKey(value: string): string {
  return stripLabelNoise(value).replace(/[^a-z0-9]/g, '')
}

function getCellValue(cells: LabelOcrRowInput['cells'], index: number): string {
  const rawValue = cells?.[index]
  if (rawValue === undefined || rawValue === null) {
    return ''
  }

  return sanitizeWhitespace(`${rawValue}`)
}

function resolveRawLabel(row: LabelOcrRowInput): string {
  const explicitLabel =
    row.label !== undefined && row.label !== null ? sanitizeWhitespace(`${row.label}`) : ''
  if (explicitLabel) {
    return explicitLabel
  }

  const labelCell = getCellValue(row.cells, 0)
  if (labelCell) {
    return labelCell
  }

  return row.text ? sanitizeWhitespace(row.text) : ''
}

function resolveRawValue(row: LabelOcrRowInput): string {
  const explicitValue =
    row.value !== undefined && row.value !== null ? sanitizeWhitespace(`${row.value}`) : ''
  if (explicitValue) {
    return explicitValue
  }

  const valueCell = getCellValue(row.cells, 1)
  if (valueCell) {
    return valueCell
  }

  return ''
}

function normalizeConfidence(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  if (value <= 1 && value >= 0) {
    return Math.round(value * 1000) / 1000
  }

  if (value <= 100 && value >= 0) {
    return Math.round((value / 100) * 1000) / 1000
  }

  return null
}

function normalizeUnit(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (['grams', 'gram'].includes(normalized)) {
    return 'g'
  }

  if (['milligrams', 'milligram'].includes(normalized)) {
    return 'mg'
  }

  if (['milliliters', 'milliliter'].includes(normalized)) {
    return 'ml'
  }

  if (['kilocalories', 'kilocalorie', 'calories', 'calorie', 'kcals'].includes(normalized)) {
    return normalized.startsWith('k') ? 'kcal' : 'cal'
  }

  return normalized
}

function expandFractions(value: string): string {
  let nextValue = value
  for (const [fraction, replacement] of FRACTION_REPLACEMENTS) {
    nextValue = nextValue.replace(new RegExp(`\\b${fraction}\\b`, 'g'), replacement)
  }

  for (const [fraction, replacement] of UNICODE_FRACTIONS) {
    nextValue = nextValue.replace(new RegExp(fraction, 'g'), replacement)
  }

  return nextValue
}

export function normalizeOcrLabelText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return sanitizeWhitespace(value)
}

export function normalizeOcrFieldName(label: string | null | undefined): FieldNormalization {
  const rawLabel = normalizeOcrLabelText(label)
  const normalizedLabel = stripLabelNoise(rawLabel)
  const aliasKey = toAliasKey(normalizedLabel)

  if (!aliasKey) {
    return {
      rawLabel,
      normalizedLabel,
      canonicalField: null,
      matchedAlias: null,
    }
  }

  for (const [canonicalField, aliases] of FIELD_ALIASES) {
    const matchedAlias = aliases.find((alias) => aliasKey === toAliasKey(alias))
    if (matchedAlias) {
      return {
        rawLabel,
        normalizedLabel,
        canonicalField,
        matchedAlias,
      }
    }
  }

  for (const [canonicalField, aliases] of FIELD_ALIASES) {
    const matchedAlias = aliases.find((alias) => aliasKey.includes(toAliasKey(alias)))
    if (matchedAlias) {
      return {
        rawLabel,
        normalizedLabel,
        canonicalField,
        matchedAlias,
      }
    }
  }

  return {
    rawLabel,
    normalizedLabel,
    canonicalField: null,
    matchedAlias: null,
  }
}

export function normalizeOcrValue(value: string | number | null | undefined): ParsedOcrValue {
  const rawValue =
    value === undefined || value === null ? '' : sanitizeWhitespace(`${value}`)
  if (!rawValue) {
    return {
      rawValue: '',
      normalizedValue: '',
      numericValue: null,
      unit: null,
      comparator: null,
    }
  }

  const expandedValue = expandFractions(rawValue).replace(/,/g, '')
  const normalizedValue = sanitizeWhitespace(expandedValue)
  const match = normalizedValue.match(/([<>])?\s*(-?\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))?/)
  if (!match) {
    return {
      rawValue,
      normalizedValue,
      numericValue: null,
      unit: null,
      comparator: null,
    }
  }

  const parsedNumber = Number.parseFloat(match[2] ?? '')

  return {
    rawValue,
    normalizedValue,
    numericValue: Number.isFinite(parsedNumber) ? parsedNumber : null,
    unit: normalizeUnit(match[3]),
    comparator: match[1] === '<' || match[1] === '>' ? match[1] : null,
  }
}

export function normalizeOcrRow(row: LabelOcrRowInput, index: number): NormalizedLabelOcrRow {
  const rawLabel = resolveRawLabel(row)
  const rawValue = resolveRawValue(row)
  const field = normalizeOcrFieldName(rawLabel)
  const parsedValue = normalizeOcrValue(rawValue)

  return {
    id: row.id?.trim() || `ocr-row-${index + 1}`,
    index,
    rawLabel,
    rawValue: parsedValue.rawValue,
    normalizedLabel: field.normalizedLabel,
    normalizedValue: parsedValue.normalizedValue,
    canonicalField: field.canonicalField,
    matchedAlias: field.matchedAlias,
    numericValue: parsedValue.numericValue,
    unit: parsedValue.unit,
    comparator: parsedValue.comparator,
    confidence: normalizeConfidence(row.confidence),
    page: typeof row.page === 'number' && Number.isFinite(row.page) ? row.page : null,
    boundingBox: row.boundingBox ?? undefined,
    raw: row.raw,
  }
}

export function normalizeOcrRows(rows: ReadonlyArray<LabelOcrRowInput> | null | undefined): NormalizedLabelOcrRow[] {
  if (!rows?.length) {
    return []
  }

  return rows.map((row, index) => normalizeOcrRow(row, index))
}

export function getResponseRows(response: LabelOcrResponseInput): NormalizedLabelOcrRow[] {
  return normalizeOcrRows(response.rows ?? [])
}
