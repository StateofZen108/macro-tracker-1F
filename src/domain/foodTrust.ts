import type {
  Food,
  FoodSnapshot,
  FoodLogEntry,
  FoodReviewItem,
  FoodTrustEvidence,
  FoodTrustEvidenceSource,
  FoodTrustMacroCompleteness,
  FoodTrustServingBasis,
  FoodTrustStatus,
  ImportTrust,
  ImportTrustBlockingIssue,
  TrustRepairReasonCode,
  TrustRepairTask,
} from '../types'
import { buildFoodFieldEvidence, validateFoodAccuracy } from './foodAccuracy'

type FoodTrustInput = {
  food?: Pick<
    Food,
    | 'id'
    | 'source'
    | 'provider'
    | 'barcode'
    | 'servingSize'
    | 'servingUnit'
    | 'calories'
    | 'protein'
    | 'carbs'
    | 'fat'
    | 'importTrust'
    | 'labelNutrition'
    | 'trustEvidence'
  >
  snapshot?: FoodSnapshot
  source?: FoodTrustEvidenceSource
  sourceId?: string
  confidence?: number
  reviewedAt?: string
}

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function normalizeConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.85
  }

  return Math.max(0, Math.min(1, value))
}

function readMacroCompleteness(
  source: Pick<Food, 'calories' | 'protein' | 'carbs' | 'fat'> | FoodSnapshot,
): FoodTrustMacroCompleteness {
  const completeCount = MACRO_KEYS.filter((key) => isFiniteNonNegative(source[key])).length
  if (completeCount === MACRO_KEYS.length) {
    return 'complete'
  }

  return completeCount === 0 ? 'missing' : 'partial'
}

function readServingBasis(input: {
  servingSize: number
  servingUnit: string
  importTrust?: ImportTrust
  reviewedAt?: string
}): FoodTrustServingBasis {
  if (
    !Number.isFinite(input.servingSize) ||
    input.servingSize <= 0 ||
    !input.servingUnit.trim() ||
    input.servingUnit.trim().toLowerCase() === 'unknown'
  ) {
    return 'missing'
  }

  if (
    input.reviewedAt ||
    input.importTrust?.servingBasis === 'serving' ||
    input.importTrust?.servingBasis === '100g' ||
    input.importTrust?.servingBasis === '100ml'
  ) {
    return 'verified'
  }

  return input.importTrust ? 'inferred' : 'verified'
}

function inferSource(input: FoodTrustInput): FoodTrustEvidenceSource {
  if (input.source) {
    return input.source
  }

  if (input.food?.trustEvidence?.source) {
    return input.food.trustEvidence.source
  }

  if (input.snapshot?.trustEvidence?.source) {
    return input.snapshot.trustEvidence.source
  }

  if (input.food?.labelNutrition) {
    return 'ocr'
  }

  if (input.food?.barcode || input.snapshot?.barcode) {
    return 'barcode'
  }

  if (input.food?.provider || input.food?.importTrust) {
    return 'catalog'
  }

  return input.food?.source === 'api' || input.snapshot?.source === 'api' ? 'catalog' : 'custom'
}

function inferSourceId(input: FoodTrustInput, source: FoodTrustEvidenceSource): string {
  if (input.sourceId?.trim()) {
    return input.sourceId.trim()
  }

  if (input.food?.id) {
    return input.food.id
  }

  if (input.food?.barcode || input.snapshot?.barcode) {
    return `${source}:${input.food?.barcode ?? input.snapshot?.barcode}`
  }

  return `${source}:unlinked`
}

function inferReasons(input: {
  importTrust?: ImportTrust
  macroCompleteness: FoodTrustMacroCompleteness
  servingBasis: FoodTrustServingBasis
  providerConflict: boolean
}): ImportTrustBlockingIssue[] {
  const reasons = new Set<ImportTrustBlockingIssue>(input.importTrust?.blockingIssues ?? [])

  if (input.macroCompleteness !== 'complete') {
    reasons.add('missing_macros')
  }

  if (input.servingBasis === 'missing') {
    reasons.add('unknown_serving_basis')
  }

  if (input.servingBasis === 'inferred') {
    reasons.add('estimated_serving')
  }

  if (input.providerConflict) {
    reasons.add('provider_conflict')
  }

  return [...reasons]
}

function inferStatus(input: {
  confidence: number
  reviewedAt?: string
  importTrust?: ImportTrust
  macroCompleteness: FoodTrustMacroCompleteness
  servingBasis: FoodTrustServingBasis
  providerConflict: boolean
  hasBlockingAccuracyIssue?: boolean
  hasReviewAccuracyIssue?: boolean
}): FoodTrustStatus {
  if (input.hasBlockingAccuracyIssue) {
    return 'blocked'
  }

  if (input.macroCompleteness === 'missing' || input.servingBasis === 'missing') {
    return 'blocked'
  }

  if (input.macroCompleteness === 'partial' || input.providerConflict || input.hasReviewAccuracyIssue) {
    if (input.reviewedAt && !input.providerConflict && !input.hasReviewAccuracyIssue) {
      return 'trusted'
    }
    return 'review_required'
  }

  if (input.importTrust?.level === 'blocked') {
    return 'blocked'
  }

  if (
    input.importTrust?.level === 'exact_review' ||
    input.servingBasis === 'inferred' ||
    input.confidence < 0.8
  ) {
    return input.reviewedAt ? 'trusted' : 'review_required'
  }

  return 'trusted'
}

export function classifyFoodTrustEvidence(input: FoodTrustInput): FoodTrustEvidence {
  const source = inferSource(input)
  const sourceId = inferSourceId(input, source)
  const foodLike = input.food ?? input.snapshot
  const importTrust = input.food?.importTrust
  const reviewedAt =
    input.reviewedAt ??
    input.food?.trustEvidence?.reviewedAt ??
    input.snapshot?.trustEvidence?.reviewedAt ??
    input.food?.labelNutrition?.reviewedAt ??
    importTrust?.verifiedAt
  const macroCompleteness = foodLike ? readMacroCompleteness(foodLike) : 'missing'
  const servingBasis = foodLike
    ? readServingBasis({
        servingSize: foodLike.servingSize,
        servingUnit: foodLike.servingUnit,
        importTrust,
        reviewedAt,
      })
    : 'missing'
  const providerConflict = Boolean(importTrust?.blockingIssues.includes('provider_conflict'))
  const confidence = normalizeConfidence(input.confidence ?? input.food?.trustEvidence?.confidence ?? input.snapshot?.trustEvidence?.confidence)
  const fieldEvidence = buildFoodFieldEvidence({
    food: input.food,
    snapshot: input.snapshot,
    source,
    confidence,
    reviewedAt,
  })
  const accuracyIssues = validateFoodAccuracy({
    food: input.food,
    snapshot: input.snapshot,
    source,
    confidence,
    reviewedAt,
  })
  const status = inferStatus({
    confidence,
    reviewedAt,
    importTrust,
    macroCompleteness,
    servingBasis,
    providerConflict,
    hasBlockingAccuracyIssue: accuracyIssues.some((issue) => issue.severity === 'block'),
    hasReviewAccuracyIssue: accuracyIssues.some(
      (issue) => issue.severity === 'review' && issue.blocksCoachingProof,
    ),
  })

  return {
    source,
    sourceId,
    status,
    confidence,
    servingBasis,
    macroCompleteness,
    providerConflict,
    reasons: inferReasons({
      importTrust,
      macroCompleteness,
      servingBasis,
      providerConflict,
    }),
    reviewedAt,
    fieldEvidence,
    accuracyIssues,
    proofEligible: status === 'trusted' && !accuracyIssues.some((issue) => issue.blocksCoachingProof),
  }
}

export function isFoodTrustedForCoaching(evidence: FoodTrustEvidence | null | undefined): boolean {
  return evidence?.status === 'trusted'
}

function repairReasonFromEvidence(evidence: FoodTrustEvidence): TrustRepairReasonCode {
  if (evidence.accuracyIssues?.some((issue) => issue.code === 'impossible_value')) {
    return 'impossible_value'
  }

  if (evidence.accuracyIssues?.some((issue) => issue.code === 'macro_energy_mismatch')) {
    return 'missing_macros'
  }

  if (evidence.source === 'ai_photo' && !evidence.reviewedAt) {
    return 'unreviewed_ai'
  }

  if (evidence.reasons.includes('missing_macros') || evidence.macroCompleteness !== 'complete') {
    return 'missing_macros'
  }

  if (
    evidence.reasons.includes('unknown_serving_basis') ||
    evidence.reasons.includes('estimated_serving') ||
    evidence.servingBasis !== 'verified'
  ) {
    return 'missing_serving_basis'
  }

  if (evidence.providerConflict || evidence.reasons.includes('provider_conflict')) {
    return 'provider_conflict'
  }

  if (evidence.reasons.includes('low_ocr_confidence') || evidence.confidence < 0.8) {
    return 'low_confidence'
  }

  return evidence.status === 'blocked' ? 'impossible_value' : 'low_confidence'
}

function repairSourceFromReviewItem(item: FoodReviewItem): FoodTrustEvidenceSource {
  if (item.source === 'ocr') {
    return 'ocr'
  }

  if (item.source === 'catalog_import') {
    return 'import'
  }

  if (item.barcode) {
    return 'barcode'
  }

  return 'custom'
}

function repairReasonFromReviewItem(item: FoodReviewItem): TrustRepairReasonCode {
  const reason = item.reason.toLowerCase()

  if (reason.includes('macro')) {
    return 'missing_macros'
  }

  if (reason.includes('serving') || reason.includes('basis')) {
    return 'missing_serving_basis'
  }

  if (reason.includes('conflict')) {
    return 'provider_conflict'
  }

  return 'low_confidence'
}

export function buildTrustRepairTasks(input: {
  date: string
  entries: FoodLogEntry[]
  foodReviewQueue?: FoodReviewItem[]
}): TrustRepairTask[] {
  const tasksById = new Map<string, TrustRepairTask>()

  for (const entry of input.entries) {
    if (entry.deletedAt) {
      continue
    }

    const evidence =
      entry.snapshot.trustEvidence ??
      classifyFoodTrustEvidence({
        snapshot: entry.snapshot,
        sourceId: entry.foodId ?? entry.id,
      })
    const shouldRepair = evidence.status !== 'trusted' || entry.needsReview === true

    if (!shouldRepair) {
      continue
    }

    const task: TrustRepairTask = {
      id: `trust-repair:${input.date}:${entry.id}`,
      foodId: entry.foodId,
      logEntryId: entry.id,
      source: evidence.source,
      reasonCode: repairReasonFromEvidence(evidence),
      status: 'open',
      blockingCoachProof: evidence.status !== 'trusted' || entry.needsReview === true,
    }
    tasksById.set(task.id, task)
  }

  for (const item of input.foodReviewQueue ?? []) {
    if (item.status !== 'pending') {
      continue
    }

    if (item.linkedEntryDate && item.linkedEntryDate !== input.date) {
      continue
    }

    const task: TrustRepairTask = {
      id: `trust-repair:${input.date}:${item.id}`,
      foodId: item.linkedFoodId,
      logEntryId: item.linkedEntryId,
      source: repairSourceFromReviewItem(item),
      reasonCode: repairReasonFromReviewItem(item),
      status: 'open',
      blockingCoachProof: true,
    }
    tasksById.set(task.id, task)
  }

  return [...tasksById.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function getFoodTrustLabel(evidence: FoodTrustEvidence): string {
  if (evidence.status === 'trusted') {
    return 'Trusted'
  }

  if (evidence.status === 'blocked') {
    return 'Blocked'
  }

  return 'Review'
}

export function getFoodTrustDetail(evidence: FoodTrustEvidence): string {
  if (evidence.status === 'trusted') {
    return evidence.reviewedAt ? 'Reviewed and coaching-grade' : 'Complete macros and serving basis'
  }

  const blockingIssue = evidence.accuracyIssues?.find((issue) => issue.blocksCoachingProof)
  if (blockingIssue) {
    return blockingIssue.message
  }

  if (evidence.reasons.includes('missing_macros')) {
    return 'Missing calories or macros'
  }

  if (evidence.reasons.includes('unknown_serving_basis')) {
    return 'Serving basis is missing'
  }

  if (evidence.reasons.includes('provider_conflict')) {
    return 'Provider data conflict'
  }

  if (evidence.servingBasis === 'inferred') {
    return 'Confirm serving basis'
  }

  return 'Confirm before coaching use'
}
