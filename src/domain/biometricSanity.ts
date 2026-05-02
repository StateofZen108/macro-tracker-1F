import type {
  BiometricKind,
  BiometricSanityIssue,
  BiometricSanityResult,
  BiometricSanityStatus,
  BiometricSource,
  BodyMetricValue,
  BodyProgressSnapshot,
  WeightEntry,
  WeightUnit,
} from '../types'

const POUNDS_PER_KILOGRAM = 2.2046226218
const MIN_WEIGHT_LB = 50
const MAX_WEIGHT_LB = 800
const MIN_WEIGHT_KG = 22.7
const MAX_WEIGHT_KG = 362.9
const MAX_WEIGHT_JUMP_FRACTION = 0.15
const MAX_WEIGHT_JUMP_LB = 35
const MAX_WEIGHT_JUMP_KG = 16
const MAX_WEIGHT_OUTLIER_LOOKBACK_DAYS = 14
const MAX_BODY_METRIC_JUMP_FRACTION = 0.25
const MAX_BODY_METRIC_LOOKBACK_DAYS = 30

const BODY_METRIC_RANGES: Record<Exclude<BiometricKind, 'weight'>, { min: number; max: number; unit: 'cm' | '%' }> = {
  waist: { min: 30, max: 250, unit: 'cm' },
  hips: { min: 30, max: 250, unit: 'cm' },
  chest: { min: 30, max: 250, unit: 'cm' },
  thigh: { min: 10, max: 120, unit: 'cm' },
  arm: { min: 10, max: 80, unit: 'cm' },
  body_fat: { min: 3, max: 75, unit: '%' },
}

function issue(code: BiometricSanityIssue['code'], message: string): BiometricSanityIssue {
  return { code, message }
}

function result(
  status: BiometricSanityStatus,
  issues: BiometricSanityIssue[],
  canonicalValue: number,
  canonicalUnit: BiometricSanityResult['canonicalUnit'],
): BiometricSanityResult {
  return {
    status,
    issues,
    canonicalValue,
    canonicalUnit,
    proofEligible: status === 'valid',
  }
}

function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
}

function daysBetween(left: string, right: string): number {
  const leftTime = new Date(`${left}T00:00:00.000Z`).getTime()
  const rightTime = new Date(`${right}T00:00:00.000Z`).getTime()
  return Math.abs(Math.round((rightTime - leftTime) / 86_400_000))
}

export function convertBiometricWeight(weight: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (fromUnit === toUnit) {
    return Math.round(weight * 100) / 100
  }

  return Math.round((fromUnit === 'lb' ? weight / POUNDS_PER_KILOGRAM : weight * POUNDS_PER_KILOGRAM) * 100) / 100
}

export function isWeightProofEligible(entry: Pick<WeightEntry, 'deletedAt' | 'proofEligible' | 'sanityStatus'>): boolean {
  return !entry.deletedAt && entry.proofEligible !== false && entry.sanityStatus !== 'blocked_invalid' && entry.sanityStatus !== 'outlier_review_required'
}

export function isMetricProofEligible(entry: Pick<BodyMetricValue, 'proofEligible' | 'sanityStatus'>): boolean {
  return entry.proofEligible !== false && entry.sanityStatus !== 'blocked_invalid' && entry.sanityStatus !== 'outlier_review_required'
}

function nearestValidWeight(
  date: string,
  existingWeights: readonly WeightEntry[],
  excludeId?: string,
): WeightEntry | null {
  const candidates = existingWeights
    .filter((entry) => entry.id !== excludeId && isWeightProofEligible(entry) && isValidDateKey(entry.date))
    .filter((entry) => daysBetween(entry.date, date) <= MAX_WEIGHT_OUTLIER_LOOKBACK_DAYS)
    .sort((left, right) => daysBetween(left.date, date) - daysBetween(right.date, date))

  return candidates[0] ?? null
}

export function validateWeightValue(input: {
  date: string
  weight: number
  unit: WeightUnit | string
  source: BiometricSource
  existingWeights?: readonly WeightEntry[]
  excludeId?: string
  reviewedAt?: string
}): BiometricSanityResult {
  const unit = input.unit === 'kg' ? 'kg' : input.unit === 'lb' ? 'lb' : null
  const canonicalUnit: 'kg' | 'lb' = unit ?? 'lb'

  if (!isValidDateKey(input.date)) {
    return result('blocked_invalid', [issue('missing_date', 'A valid measurement date is required.')], 0, canonicalUnit)
  }

  if (!unit) {
    return result('blocked_invalid', [issue('unit_invalid', 'Weight must use lb or kg.')], Number(input.weight) || 0, canonicalUnit)
  }

  if (!Number.isFinite(input.weight)) {
    return result('blocked_invalid', [issue('non_finite', 'Weight must be a finite number.')], 0, unit)
  }

  if (input.weight <= 0) {
    return result('blocked_invalid', [issue('negative_or_zero', 'Weight must be greater than zero.')], input.weight, unit)
  }

  const outsideAbsolute =
    unit === 'lb'
      ? input.weight < MIN_WEIGHT_LB || input.weight > MAX_WEIGHT_LB
      : input.weight < MIN_WEIGHT_KG || input.weight > MAX_WEIGHT_KG
  if (outsideAbsolute) {
    return result(
      'blocked_invalid',
      [
        issue(
          'outside_absolute_range',
          `Weight must be between ${unit === 'lb' ? `${MIN_WEIGHT_LB}-${MAX_WEIGHT_LB} lb` : `${MIN_WEIGHT_KG}-${MAX_WEIGHT_KG} kg`}.`,
        ),
      ],
      input.weight,
      unit,
    )
  }

  const nearest = nearestValidWeight(input.date, input.existingWeights ?? [], input.excludeId)
  if (!input.reviewedAt && nearest) {
    const nearestInUnit = convertBiometricWeight(nearest.weight, nearest.unit, unit)
    const absoluteJump = Math.abs(input.weight - nearestInUnit)
    const fractionJump = nearestInUnit > 0 ? absoluteJump / nearestInUnit : 0
    const maxAbsoluteJump = unit === 'lb' ? MAX_WEIGHT_JUMP_LB : MAX_WEIGHT_JUMP_KG
    if (absoluteJump > maxAbsoluteJump || fractionJump > MAX_WEIGHT_JUMP_FRACTION) {
      return result(
        'outlier_review_required',
        [
          issue(
            'day_to_day_jump',
            `This weigh-in jumps ${Math.round(absoluteJump * 10) / 10} ${unit} from ${nearest.date}. Review before it can feed Cut OS proof.`,
          ),
        ],
        input.weight,
        unit,
      )
    }
  }

  return result('valid', [], input.weight, unit)
}

export function applyWeightSanity(
  entry: WeightEntry,
  options: {
    source: BiometricSource
    existingWeights?: readonly WeightEntry[]
    blockInvalid?: boolean
  },
): WeightEntry | null {
  const sanity = validateWeightValue({
    date: entry.date,
    weight: entry.weight,
    unit: entry.unit,
    source: options.source,
    existingWeights: options.existingWeights,
    excludeId: entry.id,
    reviewedAt: entry.reviewedAt,
  })

  if (options.blockInvalid && sanity.status === 'blocked_invalid') {
    return null
  }

  return {
    ...entry,
    sanityStatus: sanity.status,
    sanityIssues: sanity.issues.length ? sanity.issues : undefined,
    proofEligible: sanity.proofEligible,
    reviewedAt: entry.reviewedAt?.trim() || undefined,
  }
}

export function sanitizeWeights(
  weights: readonly WeightEntry[],
  options: { source: BiometricSource; blockInvalid?: boolean } = { source: 'storage_load' },
): {
  weights: WeightEntry[]
  quarantinedCount: number
  blockedCount: number
} {
  const nextWeights: WeightEntry[] = []
  let quarantinedCount = 0
  let blockedCount = 0

  for (const entry of weights) {
    const sanitized = applyWeightSanity(entry, {
      source: options.source,
      existingWeights: nextWeights,
      blockInvalid: options.blockInvalid,
    })
    if (!sanitized) {
      blockedCount += 1
      continue
    }
    if (sanitized.sanityStatus === 'blocked_invalid') {
      blockedCount += 1
    }
    if (sanitized.sanityStatus === 'outlier_review_required') {
      quarantinedCount += 1
    }
    nextWeights.push(sanitized)
  }

  return { weights: nextWeights, quarantinedCount, blockedCount }
}

export function biometricKindForMetric(metric: Pick<BodyMetricValue, 'key' | 'label' | 'unit'>): Exclude<BiometricKind, 'weight'> | null {
  const normalized = `${metric.key} ${metric.label}`.toLowerCase()
  if (normalized.includes('bodyfat') || normalized.includes('body fat')) {
    return 'body_fat'
  }
  if (normalized.includes('waist')) {
    return 'waist'
  }
  if (normalized.includes('hip')) {
    return 'hips'
  }
  if (normalized.includes('chest')) {
    return 'chest'
  }
  if (normalized.includes('thigh')) {
    return 'thigh'
  }
  if (normalized.includes('arm')) {
    return 'arm'
  }
  return null
}

function nearestMetric(
  date: string,
  metric: BodyMetricValue,
  snapshots: readonly BodyProgressSnapshot[],
): BodyMetricValue | null {
  const candidates = snapshots
    .filter((snapshot) => snapshot.date !== date && isValidDateKey(snapshot.date) && daysBetween(snapshot.date, date) <= MAX_BODY_METRIC_LOOKBACK_DAYS)
    .sort((left, right) => daysBetween(left.date, date) - daysBetween(right.date, date))
    .flatMap((snapshot) =>
      snapshot.metrics.filter(
        (entry) =>
          entry.key === metric.key &&
          entry.unit === metric.unit &&
          isMetricProofEligible(entry),
      ),
    )
  return candidates[0] ?? null
}

export function validateBodyMetricValue(input: {
  date: string
  metric: BodyMetricValue
  source: BiometricSource
  existingSnapshots?: readonly BodyProgressSnapshot[]
}): BiometricSanityResult {
  const kind = biometricKindForMetric(input.metric)
  const canonicalUnit = input.metric.unit.trim() === '%' ? '%' : 'cm'
  if (!isValidDateKey(input.date)) {
    return result('blocked_invalid', [issue('missing_date', 'A valid measurement date is required.')], 0, canonicalUnit)
  }

  if (!Number.isFinite(input.metric.value)) {
    return result('blocked_invalid', [issue('non_finite', `${input.metric.label} must be a finite number.`)], 0, canonicalUnit)
  }

  if (input.metric.value <= 0) {
    return result('blocked_invalid', [issue('negative_or_zero', `${input.metric.label} must be greater than zero.`)], input.metric.value, canonicalUnit)
  }

  if (!kind) {
    return result('valid', [], input.metric.value, canonicalUnit)
  }

  const range = BODY_METRIC_RANGES[kind]
  if (input.metric.value < range.min || input.metric.value > range.max) {
    return result(
      'blocked_invalid',
      [
        issue(
          'outside_absolute_range',
          `${input.metric.label} must be between ${range.min}-${range.max} ${range.unit}.`,
        ),
      ],
      input.metric.value,
      range.unit,
    )
  }

  const nearest = nearestMetric(input.date, input.metric, input.existingSnapshots ?? [])
  if (!input.metric.reviewedAt && nearest && nearest.value > 0) {
    const jump = Math.abs(input.metric.value - nearest.value) / nearest.value
    if (jump > MAX_BODY_METRIC_JUMP_FRACTION) {
      return result(
        'outlier_review_required',
        [
          issue(
            'body_metric_jump',
            `${input.metric.label} changed by more than 25% from the nearest saved snapshot. Review before it can feed proof.`,
          ),
        ],
        input.metric.value,
        range.unit,
      )
    }
  }

  return result('valid', [], input.metric.value, range.unit)
}

export function applyBodyMetricSanity(
  metric: BodyMetricValue,
  options: {
    date: string
    source: BiometricSource
    existingSnapshots?: readonly BodyProgressSnapshot[]
    blockInvalid?: boolean
  },
): BodyMetricValue | null {
  const sanity = validateBodyMetricValue({
    date: options.date,
    metric,
    source: options.source,
    existingSnapshots: options.existingSnapshots,
  })

  if (options.blockInvalid && sanity.status === 'blocked_invalid') {
    return null
  }

  return {
    ...metric,
    sanityStatus: sanity.status,
    sanityIssues: sanity.issues.length ? sanity.issues : undefined,
    proofEligible: sanity.proofEligible,
    reviewedAt: metric.reviewedAt?.trim() || undefined,
  }
}

export function sanitizeBodyProgressSnapshot(
  snapshot: BodyProgressSnapshot,
  options: {
    source: BiometricSource
    existingSnapshots?: readonly BodyProgressSnapshot[]
    blockInvalid?: boolean
  },
): {
  snapshot: BodyProgressSnapshot
  quarantinedCount: number
  blockedCount: number
} {
  let quarantinedCount = 0
  let blockedCount = 0
  const metrics = snapshot.metrics.flatMap((metric) => {
    const sanitized = applyBodyMetricSanity(metric, {
      date: snapshot.date,
      source: options.source,
      existingSnapshots: options.existingSnapshots,
      blockInvalid: options.blockInvalid,
    })
    if (!sanitized) {
      blockedCount += 1
      return []
    }
    if (sanitized.sanityStatus === 'blocked_invalid') {
      blockedCount += 1
    }
    if (sanitized.sanityStatus === 'outlier_review_required') {
      quarantinedCount += 1
    }
    return [sanitized]
  })

  return {
    snapshot: {
      ...snapshot,
      metrics,
    },
    quarantinedCount,
    blockedCount,
  }
}

export function firstSanityMessage(result: Pick<BiometricSanityResult, 'issues' | 'status'>): string {
  return result.issues[0]?.message ?? (result.status === 'outlier_review_required' ? 'This biometric value needs review before it can feed proof.' : 'This biometric value is invalid.')
}
