import type { LabelReviewValues, LabelReviewWarning } from '../components/LabelReviewSheet'
import type {
  FoodDraft,
  ImportTrust,
  LabelNutritionPanel,
  LabelOcrReviewSession,
  LabelOcrServingInterpretation,
  LabelOcrServingIssueCode,
} from '../types'

const ORIGINAL_SERVING_WARNING =
  'Serving basis could not be resolved. Enter a serving size before saving.'
const ESTIMATED_SERVING_WARNING =
  'Serving size was estimated from provider data. Confirm it before saving.'
const LOW_CONFIDENCE_WARNING =
  'OCR confidence was too low to trust the serving basis. Confirm it before saving.'
const PROVIDER_CONFLICT_WARNING =
  'Provider and label serving data disagree. Choose the correct serving basis before saving.'
const CHOOSE_SERVING_WARNING = 'Choose the correct serving basis before saving.'
const RECOMPUTE_MACROS_NOTICE = 'Macros were edited manually. Recalculate from selected basis?'
const OCR_REVIEW_REQUIRED_BADGE = 'Review required'
const OCR_MANUAL_REQUIRED_BADGE = 'Manual review required'
const MACRO_FIELDS: Array<keyof LabelReviewValues> = ['calories', 'protein', 'carbs', 'fat', 'fiber']

export interface OcrServingResolution {
  servingSize: number
  servingUnit: string
  source: 'labelTextMetric' | 'metricDraft' | 'per100Metric' | 'originalServing'
  warningMessage?: string
}

export interface LabelReviewState {
  badgeLabel: string
  saveLabel: string
  topWarning: string
  saveBlocked: boolean
  showManualServingFields: boolean
  warnings: LabelReviewWarning[]
  selectedInterpretationId: string | null
  noticeMessage?: string
}

function formatDraftNumber(value: number | undefined): string {
  return value === undefined ? '' : `${Math.round(value * 1000) / 1000}`
}

function parseRequiredNumber(label: string, value: string, minimum = 0): number {
  const parsedValue = Number.parseFloat(value)
  if (!Number.isFinite(parsedValue) || parsedValue < minimum) {
    throw new Error(`${label} must be ${minimum === 0 ? 'a valid number' : `at least ${minimum}`}.`)
  }

  return parsedValue
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  const parsedValue = Number.parseFloat(value)
  return Number.isFinite(parsedValue) ? parsedValue : undefined
}

function roundValue(value: number): number {
  return Math.round(value * 1000) / 1000
}

function isMacroField(field: keyof LabelReviewValues): field is 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' {
  return MACRO_FIELDS.includes(field)
}

function normalizeMetricUnit(value: string | undefined): 'g' | 'ml' | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') {
    return 'g'
  }

  if (
    normalized === 'ml' ||
    normalized === 'milliliter' ||
    normalized === 'milliliters' ||
    normalized === 'millilitre' ||
    normalized === 'millilitres'
  ) {
    return 'ml'
  }

  return null
}

function parseMetricAmount(text: string | undefined): { servingSize: number; servingUnit: 'g' | 'ml' } | null {
  if (!text?.trim()) {
    return null
  }

  const value = text.trim()
  const parenthesizedMatches = [...value.matchAll(/\(([^)]*)\)/g)]
  for (const match of parenthesizedMatches) {
    const nestedAmount = parseMetricAmount(match[1])
    if (nestedAmount) {
      return nestedAmount
    }
  }

  const directMatch = value.match(/\b(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i)
  if (!directMatch) {
    return null
  }

  const parsedSize = Number.parseFloat(directMatch[1].replace(',', '.'))
  const servingUnit = normalizeMetricUnit(directMatch[2])
  if (!Number.isFinite(parsedSize) || parsedSize <= 0 || !servingUnit) {
    return null
  }

  return {
    servingSize: parsedSize,
    servingUnit,
  }
}

function getOriginalServingText(panel: LabelNutritionPanel | undefined): string | undefined {
  const originalText = panel?.servingSizeText?.trim()
  return originalText ? originalText : undefined
}

function formatCalorieSummary(calories: number | undefined): string {
  return typeof calories === 'number' && Number.isFinite(calories) ? `${Math.round(calories)} cal basis` : 'Nutrition unavailable'
}

function getFieldNumber(
  session: LabelOcrReviewSession,
  normalizedKey: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugars' | 'salt' | 'sodium',
): number | undefined {
  const matchedField = session.fieldCandidates.find(
    (field) => field.normalizedKey === normalizedKey && typeof field.value === 'number',
  )

  return matchedField && typeof matchedField.value === 'number' ? matchedField.value : undefined
}

function getBaseMacroNumbers(session: LabelOcrReviewSession): Record<'calories' | 'protein' | 'carbs' | 'fat' | 'fiber', number | undefined> {
  return {
    calories: getFieldNumber(session, 'calories') ?? session.foodDraft.calories,
    protein: getFieldNumber(session, 'protein') ?? session.foodDraft.protein,
    carbs: getFieldNumber(session, 'carbs') ?? session.foodDraft.carbs,
    fat: getFieldNumber(session, 'fat') ?? session.foodDraft.fat,
    fiber: getFieldNumber(session, 'fiber') ?? session.foodDraft.fiber,
  }
}

function scaleMacros(
  session: LabelOcrReviewSession,
  servingSize: number,
  servingUnit: string,
): Record<'calories' | 'protein' | 'carbs' | 'fat' | 'fiber', number | undefined> {
  const base = getBaseMacroNumbers(session)
  const originalSize = session.foodDraft.servingSize
  const originalUnit = normalizeMetricUnit(session.foodDraft.servingUnit)
  const normalizedTargetUnit = normalizeMetricUnit(servingUnit)

  if (
    !normalizedTargetUnit ||
    !originalUnit ||
    normalizedTargetUnit !== originalUnit ||
    !Number.isFinite(originalSize) ||
    originalSize <= 0
  ) {
    return base
  }

  const factor = servingSize / originalSize
  return {
    calories: base.calories === undefined ? undefined : roundValue(base.calories * factor),
    protein: base.protein === undefined ? undefined : roundValue(base.protein * factor),
    carbs: base.carbs === undefined ? undefined : roundValue(base.carbs * factor),
    fat: base.fat === undefined ? undefined : roundValue(base.fat * factor),
    fiber: base.fiber === undefined ? undefined : roundValue(base.fiber * factor),
  }
}

function deriveServingIssueCodes(session: LabelOcrReviewSession): LabelOcrServingIssueCode[] {
  if (session.servingFieldIssueCodes?.length) {
    return [...new Set(session.servingFieldIssueCodes)]
  }

  const issueCodes = new Set<LabelOcrServingIssueCode>()
  const labelServingText = session.servingSizeText ?? getOriginalServingText(session.foodDraft.labelNutrition)
  const labelMetric = parseMetricAmount(labelServingText)
  const draftMetricUnit = normalizeMetricUnit(session.foodDraft.servingUnit)
  const hasMetricDraft =
    draftMetricUnit !== null &&
    Number.isFinite(session.foodDraft.servingSize) &&
    session.foodDraft.servingSize > 0

  if (!labelMetric && !hasMetricDraft) {
    issueCodes.add('unknown_serving_basis')
  }

  if (
    labelMetric &&
    hasMetricDraft &&
    (Math.abs(labelMetric.servingSize - session.foodDraft.servingSize) > 0.0001 ||
      labelMetric.servingUnit !== draftMetricUnit)
  ) {
    issueCodes.add('provider_conflict')
  }

  const servingField = session.fieldCandidates.find((field) => field.normalizedKey === undefined)
  if (servingField?.confidence !== undefined && servingField.confidence < 0.65) {
    issueCodes.add('low_ocr_confidence')
  }

  if (!labelMetric && hasMetricDraft && !getOriginalServingText(session.foodDraft.labelNutrition)) {
    issueCodes.add('estimated_serving')
  }

  if (
    hasMetricDraft &&
    (draftMetricUnit === 'g' || draftMetricUnit === 'ml') &&
    Math.abs(session.foodDraft.servingSize - 100) < 0.0001 &&
    !labelMetric
  ) {
    issueCodes.add('per100_fallback')
  }

  return [...issueCodes]
}

function buildServingInterpretations(session: LabelOcrReviewSession): LabelOcrServingInterpretation[] {
  if (session.servingInterpretations?.length) {
    return session.servingInterpretations
  }

  const labelServingText = session.servingSizeText ?? getOriginalServingText(session.foodDraft.labelNutrition)
  const labelMetric = parseMetricAmount(labelServingText)
  const originalUnit = normalizeMetricUnit(session.foodDraft.servingUnit)
  const issueCodes = deriveServingIssueCodes(session)
  const interpretations: LabelOcrServingInterpretation[] = []

  if (labelMetric) {
    interpretations.push({
      id: 'explicit_metric',
      kind: 'explicit_metric',
      label: `${labelMetric.servingSize} ${labelMetric.servingUnit}`,
      source: originalUnit && originalUnit === labelMetric.servingUnit ? 'label_and_provider' : 'label',
      servingSize: labelMetric.servingSize,
      servingUnit: labelMetric.servingUnit,
      calorieSummary: formatCalorieSummary(scaleMacros(session, labelMetric.servingSize, labelMetric.servingUnit).calories),
      selectedByDefault: issueCodes.length === 0,
    })

    if (Number.isFinite(session.servingsPerContainer) && (session.servingsPerContainer ?? 0) > 1) {
      const totalServingSize = roundValue(labelMetric.servingSize * (session.servingsPerContainer ?? 1))
      interpretations.push({
        id: 'container_metric',
        kind: 'container_metric',
        label: `${session.servingsPerContainer} servings per container`,
        source: 'label',
        servingSize: totalServingSize,
        servingUnit: labelMetric.servingUnit,
        calorieSummary: formatCalorieSummary(scaleMacros(session, totalServingSize, labelMetric.servingUnit).calories),
      })
    }

    interpretations.push({
      id: 'per100_metric',
      kind: 'per100_metric',
      label: labelMetric.servingUnit === 'ml' ? 'Per 100 ml' : 'Per 100 g',
      source: 'label',
      servingSize: 100,
      servingUnit: labelMetric.servingUnit,
      calorieSummary: formatCalorieSummary(scaleMacros(session, 100, labelMetric.servingUnit).calories),
      selectedByDefault: interpretations.length === 1 && issueCodes.includes('per100_fallback'),
    })
  } else if (
    originalUnit &&
    Number.isFinite(session.foodDraft.servingSize) &&
    session.foodDraft.servingSize > 0 &&
    Math.abs(session.foodDraft.servingSize - 100) < 0.0001
  ) {
    interpretations.push({
      id: 'per100_metric',
      kind: 'per100_metric',
      label: originalUnit === 'ml' ? 'Per 100 ml' : 'Per 100 g',
      source: 'provider',
      servingSize: 100,
      servingUnit: originalUnit,
      calorieSummary: formatCalorieSummary(getBaseMacroNumbers(session).calories),
      selectedByDefault: true,
    })
  }

  interpretations.push({
    id: 'manual',
    kind: 'manual',
    label: 'Enter manually',
    source: 'manual',
    calorieSummary: 'Manual serving entry',
  })

  return interpretations
}

function getSelectedInterpretation(
  session: LabelOcrReviewSession,
  selectedInterpretationId: string | null | undefined,
): LabelOcrServingInterpretation | null {
  const interpretations = buildServingInterpretations(session)
  if (selectedInterpretationId) {
    return interpretations.find((interpretation) => interpretation.id === selectedInterpretationId) ?? null
  }

  return interpretations.find((interpretation) => interpretation.selectedByDefault) ?? null
}

function mapSessionWarning(severity: LabelReviewWarning['severity'], message: string, id: string): LabelReviewWarning {
  return {
    id,
    severity,
    message,
  }
}

function buildSessionWarnings(session: LabelOcrReviewSession): LabelReviewWarning[] {
  return session.warnings.map((warning, index) =>
    mapSessionWarning(warning.toLowerCase().includes('missing') ? 'warning' : 'info', warning, `ocr-warning-${index + 1}`),
  )
}

function getTopWarning(session: LabelOcrReviewSession, selectedInterpretationId: string | null): string {
  if (session.topWarning?.trim()) {
    return session.topWarning.trim()
  }

  const issueCodes = deriveServingIssueCodes(session)
  const selectedInterpretation = getSelectedInterpretation(session, selectedInterpretationId)
  const machineInterpretations = buildServingInterpretations(session).filter(
    (interpretation) => interpretation.kind !== 'manual',
  )

  if (issueCodes.includes('provider_conflict')) {
    return PROVIDER_CONFLICT_WARNING
  }

  if (issueCodes.includes('low_ocr_confidence')) {
    return LOW_CONFIDENCE_WARNING
  }

  if (issueCodes.includes('estimated_serving')) {
    return ESTIMATED_SERVING_WARNING
  }

  if (
    !selectedInterpretation &&
    machineInterpretations.length > 1
  ) {
    return CHOOSE_SERVING_WARNING
  }

  if (selectedInterpretation?.kind === 'per100_metric') {
    return selectedInterpretation.servingUnit === 'ml'
      ? 'Using per 100ml nutrition because serving data was incomplete.'
      : 'Using per 100g nutrition because serving data was incomplete.'
  }

  if (
    selectedInterpretation &&
    selectedInterpretation.kind !== 'manual' &&
    selectedInterpretation.servingSize !== undefined &&
    selectedInterpretation.servingUnit
  ) {
    return `Using label/provider serving: ${selectedInterpretation.servingSize} ${selectedInterpretation.servingUnit}.`
  }

  return ORIGINAL_SERVING_WARNING
}

export function resolveOcrServingBasis(session: LabelOcrReviewSession): OcrServingResolution {
  const originalServingSize = session.foodDraft.servingSize
  const originalServingUnit = session.foodDraft.servingUnit.trim() || 'serving'
  const originalServingText = session.servingSizeText ?? getOriginalServingText(session.foodDraft.labelNutrition)
  const normalizedDraftUnit = normalizeMetricUnit(originalServingUnit)
  if (normalizedDraftUnit && Number.isFinite(originalServingSize) && originalServingSize > 0) {
    return {
      servingSize: originalServingSize,
      servingUnit: normalizedDraftUnit,
      source: originalServingSize === 100 && !originalServingText ? 'per100Metric' : 'metricDraft',
    }
  }

  const metricFromLabel = parseMetricAmount(originalServingText)
  if (metricFromLabel) {
    return {
      ...metricFromLabel,
      source: 'labelTextMetric',
    }
  }

  return {
    servingSize: originalServingSize,
    servingUnit: originalServingUnit,
    source: 'originalServing',
    warningMessage: ORIGINAL_SERVING_WARNING,
  }
}

export function hydrateLabelReviewSession(session: LabelOcrReviewSession): LabelOcrReviewSession {
  const servingInterpretations = buildServingInterpretations(session)
  const issueCodes = deriveServingIssueCodes(session)
  const selectedDefault = servingInterpretations.find((interpretation) => interpretation.selectedByDefault)?.id ?? null

  return {
    ...session,
    servingSizeText: session.servingSizeText ?? getOriginalServingText(session.foodDraft.labelNutrition),
    servingFieldIssueCodes: issueCodes,
    servingInterpretations,
    topWarning: getTopWarning(
      {
        ...session,
        servingInterpretations,
        servingFieldIssueCodes: issueCodes,
      },
      selectedDefault,
    ),
  }
}

export function getDefaultServingInterpretationId(session: LabelOcrReviewSession): string | null {
  const hydratedSession = hydrateLabelReviewSession(session)
  return (
    hydratedSession.servingInterpretations?.find((interpretation) => interpretation.selectedByDefault)?.id ??
    null
  )
}

function applyMacroValues(
  currentValues: LabelReviewValues,
  nextMacros: Record<'calories' | 'protein' | 'carbs' | 'fat' | 'fiber', number | undefined>,
): LabelReviewValues {
  return {
    ...currentValues,
    calories: formatDraftNumber(nextMacros.calories),
    protein: formatDraftNumber(nextMacros.protein),
    carbs: formatDraftNumber(nextMacros.carbs),
    fat: formatDraftNumber(nextMacros.fat),
    fiber: formatDraftNumber(nextMacros.fiber),
  }
}

function buildValuesFromInterpretation(
  session: LabelOcrReviewSession,
  interpretation: LabelOcrServingInterpretation | null,
  currentValues?: LabelReviewValues,
  overwriteMacros = true,
): LabelReviewValues {
  const baseValues: LabelReviewValues = currentValues ?? {
    name: session.foodDraft.name,
    brand: session.foodDraft.brand ?? '',
    servingSize: formatDraftNumber(session.foodDraft.servingSize),
    servingUnit: session.foodDraft.servingUnit,
    calories: formatDraftNumber(session.foodDraft.calories),
    protein: formatDraftNumber(session.foodDraft.protein),
    carbs: formatDraftNumber(session.foodDraft.carbs),
    fat: formatDraftNumber(session.foodDraft.fat),
    fiber: formatDraftNumber(session.foodDraft.fiber),
    barcode: session.foodDraft.barcode ?? '',
  }

  if (!interpretation || interpretation.kind === 'manual') {
    return baseValues
  }

  const servingSize = interpretation.servingSize ?? session.foodDraft.servingSize
  const servingUnit = interpretation.servingUnit ?? session.foodDraft.servingUnit
  const scaledMacros = scaleMacros(session, servingSize, servingUnit)
  const valuesWithServing = {
    ...baseValues,
    servingSize: formatDraftNumber(servingSize),
    servingUnit,
  }

  return overwriteMacros ? applyMacroValues(valuesWithServing, scaledMacros) : valuesWithServing
}

export function applyOcrServingInterpretation(
  currentValues: LabelReviewValues,
  session: LabelOcrReviewSession,
  selectedInterpretationId: string | null,
  overwriteMacros: boolean,
): LabelReviewValues {
  const interpretation = getSelectedInterpretation(session, selectedInterpretationId)
  return buildValuesFromInterpretation(session, interpretation, currentValues, overwriteMacros)
}

export function buildLabelReviewValues(
  session: LabelOcrReviewSession,
  selectedInterpretationId?: string | null,
): LabelReviewValues {
  const hydratedSession = hydrateLabelReviewSession(session)
  return buildValuesFromInterpretation(
    hydratedSession,
    getSelectedInterpretation(hydratedSession, selectedInterpretationId),
  )
}

export function buildLabelReviewWarnings(
  session: LabelOcrReviewSession,
  values: LabelReviewValues,
  selectedInterpretationId?: string | null,
): LabelReviewWarning[] {
  const hydratedSession = hydrateLabelReviewSession(session)
  const warnings = buildSessionWarnings(hydratedSession)
  const topWarning = getTopWarning(hydratedSession, selectedInterpretationId ?? null)

  if (!warnings.some((warning) => warning.message === topWarning)) {
    warnings.unshift(
      mapSessionWarning(
        topWarning === PROVIDER_CONFLICT_WARNING ||
          topWarning === LOW_CONFIDENCE_WARNING ||
          topWarning === ESTIMATED_SERVING_WARNING ||
          topWarning === ORIGINAL_SERVING_WARNING ||
          topWarning === CHOOSE_SERVING_WARNING
          ? 'blocked'
          : 'warning',
        topWarning,
        'ocr-top-warning',
      ),
    )
  }

  const selectedInterpretation = getSelectedInterpretation(hydratedSession, selectedInterpretationId)
  if (
    selectedInterpretation?.kind === 'manual' &&
    (!values.servingSize.trim() || !values.servingUnit.trim())
  ) {
    warnings.unshift(
      mapSessionWarning('blocked', ORIGINAL_SERVING_WARNING, 'ocr-manual-serving-required'),
    )
  }

  return warnings
}

export function buildLabelReviewState(
  session: LabelOcrReviewSession,
  values: LabelReviewValues,
  selectedInterpretationId: string | null,
  manualMacrosEdited: boolean,
): LabelReviewState {
  const hydratedSession = hydrateLabelReviewSession(session)
  const warnings = buildLabelReviewWarnings(hydratedSession, values, selectedInterpretationId)
  const selectedInterpretation = getSelectedInterpretation(hydratedSession, selectedInterpretationId)
  const machineInterpretationCount =
    hydratedSession.servingInterpretations?.filter((interpretation) => interpretation.kind !== 'manual').length ?? 0
  const showManualServingFields = selectedInterpretation?.kind === 'manual'
  const missingManualFields =
    showManualServingFields && (!values.servingSize.trim() || !values.servingUnit.trim())
  const requiresSelection =
    machineInterpretationCount > 1 && !selectedInterpretationId
  const topWarning = getTopWarning(hydratedSession, selectedInterpretationId)
  const saveBlocked =
    warnings.some((warning) => warning.severity === 'blocked') || missingManualFields || requiresSelection
  const severeTopWarning =
    topWarning === PROVIDER_CONFLICT_WARNING ||
    topWarning === LOW_CONFIDENCE_WARNING ||
    topWarning === ESTIMATED_SERVING_WARNING ||
    topWarning === ORIGINAL_SERVING_WARNING

  return {
    badgeLabel: severeTopWarning ? OCR_MANUAL_REQUIRED_BADGE : OCR_REVIEW_REQUIRED_BADGE,
    saveLabel: severeTopWarning ? 'Fix and save' : 'Save reviewed food',
    topWarning,
    saveBlocked,
    showManualServingFields,
    warnings,
    selectedInterpretationId,
    noticeMessage:
      manualMacrosEdited && selectedInterpretation?.kind !== 'manual' ? RECOMPUTE_MACROS_NOTICE : undefined,
  }
}

function buildImportTrust(
  selectedInterpretation: LabelOcrServingInterpretation | null,
  values: LabelReviewValues,
): ImportTrust {
  const normalizedServingUnit = normalizeMetricUnit(values.servingUnit)
  const servingSize = parseRequiredNumber('Serving size', values.servingSize, 0.01)

  if (selectedInterpretation?.kind === 'per100_metric' && normalizedServingUnit === 'g') {
    return {
      level: 'exact_review',
      servingBasis: '100g',
      servingBasisSource: 'manual_review',
      blockingIssues: [],
      verifiedAt: new Date().toISOString(),
    }
  }

  if (selectedInterpretation?.kind === 'per100_metric' && normalizedServingUnit === 'ml') {
    return {
      level: 'exact_review',
      servingBasis: '100ml',
      servingBasisSource: 'manual_review',
      blockingIssues: [],
      verifiedAt: new Date().toISOString(),
    }
  }

  if (normalizedServingUnit === 'g' && Math.abs(servingSize - 100) < 0.0001) {
    return {
      level: 'exact_review',
      servingBasis: '100g',
      servingBasisSource: 'manual_review',
      blockingIssues: [],
      verifiedAt: new Date().toISOString(),
    }
  }

  if (normalizedServingUnit === 'ml' && Math.abs(servingSize - 100) < 0.0001) {
    return {
      level: 'exact_review',
      servingBasis: '100ml',
      servingBasisSource: 'manual_review',
      blockingIssues: [],
      verifiedAt: new Date().toISOString(),
    }
  }

  return {
    level: 'exact_review',
    servingBasis: 'serving',
    servingBasisSource: 'manual_review',
    blockingIssues: [],
    verifiedAt: new Date().toISOString(),
  }
}

export function buildOcrDraftFromReview(
  values: LabelReviewValues,
  session: LabelOcrReviewSession,
  selectedInterpretationId?: string | null,
): FoodDraft {
  const hydratedSession = hydrateLabelReviewSession(session)
  const selectedInterpretation = getSelectedInterpretation(hydratedSession, selectedInterpretationId)
  const servingSize = parseRequiredNumber('Serving size', values.servingSize, 0.01)
  const calories = parseRequiredNumber('Calories', values.calories)
  const protein = parseRequiredNumber('Protein', values.protein)
  const carbs = parseRequiredNumber('Carbs', values.carbs)
  const fat = parseRequiredNumber('Fat', values.fat)
  const fiber = parseOptionalNumber(values.fiber)
  const reviewedValues = new Map([
    ['calories', calories],
    ['protein', protein],
    ['carbs', carbs],
    ['fat', fat],
    ...(fiber !== undefined ? ([['fiber', fiber]] as const) : []),
  ])
  const originalServingText = hydratedSession.servingSizeText ?? getOriginalServingText(session.foodDraft.labelNutrition)

  return {
    name: values.name.trim(),
    brand: values.brand.trim() || undefined,
    servingSize,
    servingUnit: values.servingUnit.trim(),
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugars: getFieldNumber(hydratedSession, 'sugars'),
    salt: getFieldNumber(hydratedSession, 'salt'),
    sodium: getFieldNumber(hydratedSession, 'sodium'),
    labelNutrition: {
      fields: [...hydratedSession.fieldCandidates, ...hydratedSession.unmappedFields].map((field) => ({
        normalizedKey: field.normalizedKey,
        rawLabel: field.rawLabel,
        value:
          field.normalizedKey && reviewedValues.has(field.normalizedKey)
            ? reviewedValues.get(field.normalizedKey) ?? field.value
            : field.value,
        unit: field.unit,
      })),
      servingSizeText: originalServingText ?? `${values.servingSize.trim()} ${values.servingUnit.trim()}`.trim(),
      servingsPerContainer: hydratedSession.servingsPerContainer,
      locale: hydratedSession.foodDraft.labelNutrition?.locale ?? 'unknown',
      source: 'label_ocr',
      reviewedAt: new Date().toISOString(),
    },
    barcode: values.barcode.trim() || undefined,
    source: hydratedSession.foodDraft.source,
    importTrust: buildImportTrust(selectedInterpretation, values),
  }
}

export function wasMacroFieldEdited(field: keyof LabelReviewValues): boolean {
  return isMacroField(field)
}
