import type { BarcodeLookupResult, CatalogProvider, Food, LabelNutritionPanel } from '../../types'
import type { AddFoodRemoteStatus } from './types'

interface ServingMetaInput {
  brand?: string
  servingSize?: number
  servingUnit?: string
}

interface MacroSummaryInput {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
}

interface ScaledMacroSummaryInput extends MacroSummaryInput {
  servings: number
}

interface SelectedFoodServingPreviewInput {
  brand?: string
  servingSize: number
  servingUnit: string
  labelNutrition?: LabelNutritionPanel
  servings: number
}

interface SelectedFoodServingPreview {
  primaryMeta: string
  basisMeta: string | null
}

interface MetricAmount {
  amount: number
  unit: 'g' | 'ml'
}

interface OcrCountPhrase {
  baseCount: number
  singularUnit: string
  pluralUnit: string
  metric: MetricAmount
  normalizedBaseText: string
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatServingsLabel(value: number): string {
  if (Number.isInteger(value)) {
    return `${value}`
  }

  return `${Math.round(value * 100) / 100}`
}

export function getSelectedFoodMetricBasis({
  servingSize,
  servingUnit,
  labelNutrition,
}: Pick<SelectedFoodServingPreviewInput, 'servingSize' | 'servingUnit' | 'labelNutrition'>): MetricAmount | null {
  return (
    parseMetricAmount(labelNutrition?.servingSizeText) ??
    (['g', 'ml'].includes(servingUnit.trim().toLowerCase()) && isFiniteNumber(servingSize)
      ? {
          amount: servingSize,
          unit: servingUnit.trim().toLowerCase() as 'g' | 'ml',
        }
      : null)
  )
}

function compactMetric(amount: number, unit: 'g' | 'ml'): string {
  return `${formatServingsLabel(amount)}${unit}`
}

function scaleNumber(value: number, servings: number): number {
  return Math.round(value * servings * 100) / 100
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function parseMetricAmount(value: string | undefined): MetricAmount | null {
  if (!value) {
    return null
  }

  const match = value.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i)
  if (!match?.[1] || !match[2]) {
    return null
  }

  const amount = Number.parseFloat(match[1])
  const unit = match[2].toLowerCase() as 'g' | 'ml'
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return { amount, unit }
}

function deriveCountUnitForms(rawUnit: string, baseCount: number): { singularUnit: string; pluralUnit: string } {
  const normalizedUnit = normalizeWhitespace(rawUnit)
  if (Math.abs(baseCount - 1) < 0.0001) {
    return {
      singularUnit: normalizedUnit,
      pluralUnit: normalizedUnit.endsWith('s') ? normalizedUnit : `${normalizedUnit}s`,
    }
  }

  return {
    singularUnit:
      normalizedUnit.endsWith('s') && normalizedUnit.length > 1
        ? normalizedUnit.slice(0, -1)
        : normalizedUnit,
    pluralUnit: normalizedUnit,
  }
}

function pickCountUnit(
  forms: { singularUnit: string; pluralUnit: string },
  count: number,
): string {
  if (count < 1 || Math.abs(count - 1) < 0.0001) {
    return forms.singularUnit
  }

  return forms.pluralUnit
}

function parseOcrCountPhrase(value: string | undefined): OcrCountPhrase | null {
  if (!value) {
    return null
  }

  const match = value.match(/^\s*(\d+(?:\.\d+)?)\s+([^()]+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)\s*$/i)
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    return null
  }

  const baseCount = Number.parseFloat(match[1])
  const metricAmount = Number.parseFloat(match[3])
  const metricUnit = match[4].toLowerCase() as 'g' | 'ml'
  if (!Number.isFinite(baseCount) || baseCount <= 0 || !Number.isFinite(metricAmount) || metricAmount <= 0) {
    return null
  }

  const forms = deriveCountUnitForms(match[2], baseCount)
  const baseUnit = pickCountUnit(forms, baseCount)
  const normalizedBaseText = `${formatServingsLabel(baseCount)} ${baseUnit} (${compactMetric(metricAmount, metricUnit)})`

  return {
    baseCount,
    singularUnit: forms.singularUnit,
    pluralUnit: forms.pluralUnit,
    metric: {
      amount: metricAmount,
      unit: metricUnit,
    },
    normalizedBaseText,
  }
}

export function formatServingMeta({ brand, servingSize, servingUnit }: ServingMetaInput): string {
  const parts: string[] = []
  if (brand?.trim()) {
    parts.push(brand.trim())
  }

  if (isFiniteNumber(servingSize) && servingUnit?.trim()) {
    parts.push(`${servingSize}${servingUnit.trim()}`)
  } else if (isFiniteNumber(servingSize)) {
    parts.push(`${servingSize}`)
  } else if (servingUnit?.trim()) {
    parts.push(servingUnit.trim())
  }

  return parts.join(' - ')
}

export function formatMacroSummary({
  calories,
  protein,
  carbs,
  fat,
}: MacroSummaryInput): string | null {
  if (
    !isFiniteNumber(calories) ||
    !isFiniteNumber(protein) ||
    !isFiniteNumber(carbs) ||
    !isFiniteNumber(fat)
  ) {
    return null
  }

  return `${Math.round(calories)} cal | ${Math.round(protein)}P | ${Math.round(carbs)}C | ${Math.round(fat)}F`
}

export function describeFood(food: Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat'>): string {
  return formatMacroSummary(food) ?? 'Nutrition unavailable'
}

export function formatScaledMacroSummary({
  calories,
  protein,
  carbs,
  fat,
  fiber,
  servings,
}: ScaledMacroSummaryInput): string | null {
  if (
    !isFiniteNumber(calories) ||
    !isFiniteNumber(protein) ||
    !isFiniteNumber(carbs) ||
    !isFiniteNumber(fat)
  ) {
    return null
  }

  return formatMacroSummary({
    calories: scaleNumber(calories, servings),
    protein: scaleNumber(protein, servings),
    carbs: scaleNumber(carbs, servings),
    fat: scaleNumber(fat, servings),
    fiber: isFiniteNumber(fiber) ? scaleNumber(fiber, servings) : undefined,
  })
}

export function describeFoodWithServings(
  food: Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>,
  servings: number,
): string {
  return formatScaledMacroSummary({
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
    servings,
  }) ?? 'Nutrition unavailable'
}

export function formatSelectedFoodServingPreview({
  brand,
  servingSize,
  servingUnit,
  labelNutrition,
  servings,
}: SelectedFoodServingPreviewInput): SelectedFoodServingPreview {
  const brandPrefix = brand?.trim() ? `${brand.trim()} - ` : ''
  const labelServingText = labelNutrition?.servingSizeText
  const metricBasis = getSelectedFoodMetricBasis({
    servingSize,
    servingUnit,
    labelNutrition,
  })
  const ocrCountPhrase = parseOcrCountPhrase(labelServingText)

  if (ocrCountPhrase && metricBasis) {
    if (Math.abs(servings - 1) < 0.0001) {
      return {
        primaryMeta: `${brandPrefix}${ocrCountPhrase.normalizedBaseText}`,
        basisMeta: null,
      }
    }

    const scaledCount = scaleNumber(ocrCountPhrase.baseCount, servings)
    const scaledMetric = scaleNumber(metricBasis.amount, servings)
    const scaledUnit = pickCountUnit(
      {
        singularUnit: ocrCountPhrase.singularUnit,
        pluralUnit: ocrCountPhrase.pluralUnit,
      },
      scaledCount,
    )

    return {
      primaryMeta: `${brandPrefix}${formatServingsLabel(scaledCount)} ${scaledUnit} (${compactMetric(scaledMetric, metricBasis.unit)})`,
      basisMeta: `1x = ${ocrCountPhrase.normalizedBaseText}`,
    }
  }

  if (metricBasis) {
    if (Math.abs(servings - 1) < 0.0001) {
      return {
        primaryMeta: `${brandPrefix}${compactMetric(metricBasis.amount, metricBasis.unit)}`,
        basisMeta: null,
      }
    }

    return {
      primaryMeta: `${brandPrefix}${formatServingsLabel(servings)} servings (${compactMetric(scaleNumber(metricBasis.amount, servings), metricBasis.unit)})`,
      basisMeta: `1x = ${compactMetric(metricBasis.amount, metricBasis.unit)}`,
    }
  }

  if (Math.abs(servings - 1) < 0.0001) {
    return {
      primaryMeta: formatServingMeta({ brand, servingSize, servingUnit }),
      basisMeta: null,
    }
  }

  return {
    primaryMeta: `${brandPrefix}${formatServingsLabel(scaleNumber(servingSize, servings))}${servingUnit.trim()}`,
    basisMeta: null,
  }
}

export function buildLookupMessage(result: BarcodeLookupResult): string {
  const summary = formatMacroSummary(result.candidate)
  if (summary) {
    return `Imported ${summary}.`
  }

  return `Imported with missing fields: ${result.missingFields.join(', ')}.`
}

export function getRemoteCatalogStatusLabel(
  remoteStatus: AddFoodRemoteStatus,
  remoteLoadingMore: boolean,
): string {
  if (remoteLoadingMore) {
    return 'Loading more...'
  }

  if (remoteStatus === 'loading') {
    return 'Searching...'
  }

  return 'Open Food Facts + USDA'
}

export function getCatalogProviderLabel(provider: CatalogProvider | undefined): string {
  if (provider === 'open_food_facts') {
    return 'OFF'
  }

  if (provider === 'usda_fdc') {
    return 'USDA'
  }

  if (provider === 'fatsecret') {
    return 'FatSecret'
  }

  return 'Catalog'
}

export function getImportConfidenceLabel(
  value: 'direct_match' | 'weak_match' | 'manual_review_required' | undefined,
): string {
  if (value === 'manual_review_required') {
    return 'review required'
  }

  if (value === 'weak_match') {
    return 'needs review'
  }

  return 'direct import'
}

export function getSourceQualityLabel(
  value: 'high' | 'medium' | 'low' | undefined,
): string {
  if (value === 'low') {
    return 'low confidence'
  }

  if (value === 'medium') {
    return 'medium confidence'
  }

  return 'high confidence'
}

export function getCatalogImportButtonLabel(
  value: 'direct_match' | 'weak_match' | 'manual_review_required' | undefined,
  trustLevel: 'exact_autolog' | 'exact_review' | 'blocked' | undefined,
  addAfterImport: boolean,
): string {
  if (trustLevel === 'blocked') {
    return 'Fix and save'
  }

  if (trustLevel === 'exact_review') {
    return 'Review and import'
  }

  if (value === 'weak_match' || value === 'manual_review_required') {
    return addAfterImport ? 'Review and import' : 'Review and import'
  }

  return addAfterImport ? 'Import and log' : 'Import and log'
}
