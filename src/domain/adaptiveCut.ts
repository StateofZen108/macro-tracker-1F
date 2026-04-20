import type {
  BodyProgressSnapshot,
  CheckInRecord,
  CoachingDecisionRecord,
  CoachingDecisionType,
  CoachingReasonCode,
  CoachingTargetSet,
  CutEvidenceReason,
  CutInterventionLever,
  CutReviewCard,
  CutReviewVerdict,
  DietPhase,
  DietPhaseEvent,
  RecoveryReadiness,
  StrengthRetentionSnapshot,
  UserSettings,
} from '../types'
import { addDays } from '../utils/dates'

function roundTo(value: number, digits = 0): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function getObservedLossMagnitude(actualWeeklyRatePercent: number): number {
  return actualWeeklyRatePercent < 0 ? Math.abs(actualWeeklyRatePercent) : 0
}

function findWaistValue(snapshot: BodyProgressSnapshot | null): number | null {
  if (!snapshot) {
    return null
  }

  const waistMetric = snapshot.metrics.find((metric) => metric.key === 'waist')
  return typeof waistMetric?.value === 'number' && Number.isFinite(waistMetric.value)
    ? waistMetric.value
    : null
}

function findSnapshotOnOrBefore(
  snapshots: BodyProgressSnapshot[],
  date: string,
): BodyProgressSnapshot | null {
  return (
    [...snapshots]
      .filter((snapshot) => snapshot.date <= date)
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  )
}

function buildWaistDelta(
  snapshots: BodyProgressSnapshot[],
  currentWeekEndDate: string,
): number | null {
  const latestSnapshot = findSnapshotOnOrBefore(snapshots, currentWeekEndDate)
  const compareSnapshot = findSnapshotOnOrBefore(snapshots, addDays(currentWeekEndDate, -14))
  const latestWaist = findWaistValue(latestSnapshot)
  const compareWaist = findWaistValue(compareSnapshot)
  if (latestWaist === null || compareWaist === null) {
    return null
  }

  return roundTo(latestWaist - compareWaist, 2)
}

function isDietBreakOverlap(
  phases: DietPhase[],
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return phases.some((phase) => {
    if (phase.type !== 'diet_break' || phase.status === 'cancelled') {
      return false
    }

    const phaseEnd = phase.actualEndDate ?? phase.plannedEndDate
    return phase.startDate <= rangeEnd && phaseEnd >= rangeStart
  })
}

function hasRecentAcceptedIntervention(
  history: CoachingDecisionRecord[],
  currentWeekEndDate: string,
  windowDays: number,
  decisionTypes: CoachingDecisionType[],
): boolean {
  const windowStart = addDays(currentWeekEndDate, -(windowDays - 1))
  return history.some((record) => {
    if (
      record.status !== 'applied' ||
      !decisionTypes.includes(record.decisionType) ||
      !record.appliedAt
    ) {
      return false
    }

    const effectiveDate = record.effectiveDate.slice(0, 10)
    return effectiveDate >= windowStart && effectiveDate <= currentWeekEndDate
  })
}

function isCleanWeek(
  record: CheckInRecord,
  history: CoachingDecisionRecord[],
): boolean {
  const eligibleDays = record.dataQuality?.eligibleDays ?? 0
  const weighInDays = record.dataQuality?.weighInDays ?? 0
  const partialOrUnmarked =
    (record.dataQuality?.partialDays ?? 0) + (record.dataQuality?.unmarkedLoggedDays ?? 0)
  const explicitMarkers = record.confounders?.explicitMarkers.length ?? 0
  const adherenceAdequate = record.adherence?.isAdequate === true
  const targetChangedInWindow = hasRecentAcceptedIntervention(
    history,
    record.weekEndDate,
    7,
    ['increase_calories', 'decrease_calories', 'increase_steps'],
  )

  return (
    eligibleDays >= 6 &&
    weighInDays >= 5 &&
    partialOrUnmarked <= 1 &&
    explicitMarkers === 0 &&
    !targetChangedInWindow &&
    adherenceAdequate
  )
}

function buildReviewKey(parts: Array<string | number | boolean | null | undefined>): string {
  return parts
    .map((part) => {
      if (part === null || part === undefined) {
        return 'none'
      }
      return String(part).replace(/[^a-zA-Z0-9_-]+/g, '_')
    })
    .join(':')
}

function buildEvidenceReasons(input: {
  waistDelta: number | null
  expectedRefeedSpike: boolean
  expectedDietBreakSpike: boolean
  current: CheckInRecord
  readiness: RecoveryReadiness
  strengthRetention: StrengthRetentionSnapshot
  recentIntervention: boolean
}): CutEvidenceReason[] {
  const reasons: CutEvidenceReason[] = ['scale_rate']

  if (input.waistDelta !== null) {
    reasons.push('waist_trend')
  }
  if (input.expectedRefeedSpike) {
    reasons.push('expected_refeed_spike')
  }
  if (input.expectedDietBreakSpike) {
    reasons.push('expected_diet_break_spike')
  }
  if (
    (input.current.dataQuality?.partialDays ?? 0) + (input.current.dataQuality?.unmarkedLoggedDays ?? 0) > 0 ||
    (input.current.confounders?.explicitMarkers.length ?? 0) > 0
  ) {
    reasons.push('logging_quality')
  }
  if (typeof input.current.adherence?.proteinHitRate === 'number') {
    reasons.push('protein_adherence')
  }
  reasons.push('step_adherence')
  if (input.readiness.state !== 'green') {
    reasons.push('recovery_risk')
  }
  if (
    input.strengthRetention.anchorLiftTrend === 'down' ||
    input.strengthRetention.volumeFloorStatus !== 'met'
  ) {
    reasons.push('strength_retention')
  }
  if (input.recentIntervention) {
    reasons.push('recent_intervention')
  }

  return [...new Set(reasons)]
}

export interface AdaptiveCutOutcome {
  decisionType: CoachingDecisionType
  reasonCodes: Array<CoachingReasonCode>
  recommendationReason: string
  recommendationExplanation?: string
  reviewVerdict?: CutReviewVerdict
  cutReviewCard?: CutReviewCard
  recommendedStepDelta?: number
  recommendedStepTarget?: number
  proposedTargets?: CoachingTargetSet
  decisionIdSuffix?: string
}

export interface AdaptiveCutParams {
  enabled: boolean
  current: CheckInRecord
  prior: CheckInRecord | null
  bodyProgressSnapshots: BodyProgressSnapshot[]
  dietPhases: DietPhase[]
  dietPhaseEvents: DietPhaseEvent[]
  readiness: RecoveryReadiness
  strengthRetention: StrengthRetentionSnapshot
  coachingDecisionHistory: CoachingDecisionRecord[]
  settings: Pick<UserSettings, 'dailyStepTarget'>
  previousTargets: CoachingTargetSet
  baseDecisionType: CoachingDecisionType
  baseReasonCodes: Array<CoachingReasonCode>
  baseRecommendationReason: string
  baseRecommendationExplanation?: string
  baseProposedTargets?: CoachingTargetSet
}

export function buildAdaptiveCutOutcome(
  params: AdaptiveCutParams,
): AdaptiveCutOutcome | null {
  if (!params.enabled) {
    return null
  }

  if (
    params.baseDecisionType === 'hold_for_more_data' ||
    params.baseDecisionType === 'ignore_period_due_to_confounders'
  ) {
    return null
  }

  const coolingWindowActive = hasRecentAcceptedIntervention(
    params.coachingDecisionHistory,
    params.current.weekEndDate,
    7,
    ['increase_steps'],
  )
  if (coolingWindowActive) {
    return {
      decisionType: 'keep_targets',
      reasonCodes: [...new Set<CoachingReasonCode>(['step_lever_selected'])],
      recommendationReason: 'Hold the current plan until a fresh week lands after the last step change.',
      recommendationExplanation:
        'A recent accepted step increase is still inside its cooling window, so the app holds targets instead of stacking a second intervention.',
      decisionIdSuffix: 'cooling_window',
    }
  }

  const currentCleanWeek = isCleanWeek(params.current, params.coachingDecisionHistory)
  const priorCleanWeek = params.prior
    ? isCleanWeek(params.prior, params.coachingDecisionHistory)
    : false
  const currentLossMagnitude = getObservedLossMagnitude(params.current.actualWeeklyRatePercent)
  const priorLossMagnitude = params.prior
    ? getObservedLossMagnitude(params.prior.actualWeeklyRatePercent)
    : 0
  const targetLossMagnitude = Math.abs(params.current.targetWeeklyRatePercent)
  const waistDelta = buildWaistDelta(params.bodyProgressSnapshots, params.current.weekEndDate)
  const expectedRefeedSpike = params.dietPhaseEvents.some(
    (event) =>
      !event.deletedAt &&
      (event.type === 'refeed_day' || event.type === 'high_carb_day') &&
      event.date >= addDays(params.current.weekEndDate, -2) &&
      event.date <= params.current.weekEndDate,
  )
  const expectedDietBreakSpike = isDietBreakOverlap(
    params.dietPhases,
    addDays(params.current.weekEndDate, -4),
    params.current.weekEndDate,
  )
  const recentIntervention = hasRecentAcceptedIntervention(
    params.coachingDecisionHistory,
    params.current.weekEndDate,
    7,
    ['increase_calories', 'decrease_calories', 'increase_steps'],
  )
  const strengthRisk =
    params.strengthRetention.anchorLiftTrend === 'down' ||
    params.strengthRetention.volumeFloorStatus !== 'met'
  const twoWindowSlow =
    targetLossMagnitude > 0 &&
    currentLossMagnitude < targetLossMagnitude * 0.6 &&
    priorLossMagnitude < targetLossMagnitude * 0.6
  const scaleFlatOrUp =
    targetLossMagnitude > 0 && currentLossMagnitude < targetLossMagnitude * 0.6
  const confoundedStall =
    scaleFlatOrUp &&
    (expectedRefeedSpike ||
      expectedDietBreakSpike ||
      (params.current.confounders?.explicitMarkers.length ?? 0) > 0 ||
      recentIntervention ||
      (waistDelta !== null && waistDelta <= -0.25))
  const trueStall =
    currentCleanWeek &&
    priorCleanWeek &&
    twoWindowSlow &&
    (waistDelta === null || waistDelta > -0.25) &&
    !confoundedStall
  const stepLeverAvailable =
    trueStall &&
    (params.current.stepAdherencePercent ?? 0) >= 85 &&
    (params.settings.dailyStepTarget ?? 0) < 12000 &&
    !hasRecentAcceptedIntervention(
      params.coachingDecisionHistory,
      params.current.weekEndDate,
      14,
      ['increase_steps'],
    )
  const nextPhaseEvent = [...params.dietPhaseEvents]
    .filter(
      (event) =>
        !event.deletedAt &&
        (event.type === 'refeed_day' || event.type === 'high_carb_day') &&
        event.date > params.current.weekEndDate &&
        event.date <= addDays(params.current.weekEndDate, 14),
    )
    .sort((left, right) => left.date.localeCompare(right.date))[0]
  const tooFastWithRisk =
    targetLossMagnitude > 0 &&
    currentLossMagnitude > targetLossMagnitude * 1.25 &&
    (params.readiness.state === 'red' || strengthRisk)
  const evidenceReasons = buildEvidenceReasons({
    waistDelta,
    expectedRefeedSpike,
    expectedDietBreakSpike,
    current: params.current,
    readiness: params.readiness,
    strengthRetention: params.strengthRetention,
    recentIntervention,
  })

  const baseConfidence: CutReviewCard['confidence'] =
    trueStall || tooFastWithRisk ? 'high' : currentCleanWeek ? 'medium' : 'low'

  const buildReview = (input: {
    verdict: CutReviewVerdict
    lever: CutInterventionLever
    title: string
    summary: string
    confidenceReason: string
    applyLabel?: string
  }): AdaptiveCutOutcome => {
    const decisionKey = buildReviewKey([
      params.current.weekEndDate,
      input.verdict,
      input.lever,
      roundTo(params.current.actualWeeklyRatePercent, 2),
      roundTo(params.prior?.actualWeeklyRatePercent ?? 0, 2),
      waistDelta,
      params.current.stepAdherencePercent,
      params.settings.dailyStepTarget,
      expectedRefeedSpike,
      expectedDietBreakSpike,
      recentIntervention,
    ])
    const existingState =
      params.coachingDecisionHistory.find((record) => record.id.endsWith(decisionKey))?.status ??
      'pending'
    const cardState: CutReviewCard['state'] =
      existingState === 'applied'
        ? 'accepted'
        : existingState === 'deferred'
          ? 'deferred'
          : 'pending_review'

    return {
      decisionType:
        input.lever === 'increase_steps'
          ? 'increase_steps'
          : input.lever === 'review_phase_structure'
            ? 'review_phase_structure'
            : 'hold_for_more_data',
      reasonCodes: [
        ...(input.verdict === 'confounded_stall'
          ? ([
              expectedRefeedSpike ? 'refeed_spike_expected' : null,
              expectedDietBreakSpike ? 'diet_break_spike_expected' : null,
              waistDelta !== null && waistDelta <= -0.25 ? 'waist_down_scale_confounded' : null,
            ].filter((code): code is CoachingReasonCode => code !== null))
          : []),
        ...(input.verdict === 'true_stall'
          ? (['true_stall_confirmed'] as CoachingReasonCode[])
          : []),
        ...(input.lever === 'increase_steps'
          ? (['step_lever_selected'] as CoachingReasonCode[])
          : []),
        ...(input.lever === 'review_phase_structure'
          ? (['phase_review_required'] as CoachingReasonCode[])
          : []),
      ] as CoachingReasonCode[],
      recommendationReason: input.title,
      recommendationExplanation: input.summary,
      reviewVerdict: input.verdict,
      cutReviewCard: {
        state: cardState,
        verdict: input.verdict,
        lever: input.lever,
        title: input.title,
        summary: input.summary,
        evidenceReasons,
        confidence: baseConfidence,
        confidenceReason: input.confidenceReason,
        nextReviewDate: params.current.nextCheckInDate ?? addDays(params.current.weekEndDate, 7),
        applyLabel: input.applyLabel,
      },
      decisionIdSuffix: decisionKey,
    }
  }

  if (!currentCleanWeek) {
    const loggingBlocked =
      (params.current.dataQuality?.partialDays ?? 0) + (params.current.dataQuality?.unmarkedLoggedDays ?? 0) > 1
    return buildReview({
      verdict: scaleFlatOrUp ? 'confounded_stall' : 'needs_clean_confirmation',
      lever: loggingBlocked ? 'logging_cleanup' : 'hold',
      title: loggingBlocked
        ? 'Clean up the week before forcing a harder cut'
        : 'Hold the current cut until the week is cleaner',
      summary: loggingBlocked
        ? 'This week is not clean enough to justify a harder move. Clear partial or unmarked days first.'
        : 'The current review window is not clean enough to justify a harder move yet.',
      confidenceReason:
        'The weekly window is below the clean-week threshold, so the app blocks harder adjustments.',
    })
  }

  if (tooFastWithRisk) {
    return buildReview({
      verdict: 'too_fast_with_risk',
      lever: expectedDietBreakSpike ? 'reduce_training_stress' : 'diet_break',
      title: expectedDietBreakSpike
        ? 'Reduce training stress instead of pushing the cut harder'
        : 'Back off before strength starts leaking',
      summary:
        params.readiness.state === 'red'
          ? 'Loss is already faster than target and recovery is red. Hold food targets and back off stress.'
          : 'Loss is already faster than target and strength-retention risk is elevated.',
      confidenceReason:
        'Absolute loss rate is beyond the aggressive-but-safe threshold while recovery or strength risk is elevated.',
    })
  }

  if (confoundedStall) {
    return buildReview({
      verdict: 'confounded_stall',
      lever: 'hold',
      title: 'Do not cut harder yet',
      summary:
        'Scale drag is confounded by a recent refeed, diet-break effect, recent intervention, or waist-down proof.',
      confidenceReason:
        'This looks stalled on the scale, but the proof stack still supports holding instead of cutting harder.',
    })
  }

  if (currentCleanWeek && !priorCleanWeek && scaleFlatOrUp) {
    return buildReview({
      verdict: 'needs_clean_confirmation',
      lever: 'hold',
      title: 'Wait for one more clean week before changing targets',
      summary:
        'One clean slow week is not enough to confirm a true stall. Hold steady until the next clean window lands.',
      confidenceReason:
        'Exactly one clean week is slow, so the app requires confirmation before escalating the cut.',
    })
  }

  if (trueStall && params.current.stepAdherencePercent < 85) {
    return buildReview({
      verdict: 'true_stall',
      lever: 'hold',
      title: 'Hit the current activity floor before adding more',
      summary:
        'Hit the current activity floor before adding more. The stall is real, but step adherence is still below the minimum threshold for a higher target.',
      confidenceReason:
        'Two clean slow weeks are confirmed, but the current activity target has not been hit consistently enough.',
    })
  }

  if (trueStall && stepLeverAvailable) {
    const baselineStepTarget = params.previousTargets.dailyStepTarget ?? params.settings.dailyStepTarget
    const proposedStepTarget =
      typeof baselineStepTarget === 'number'
        ? baselineStepTarget + 1500
        : Math.max(roundTo(params.current.avgSteps / 500, 0) * 500 + 1500, 8000)
    const outcome = buildReview({
      verdict: 'true_stall',
      lever: 'increase_steps',
      title: 'Raise steps before lowering calories',
      summary:
        'Two clean slow weeks confirm a true stall. The next move is a higher daily step target before a food cut.',
      confidenceReason:
        'The stall is confirmed and step adherence is high enough to use activity as the first lever.',
      applyLabel: `Raise daily step target to ${Math.round(proposedStepTarget)}`,
    })
    return {
      ...outcome,
      recommendedStepDelta: 1500,
      recommendedStepTarget: proposedStepTarget,
      proposedTargets: {
        ...params.previousTargets,
        dailyStepTarget: proposedStepTarget,
      },
    }
  }

  if (trueStall && !stepLeverAvailable && nextPhaseEvent) {
    return buildReview({
      verdict: 'true_stall',
      lever: 'review_phase_structure',
      title: 'Review the next planned high-carb exposure',
      summary: `The step lever is exhausted. Review the scheduled ${nextPhaseEvent.type === 'refeed_day' ? 'refeed' : 'high-carb'} day on ${nextPhaseEvent.date} before forcing a lower calorie target.`,
      confidenceReason:
        'The stall is confirmed and the next scheduled high-carb exposure is the next controllable lever.',
      applyLabel:
        nextPhaseEvent.type === 'refeed_day'
          ? 'Review next refeed'
          : 'Review next high-carb day',
    })
  }

  if (trueStall) {
    return {
      decisionType: params.baseDecisionType,
      reasonCodes: [...new Set<CoachingReasonCode>([...params.baseReasonCodes, 'true_stall_confirmed'])],
      recommendationReason: params.baseRecommendationReason,
      recommendationExplanation: params.baseRecommendationExplanation,
      reviewVerdict: 'true_stall',
      decisionIdSuffix: 'fallback_calorie_engine',
    }
  }

  return null
}
