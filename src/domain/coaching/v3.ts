import type {
  CheckInRecord,
  CoachingDecisionSource,
  CoachingEvidenceCard,
  CoachingEvidenceTone,
  CoachingTargetSet,
  EnergyModelSnapshot,
  GarminModifierWindow,
  WeeklyCheckInPacket,
} from '../../types'
import type { CoachingEngineEvaluation } from './engine'
import { readCoachRuntimeState } from './runtime'
import { enumerateDateKeys } from '../../utils/dates'

function roundTo(value: number, digits = 0): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function formatCalories(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable'
  }

  return `${roundTo(value, 0)} kcal/day`
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable'
  }

  const prefix = value > 0 ? '+' : ''
  return `${prefix}${roundTo(value, 2)}%/week`
}

function formatMinutes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable'
  }

  return `${roundTo(value, 0)} min`
}

function buildEnergyModelSnapshot(
  record: CheckInRecord,
  evaluation: CoachingEngineEvaluation,
): EnergyModelSnapshot {
  return {
    estimatedTdee: evaluation.trend.estimatedTdee,
    averageLoggedCalories: record.avgCalories,
    currentCalorieTarget: evaluation.policy.previousTargets.calorieTarget,
    proposedCalorieTarget: evaluation.policy.proposedTargets?.calorieTarget,
    calorieDelta: record.recommendedCalorieDelta,
    targetWeeklyRatePercent: record.targetWeeklyRatePercent,
    observedWeeklyRatePercent: record.actualWeeklyRatePercent,
    averageSteps: record.avgSteps,
    weeklyCardioMinutes: record.weeklyCardioMinutes,
  }
}

function buildGarminModifierWindow(
  evaluation: CoachingEngineEvaluation,
): GarminModifierWindow | undefined {
  const runtime = readCoachRuntimeState(evaluation.context.settings)
  const modifierEntries = runtime?.recovery?.garminModifiers
  const wellnessEntries = runtime?.recovery?.wellness ?? []
  const sourceEntries = modifierEntries?.length ? modifierEntries : wellnessEntries
  if (!sourceEntries.length) {
    return undefined
  }

  const windowEntries = enumerateDateKeys(evaluation.context.windowStart, evaluation.context.windowEnd)
    .map((date) => sourceEntries.find((entry) => entry.date === date))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  if (!windowEntries.length) {
    return undefined
  }

  const averageOf = (values: Array<number | undefined>): number | null => {
    const presentValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (!presentValues.length) {
      return null
    }

    return roundTo(
      presentValues.reduce((sum, value) => sum + value, 0) / presentValues.length,
      0,
    )
  }

  const totalDerivedCardioMinutes = roundTo(
    windowEntries.reduce((sum, entry) => sum + (entry.derivedCardioMinutes ?? 0), 0),
    0,
  )

  return {
    windowStart: evaluation.context.windowStart,
    windowEnd: evaluation.context.windowEnd,
    importedDays: windowEntries.length,
    averageSleepMinutes: averageOf(windowEntries.map((entry) => entry.sleepMinutes)),
    averageRestingHeartRate: averageOf(windowEntries.map((entry) => entry.restingHeartRate)),
    averageSteps: averageOf(windowEntries.map((entry) => entry.steps)),
    totalDerivedCardioMinutes,
    nextWindowOnly: true,
  }
}

function buildTone(input: {
  caution?: boolean
  positive?: boolean
}): CoachingEvidenceTone {
  if (input.caution) {
    return 'caution'
  }

  if (input.positive) {
    return 'positive'
  }

  return 'neutral'
}

function buildEvidenceCards(
  record: CheckInRecord,
  evaluation: CoachingEngineEvaluation,
  energyModel: EnergyModelSnapshot,
  garminModifierWindow: GarminModifierWindow | undefined,
): CoachingEvidenceCard[] {
  const targetRateGap =
    Math.abs(energyModel.observedWeeklyRatePercent - energyModel.targetWeeklyRatePercent)
  const adherence = evaluation.quality.adherence
  const dataQuality = evaluation.quality.dataQuality
  const confounderReasons = evaluation.quality.confounders.reasons

  const cards: CoachingEvidenceCard[] = [
    {
      id: 'energy_model',
      title: 'Energy model',
      summary:
        energyModel.estimatedTdee === null
          ? 'Not enough signal to estimate expenditure confidently yet.'
          : `Estimated expenditure is ${formatCalories(energyModel.estimatedTdee)} from the current window.`,
      tone: buildTone({
        caution: energyModel.estimatedTdee === null,
        positive: energyModel.estimatedTdee !== null,
      }),
      details: [
        `Average logged intake: ${formatCalories(energyModel.averageLoggedCalories)}`,
        `Current target: ${formatCalories(energyModel.currentCalorieTarget)}`,
        `Suggested target: ${formatCalories(energyModel.proposedCalorieTarget ?? energyModel.currentCalorieTarget)}`,
      ],
    },
    {
      id: 'weight_trend',
      title: 'Weight trend',
      summary: `Observed rate ${formatPercent(energyModel.observedWeeklyRatePercent)} versus target ${formatPercent(energyModel.targetWeeklyRatePercent)}.`,
      tone: buildTone({
        caution: targetRateGap > 0.2,
        positive: targetRateGap <= 0.2,
      }),
      details: [
        `Average weight: ${roundTo(record.avgWeight, 2)} ${evaluation.context.settings.weightUnit}`,
        `Prior week average: ${roundTo(record.priorAvgWeight, 2)} ${evaluation.context.settings.weightUnit}`,
        `Decision reason: ${record.recommendationReason}`,
      ],
    },
    {
      id: 'adherence',
      title: 'Adherence and data quality',
      summary: `Data quality is ${dataQuality.band} with ${dataQuality.eligibleDays} eligible days and ${dataQuality.weighInDays} weigh-ins.`,
      tone: buildTone({
        caution: !adherence.isAdequate || dataQuality.band === 'low' || dataQuality.band === 'none',
        positive: adherence.isAdequate && (dataQuality.band === 'medium' || dataQuality.band === 'high'),
      }),
      details: [
        `Step adherence: ${roundTo(record.stepAdherencePercent, 0)}%`,
        `Cardio adherence: ${roundTo(record.cardioAdherencePercent, 0)}%`,
        `Protein hit rate: ${adherence.proteinHitRate === null ? 'Unavailable' : `${roundTo(adherence.proteinHitRate, 0)}%`}`,
      ],
    },
    {
      id: 'confounders',
      title: 'Confounders and holds',
      summary:
        confounderReasons.length > 0 || record.blockedReasons?.length
          ? 'This window includes confounders or holds that reduce recommendation trust.'
          : 'No major confounders were detected in this window.',
      tone: buildTone({
        caution: confounderReasons.length > 0 || Boolean(record.blockedReasons?.length),
      }),
      details:
        confounderReasons.length > 0
          ? confounderReasons
          : record.blockedReasons?.length
            ? record.blockedReasons.map((reason) => reason.message)
            : ['No major confounders were detected.'],
    },
  ]

  if (garminModifierWindow) {
    cards.push({
      id: 'garmin_modifier_window',
      title: 'Garmin modifier window',
      summary:
        'Garmin recovery and activity context is staged for the next recommendation window only.',
      tone: buildTone({
        caution:
          (garminModifierWindow.averageSleepMinutes ?? Infinity) < 390 ||
          (garminModifierWindow.averageRestingHeartRate ?? 0) >= 65,
        positive:
          (garminModifierWindow.averageSleepMinutes ?? 0) >= 420 &&
          (garminModifierWindow.averageRestingHeartRate ?? 999) < 65,
      }),
      details: [
        `Imported days: ${garminModifierWindow.importedDays}`,
        `Average sleep: ${formatMinutes(garminModifierWindow.averageSleepMinutes)}`,
        `Average resting HR: ${
          garminModifierWindow.averageRestingHeartRate === null
            ? 'Unavailable'
            : `${roundTo(garminModifierWindow.averageRestingHeartRate, 0)} bpm`
        }`,
        `Average Garmin steps: ${
          garminModifierWindow.averageSteps === null
            ? 'Unavailable'
            : `${roundTo(garminModifierWindow.averageSteps, 0)}`
        }`,
        `Derived cardio fallback: ${formatMinutes(garminModifierWindow.totalDerivedCardioMinutes)}`,
        'This modifier window can inform the next coaching packet only. It never rewrites an already accepted target.',
      ],
    })
  }

  return cards.map(normalizeCoachingEvidenceCard)
}

export function normalizeEnergyModelSnapshot(snapshot: EnergyModelSnapshot): EnergyModelSnapshot {
  return {
    estimatedTdee:
      typeof snapshot.estimatedTdee === 'number' && Number.isFinite(snapshot.estimatedTdee)
        ? snapshot.estimatedTdee
        : null,
    averageLoggedCalories: Number.isFinite(snapshot.averageLoggedCalories)
      ? snapshot.averageLoggedCalories
      : 0,
    currentCalorieTarget: Number.isFinite(snapshot.currentCalorieTarget)
      ? snapshot.currentCalorieTarget
      : 0,
    proposedCalorieTarget:
      typeof snapshot.proposedCalorieTarget === 'number' && Number.isFinite(snapshot.proposedCalorieTarget)
        ? snapshot.proposedCalorieTarget
        : undefined,
    calorieDelta:
      typeof snapshot.calorieDelta === 'number' && Number.isFinite(snapshot.calorieDelta)
        ? snapshot.calorieDelta
        : undefined,
    targetWeeklyRatePercent: Number.isFinite(snapshot.targetWeeklyRatePercent)
      ? snapshot.targetWeeklyRatePercent
      : 0,
    observedWeeklyRatePercent: Number.isFinite(snapshot.observedWeeklyRatePercent)
      ? snapshot.observedWeeklyRatePercent
      : 0,
    averageSteps: Number.isFinite(snapshot.averageSteps) ? snapshot.averageSteps : 0,
    weeklyCardioMinutes: Number.isFinite(snapshot.weeklyCardioMinutes)
      ? snapshot.weeklyCardioMinutes
      : 0,
  }
}

export function normalizeCoachingEvidenceCard(card: CoachingEvidenceCard): CoachingEvidenceCard {
  return {
    id: card.id.trim(),
    title: card.title.trim(),
    summary: card.summary.trim(),
    tone:
      card.tone === 'positive' || card.tone === 'caution' || card.tone === 'neutral'
        ? card.tone
        : 'neutral',
    details: card.details
      .map((detail) => detail.trim())
      .filter((detail) => detail.length > 0),
  }
}

function normalizeSource(source: CoachingDecisionSource): CoachingDecisionSource {
  return source === 'engine_v1' || source === 'engine_v2' || source === 'manual_override'
    ? source
    : 'engine_v1'
}

function normalizeTargets(targets: CoachingTargetSet): CoachingTargetSet {
  return {
    calorieTarget: Number.isFinite(targets.calorieTarget) ? targets.calorieTarget : 0,
    proteinTarget: Number.isFinite(targets.proteinTarget) ? targets.proteinTarget : 0,
    carbTarget: Number.isFinite(targets.carbTarget) ? targets.carbTarget : 0,
    fatTarget: Number.isFinite(targets.fatTarget) ? targets.fatTarget : 0,
  }
}

export function normalizeWeeklyCheckInPacket(packet: WeeklyCheckInPacket): WeeklyCheckInPacket {
  return {
    id: packet.id.trim(),
    source: normalizeSource(packet.source),
    generatedAt: packet.generatedAt,
    recommendationReason: packet.recommendationReason.trim(),
    recommendationExplanation: packet.recommendationExplanation?.trim() || undefined,
    confidenceBand: packet.confidenceBand,
    confidenceScore:
      typeof packet.confidenceScore === 'number' && Number.isFinite(packet.confidenceScore)
        ? packet.confidenceScore
        : null,
    decisionType: packet.decisionType,
    nextCheckInDate: packet.nextCheckInDate,
    targetDelta:
      typeof packet.targetDelta === 'number' && Number.isFinite(packet.targetDelta)
        ? packet.targetDelta
        : undefined,
    previousTargets: normalizeTargets(packet.previousTargets),
    proposedTargets: packet.proposedTargets ? normalizeTargets(packet.proposedTargets) : undefined,
    energyModel: normalizeEnergyModelSnapshot(packet.energyModel),
    garminModifierWindow: packet.garminModifierWindow
      ? {
          windowStart: packet.garminModifierWindow.windowStart,
          windowEnd: packet.garminModifierWindow.windowEnd,
          importedDays: Number.isFinite(packet.garminModifierWindow.importedDays)
            ? packet.garminModifierWindow.importedDays
            : 0,
          averageSleepMinutes:
            typeof packet.garminModifierWindow.averageSleepMinutes === 'number' &&
            Number.isFinite(packet.garminModifierWindow.averageSleepMinutes)
              ? packet.garminModifierWindow.averageSleepMinutes
              : null,
          averageRestingHeartRate:
            typeof packet.garminModifierWindow.averageRestingHeartRate === 'number' &&
            Number.isFinite(packet.garminModifierWindow.averageRestingHeartRate)
              ? packet.garminModifierWindow.averageRestingHeartRate
              : null,
          averageSteps:
            typeof packet.garminModifierWindow.averageSteps === 'number' &&
            Number.isFinite(packet.garminModifierWindow.averageSteps)
              ? packet.garminModifierWindow.averageSteps
              : null,
          totalDerivedCardioMinutes: Number.isFinite(packet.garminModifierWindow.totalDerivedCardioMinutes)
            ? packet.garminModifierWindow.totalDerivedCardioMinutes
            : 0,
          nextWindowOnly: true,
        }
      : undefined,
    evidenceCards: packet.evidenceCards.map(normalizeCoachingEvidenceCard),
  }
}

export function buildWeeklyCheckInPacket(params: {
  record: CheckInRecord
  evaluation: CoachingEngineEvaluation
  source: CoachingDecisionSource
  generatedAt?: string
}): WeeklyCheckInPacket {
  const generatedAt = params.generatedAt ?? new Date().toISOString()
  const energyModel = buildEnergyModelSnapshot(params.record, params.evaluation)
  const garminModifierWindow = buildGarminModifierWindow(params.evaluation)

  return normalizeWeeklyCheckInPacket({
    id: `${params.source}:${params.record.weekEndDate}`,
    source: params.source,
    generatedAt,
    recommendationReason: params.record.recommendationReason,
    recommendationExplanation: params.record.recommendationExplanation,
    confidenceBand: params.record.confidenceBand ?? params.evaluation.recommendation.confidenceBand,
    confidenceScore: params.record.confidenceScore ?? params.evaluation.recommendation.confidenceScore,
    decisionType: params.record.decisionType ?? params.evaluation.recommendation.decisionType,
    nextCheckInDate: params.record.nextCheckInDate ?? params.record.weekEndDate,
    targetDelta: params.record.recommendedCalorieDelta,
    previousTargets: params.evaluation.policy.previousTargets,
    proposedTargets: params.evaluation.policy.proposedTargets,
    energyModel,
    garminModifierWindow,
    evidenceCards: buildEvidenceCards(
      params.record,
      params.evaluation,
      energyModel,
      garminModifierWindow,
    ),
  })
}
