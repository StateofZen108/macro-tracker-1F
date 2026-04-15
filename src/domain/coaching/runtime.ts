import type {
  CoachingBlockedReason,
  CoachingConfidence,
  CoachingReasonCode,
  LegacyCoachingCode,
  UserSettings,
} from '../../types'
import { clamp, buildWindowDates, compareDateKeys, roundTo } from './engine/_helpers'
import { COACH_ENGINE_CONFIG } from './engine/_constants'

export type RecoverySeverity = 'green' | 'yellow' | 'red'

export interface CoachPhaseRecord {
  type: 'psmf' | 'diet_break'
  status: 'planned' | 'active' | 'expired' | 'completed' | 'cancelled'
  startDate: string
  plannedEndDate: string
  actualEndDate?: string
  notes?: string
}

export interface CoachRefeedRecord {
  date: string
  calorieTargetOverride?: number
  notes?: string
}

export interface CoachRecoveryCheckIn {
  date: string
  energyScore?: number
  hungerScore?: number
  sorenessScore?: number
  sleepQualityScore?: number
  notes?: string
}

export interface CoachWellnessRecord {
  date: string
  steps?: number
  sleepMinutes?: number
  restingHeartRate?: number
  stressScore?: number
  bodyBatteryMax?: number
  intensityMinutes?: number
  derivedCardioMinutes?: number
}

export interface CoachRuntimeState {
  phasePlan?: {
    phases?: CoachPhaseRecord[]
    refeeds?: CoachRefeedRecord[]
  }
  recovery?: {
    checkIns?: CoachRecoveryCheckIn[]
    wellness?: CoachWellnessRecord[]
  }
}

export interface CoachPhaseAssessment {
  hasRuntime: boolean
  activePhase: CoachPhaseRecord | null
  requiresPsmfPhase: boolean
  phaseExpired: boolean
  hasDietBreakActive: boolean
  hasPlannedRefeed: boolean
  blockedReasons: CoachingBlockedReason[]
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
}

export interface CoachRecoveryAssessment {
  hasRuntime: boolean
  latestSeverity: RecoverySeverity | null
  dailyAssessments: Array<{
    date: string
    score: number
    severity: RecoverySeverity
    reasons: string[]
  }>
  yellowDaysLast7: number
  redDaysLast3: number
  confidenceBandShift: number
  confidenceScoreShift: number
  blockedReasons: CoachingBlockedReason[]
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>
}

export interface CoachRuntimeAssessment {
  phase: CoachPhaseAssessment
  recovery: CoachRecoveryAssessment
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parsePhaseRecord(value: unknown): CoachPhaseRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const type = value.type === 'diet_break' ? 'diet_break' : value.type === 'psmf' ? 'psmf' : null
  const status =
    value.status === 'planned' ||
    value.status === 'active' ||
    value.status === 'expired' ||
    value.status === 'completed' ||
    value.status === 'cancelled'
      ? value.status
      : null
  const startDate = parseString(value.startDate)
  const plannedEndDate = parseString(value.plannedEndDate)

  if (!type || !status || !startDate || !plannedEndDate) {
    return null
  }

  return {
    type,
    status,
    startDate,
    plannedEndDate,
    actualEndDate: parseString(value.actualEndDate),
    notes: parseString(value.notes),
  }
}

function parseRefeedRecord(value: unknown): CoachRefeedRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const date = parseString(value.date)
  if (!date) {
    return null
  }

  return {
    date,
    calorieTargetOverride: parseNumber(value.calorieTargetOverride),
    notes: parseString(value.notes),
  }
}

function parseRecoveryCheckIn(value: unknown): CoachRecoveryCheckIn | null {
  if (!isRecord(value)) {
    return null
  }

  const date = parseString(value.date)
  if (!date) {
    return null
  }

  return {
    date,
    energyScore: parseNumber(value.energyScore),
    hungerScore: parseNumber(value.hungerScore),
    sorenessScore: parseNumber(value.sorenessScore),
    sleepQualityScore: parseNumber(value.sleepQualityScore),
    notes: parseString(value.notes),
  }
}

function parseWellnessRecord(value: unknown): CoachWellnessRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const date = parseString(value.date)
  if (!date) {
    return null
  }

  return {
    date,
    steps: parseNumber(value.steps),
    sleepMinutes: parseNumber(value.sleepMinutes),
    restingHeartRate: parseNumber(value.restingHeartRate),
    stressScore: parseNumber(value.stressScore),
    bodyBatteryMax: parseNumber(value.bodyBatteryMax),
    intensityMinutes: parseNumber(value.intensityMinutes),
    derivedCardioMinutes: parseNumber(value.derivedCardioMinutes),
  }
}

function normalizeCoachRuntimeState(raw: Record<string, unknown>): CoachRuntimeState | undefined {
  const phasePlan = isRecord(raw.phasePlan)
    ? {
        phases: Array.isArray(raw.phasePlan.phases)
          ? raw.phasePlan.phases
              .map((phase) => parsePhaseRecord(phase))
              .filter((phase): phase is CoachPhaseRecord => phase !== null)
          : undefined,
        refeeds: Array.isArray(raw.phasePlan.refeeds)
          ? raw.phasePlan.refeeds
              .map((refeed) => parseRefeedRecord(refeed))
              .filter((refeed): refeed is CoachRefeedRecord => refeed !== null)
          : undefined,
      }
    : undefined

  const recovery = isRecord(raw.recovery)
    ? {
        checkIns: Array.isArray(raw.recovery.checkIns)
          ? raw.recovery.checkIns
              .map((checkIn) => parseRecoveryCheckIn(checkIn))
              .filter((checkIn): checkIn is CoachRecoveryCheckIn => checkIn !== null)
          : undefined,
        wellness: Array.isArray(raw.recovery.wellness)
          ? raw.recovery.wellness
              .map((record) => parseWellnessRecord(record))
              .filter((record): record is CoachWellnessRecord => record !== null)
          : undefined,
      }
    : undefined

  if (!phasePlan && !recovery) {
    return undefined
  }

  return {
    phasePlan,
    recovery,
  }
}

export function readCoachRuntimeState(settings: UserSettings): CoachRuntimeState | undefined {
  const rawRuntime = (settings as unknown as Record<string, unknown>).coachRuntime
  if (!isRecord(rawRuntime)) {
    return undefined
  }

  return normalizeCoachRuntimeState(rawRuntime)
}

function normalizeStringSet<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function maybePushReasonCode(
  reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode>,
  code: string,
): void {
  if (!code || code.startsWith('legacy:')) {
    return
  }

  const normalized = code as CoachingReasonCode | LegacyCoachingCode
  if (!reasonCodes.includes(normalized)) {
    reasonCodes.push(normalized)
  }
}

function lowerConfidenceBand(
  band: CoachingConfidence,
  shift: number,
): CoachingConfidence {
  if (shift <= 0) {
    return band
  }

  const bands: CoachingConfidence[] = ['none', 'low', 'medium', 'high']
  const currentIndex = bands.indexOf(band)
  return bands[Math.max(0, currentIndex - shift)]
}

function evaluatePhaseAssessment(
  runtime: CoachRuntimeState | undefined,
  settings: Pick<UserSettings, 'goalMode' | 'fatLossMode'>,
  windowEnd: string,
): CoachPhaseAssessment {
  const phases = runtime?.phasePlan?.phases ?? []
  const refeeds = runtime?.phasePlan?.refeeds ?? []
  const activePsmfPhase =
    settings.goalMode === 'lose' && settings.fatLossMode === 'psmf'
      ? phases.find((phase) => phase.status === 'active' && phase.type === 'psmf') ?? null
      : null
  const activeDietBreakPhase =
    settings.goalMode === 'lose'
      ? phases.find((phase) => phase.status === 'active' && phase.type === 'diet_break') ?? null
      : null
  const activePhase = activePsmfPhase ?? activeDietBreakPhase ?? phases.find((phase) => phase.status === 'active') ?? null

  const hasRuntime = Boolean(runtime?.phasePlan || runtime?.recovery)
  const requiresPsmfPhase =
    settings.goalMode === 'lose' &&
    settings.fatLossMode === 'psmf' &&
    activePsmfPhase === null &&
    activeDietBreakPhase === null
  const phaseExpired =
    activePsmfPhase !== null &&
    compareDateKeys(windowEnd, activePsmfPhase.plannedEndDate) > 0

  const blockedReasons: CoachingBlockedReason[] = []
  const reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode> = []

  if (requiresPsmfPhase) {
    blockedReasons.push({
      code: 'psmf_phase_required',
      message: 'PSMF requires an active phase with a planned end date before coaching can adjust targets.',
    })
  }

  if (phaseExpired) {
    blockedReasons.push({
      code: 'psmf_phase_expired',
      message: 'The active PSMF phase has expired. Extend the phase or start a diet break before coaching resumes.',
    })
  }

  if (activeDietBreakPhase !== null) {
    blockedReasons.push({
      code: 'diet_break_active',
      message: 'Diet break is active. Keep current targets until the break ends.',
    })
  }

  const phaseWindowStart = buildWindowDates(windowEnd, COACH_ENGINE_CONFIG.windowDays).windowStart
  const hasPlannedRefeed =
    activePsmfPhase !== null &&
    refeeds.some(
      (refeed) =>
        compareDateKeys(refeed.date, phaseWindowStart) >= 0 &&
        compareDateKeys(refeed.date, windowEnd) <= 0 &&
        compareDateKeys(refeed.date, activePsmfPhase.startDate) >= 0 &&
        compareDateKeys(refeed.date, activePsmfPhase.plannedEndDate) <= 0,
    )

  if (hasPlannedRefeed) {
    maybePushReasonCode(reasonCodes, 'refeed_scheduled')
  }

  return {
    hasRuntime,
    activePhase,
    requiresPsmfPhase,
    phaseExpired,
    hasDietBreakActive: activeDietBreakPhase !== null,
    hasPlannedRefeed,
    blockedReasons,
    reasonCodes: normalizeStringSet(reasonCodes) as Array<CoachingReasonCode | LegacyCoachingCode>,
  }
}

function buildDailyRecoveryRecord(
  date: string,
  runtime: CoachRuntimeState | undefined,
): {
  sleepMinutes: number | null
  restingHeartRate: number | null
  stressScore: number | null
  bodyBatteryMax: number | null
  energyScore: number | null
  hungerScore: number | null
  sorenessScore: number | null
  sleepQualityScore: number | null
} {
  const wellness = runtime?.recovery?.wellness?.find((entry) => entry.date === date) ?? null
  const checkIn = runtime?.recovery?.checkIns?.find((entry) => entry.date === date) ?? null

  return {
    sleepMinutes: wellness?.sleepMinutes ?? null,
    restingHeartRate: wellness?.restingHeartRate ?? null,
    stressScore: wellness?.stressScore ?? null,
    bodyBatteryMax: wellness?.bodyBatteryMax ?? null,
    energyScore: checkIn?.energyScore ?? null,
    hungerScore: checkIn?.hungerScore ?? null,
    sorenessScore: checkIn?.sorenessScore ?? null,
    sleepQualityScore: checkIn?.sleepQualityScore ?? null,
  }
}

function scoreDailyRecovery(
  date: string,
  runtime: CoachRuntimeState | undefined,
  baseline: {
    sleepMinutes: number | null
    restingHeartRate: number | null
    stressScore: number | null
    bodyBatteryMax: number | null
  },
  hasLimitedBaseline: boolean,
): {
  date: string
  score: number
  severity: RecoverySeverity
  reasons: string[]
} {
  const record = buildDailyRecoveryRecord(date, runtime)
  const reasons: string[] = []

  const hardRed =
    (record.sleepMinutes !== null && record.sleepMinutes < 360) ||
    (record.restingHeartRate !== null &&
      baseline.restingHeartRate !== null &&
      record.restingHeartRate >= baseline.restingHeartRate + 8) ||
    (record.bodyBatteryMax !== null && record.bodyBatteryMax <= 25) ||
    (record.energyScore !== null &&
      record.sorenessScore !== null &&
      record.energyScore >= 4 &&
      record.sorenessScore >= 4)

  const components: Array<{ weight: number; score: number } > = []

  if (record.sleepMinutes !== null) {
    const reference = baseline.sleepMinutes ?? 480
    components.push({
      weight: 30,
      score: clamp((record.sleepMinutes / Math.max(reference, 1)) * 100, 0, 100),
    })
  }

  if (record.restingHeartRate !== null) {
    const reference = baseline.restingHeartRate ?? record.restingHeartRate
    components.push({
      weight: 20,
      score: clamp(100 - Math.max(0, record.restingHeartRate - reference) * 10, 0, 100),
    })
  }

  if (record.stressScore !== null) {
    const reference = baseline.stressScore ?? record.stressScore
    components.push({
      weight: 15,
      score: clamp(100 - Math.max(0, record.stressScore - reference) * 12, 0, 100),
    })
  }

  if (record.bodyBatteryMax !== null) {
    components.push({
      weight: 20,
      score: clamp(record.bodyBatteryMax, 0, 100),
    })
  }

  if (
    record.energyScore !== null ||
    record.hungerScore !== null ||
    record.sorenessScore !== null ||
    record.sleepQualityScore !== null
  ) {
    const scores = [
      record.energyScore,
      record.hungerScore,
      record.sorenessScore,
      record.sleepQualityScore,
    ].filter((value): value is number => value !== null)
    const manualAverage = scores.length
      ? scores.reduce((sum, value) => sum + value, 0) / scores.length
      : null
    if (manualAverage !== null) {
      components.push({
        weight: 15,
        score: clamp((6 - manualAverage) * 20, 0, 100),
      })
    }
  }

  const weightedSum = components.reduce((sum, component) => sum + component.weight * component.score, 0)
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0)
  const score =
    totalWeight > 0 ? roundTo(weightedSum / totalWeight, 0) : hardRed ? 40 : 60

  if (hardRed) {
    return {
      date,
      score: Math.min(score, 45),
      severity: hasLimitedBaseline ? 'yellow' : 'red',
      reasons: ['hard recovery floor triggered.'],
    }
  }

  if (score >= 70) {
    return {
      date,
      score,
      severity: 'green',
      reasons,
    }
  }

  if (score >= 55) {
    return {
      date,
      score,
      severity: 'yellow',
      reasons,
    }
  }

  return {
    date,
    score,
    severity: hasLimitedBaseline ? 'yellow' : 'red',
    reasons,
  }
}

function evaluateRecoveryAssessment(
  runtime: CoachRuntimeState | undefined,
  settings: Pick<UserSettings, 'goalMode' | 'fatLossMode'>,
  windowEnd: string,
): CoachRecoveryAssessment {
  const hasRuntime = Boolean(runtime?.recovery)
  if (!hasRuntime || settings.goalMode !== 'lose' || settings.fatLossMode !== 'psmf') {
    return {
      hasRuntime,
      latestSeverity: null,
      dailyAssessments: [],
      yellowDaysLast7: 0,
      redDaysLast3: 0,
      confidenceBandShift: 0,
      confidenceScoreShift: 0,
      blockedReasons: [],
      reasonCodes: [] as Array<CoachingReasonCode | LegacyCoachingCode>,
    }
  }

  const assessmentWindow = buildWindowDates(windowEnd, 3).dates
  const recent7Window = buildWindowDates(windowEnd, 7).dates
  const baselineDates = buildWindowDates(windowEnd, 28).dates.filter(
    (date) => compareDateKeys(date, assessmentWindow[0] ?? windowEnd) < 0,
  )

  const baselineRecords = baselineDates
    .map((date) => buildDailyRecoveryRecord(date, runtime))
    .filter(
      (record) =>
        record.sleepMinutes !== null ||
        record.restingHeartRate !== null ||
        record.stressScore !== null ||
        record.bodyBatteryMax !== null ||
        record.energyScore !== null ||
        record.hungerScore !== null ||
        record.sorenessScore !== null ||
        record.sleepQualityScore !== null,
    )

  const baseline = {
    sleepMinutes:
      baselineRecords.filter((record) => record.sleepMinutes !== null).length > 0
        ? roundTo(
            baselineRecords.reduce((sum, record) => sum + (record.sleepMinutes ?? 0), 0) /
              baselineRecords.filter((record) => record.sleepMinutes !== null).length,
            0,
          )
        : null,
    restingHeartRate:
      baselineRecords.filter((record) => record.restingHeartRate !== null).length > 0
        ? roundTo(
            baselineRecords.reduce((sum, record) => sum + (record.restingHeartRate ?? 0), 0) /
              baselineRecords.filter((record) => record.restingHeartRate !== null).length,
            0,
          )
        : null,
    stressScore:
      baselineRecords.filter((record) => record.stressScore !== null).length > 0
        ? roundTo(
            baselineRecords.reduce((sum, record) => sum + (record.stressScore ?? 0), 0) /
              baselineRecords.filter((record) => record.stressScore !== null).length,
            0,
          )
        : null,
    bodyBatteryMax:
      baselineRecords.filter((record) => record.bodyBatteryMax !== null).length > 0
        ? roundTo(
            baselineRecords.reduce((sum, record) => sum + (record.bodyBatteryMax ?? 0), 0) /
              baselineRecords.filter((record) => record.bodyBatteryMax !== null).length,
            0,
          )
        : null,
  }

  const validBaselineDays = baselineRecords.length
  const hasLimitedBaseline = validBaselineDays < 14

  const dailyAssessments = assessmentWindow.map((date) =>
    scoreDailyRecovery(date, runtime, baseline, hasLimitedBaseline),
  )
  const latestAssessment = dailyAssessments[dailyAssessments.length - 1] ?? null
  const yellowDaysLast7 = recent7Window
    .map((date) => scoreDailyRecovery(date, runtime, baseline, hasLimitedBaseline))
    .filter((assessment) => assessment.severity === 'yellow').length
  const redDaysLast3 = dailyAssessments.filter((assessment) => assessment.severity === 'red').length
  const latestSeverity = latestAssessment?.severity ?? null

  const blockedReasons: CoachingBlockedReason[] = []
  const reasonCodes: Array<CoachingReasonCode | LegacyCoachingCode> = []
  let confidenceBandShift = 0
  let confidenceScoreShift = 0

  if (latestSeverity === 'yellow' || latestSeverity === 'red') {
    maybePushReasonCode(reasonCodes, 'recovery_watch')
    confidenceBandShift = 1
    confidenceScoreShift = 10
  }

  if (redDaysLast3 >= 2) {
    blockedReasons.push({
      code: 'recovery_hold',
      message: 'Recovery strain has stayed high on most recent days. Hold targets until recovery improves.',
    })
    confidenceBandShift = 2
    confidenceScoreShift = 20
  }

  if (hasLimitedBaseline && latestSeverity === 'red' && blockedReasons.length === 0) {
    maybePushReasonCode(reasonCodes, 'recovery_watch')
    confidenceBandShift = Math.max(confidenceBandShift, 1)
    confidenceScoreShift = Math.max(confidenceScoreShift, 10)
  }

  if (yellowDaysLast7 >= 2) {
    maybePushReasonCode(reasonCodes, 'diet_break_review_recommended')
  }

  return {
    hasRuntime,
    latestSeverity,
    dailyAssessments,
    yellowDaysLast7,
    redDaysLast3,
    confidenceBandShift,
    confidenceScoreShift,
    blockedReasons,
    reasonCodes: normalizeStringSet(reasonCodes) as Array<CoachingReasonCode | LegacyCoachingCode>,
  }
}

export function evaluateCoachRuntimeState(
  runtime: CoachRuntimeState | undefined,
  settings: Pick<UserSettings, 'goalMode' | 'fatLossMode'>,
  windowEnd: string,
): CoachRuntimeAssessment {
  const phase = evaluatePhaseAssessment(runtime, settings, windowEnd)
  const recovery = evaluateRecoveryAssessment(runtime, settings, windowEnd)

  return {
    phase,
    recovery,
  }
}

export function applyConfidenceShift(
  band: CoachingConfidence,
  score: number,
  shift: number,
  scoreShift: number,
): { band: CoachingConfidence; score: number } {
  if (shift <= 0 && scoreShift <= 0) {
    return { band, score }
  }

  return {
    band: lowerConfidenceBand(band, shift),
    score: Math.max(0, score - scoreShift),
  }
}
