import type {
  BodyProgressSnapshot,
  CheckInRecord,
  CoachingDecisionRecord,
  CutDayPlan,
  CutOsCommand,
  CutOsDiagnosis,
  CutOsProof,
  CutOsSetupChecklistItem,
  CutOsSnapshot,
  DietPhase,
  DietPhaseEvent,
  FoodLogEntry,
  FoodReviewItem,
  FoodTrustVerdict,
  HistoryImportPreview,
  MacrofactorReplayReport,
  PhaseOsVerdict,
  ScaleLieVerdict,
  TrainingContractVerdict,
  WeightEntry,
  WorkoutDashboardSnapshot,
} from '../types'
import { addDays, enumerateDateKeys, parseDateKey } from '../utils/dates'
import { classifyFoodTrustEvidence } from './foodTrust'

const MINIMUM_CALENDAR_DAYS = 14
const MINIMUM_LOGGED_DAYS = 10
const MINIMUM_WEIGH_INS = 8
const CLEAN_WINDOW_ELIGIBLE_DAYS = 6
const CLEAN_WINDOW_WEIGH_INS = 5
const CLEAN_WINDOW_MAX_PARTIAL_OR_UNMARKED = 1
const CLEAN_WINDOW_CALORIE_DEVIATION_PERCENT = 15
const TRUE_STALL_TARGET_FRACTION = 0.6
const WAIST_PROOF_DELTA = -0.25
const RECENT_PHASE_SPIKE_DAYS = 3
const ACTION_COOLDOWN_DAYS = 7

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function dateSpanDays(start: string, end: string): number {
  const startMs = parseDateKey(start).getTime()
  const endMs = parseDateKey(end).getTime()
  return Math.floor((endMs - startMs) / 86_400_000) + 1
}

function activePhaseEnd(phase: DietPhase): string {
  return phase.actualEndDate ?? phase.plannedEndDate
}

function isPhaseActiveOnDate(phase: DietPhase, date: string): boolean {
  return (
    phase.status !== 'cancelled' &&
    phase.status !== 'completed' &&
    phase.startDate <= date &&
    activePhaseEnd(phase) >= date
  )
}

function findWaist(snapshot: BodyProgressSnapshot | null): number | null {
  const waist = snapshot?.metrics.find((metric) => metric.key === 'waist')
  return typeof waist?.value === 'number' && Number.isFinite(waist.value) ? waist.value : null
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

function getWaistDelta(snapshots: BodyProgressSnapshot[], date: string): number | null {
  const latestSnapshot = findSnapshotOnOrBefore(snapshots, date)
  const compareSnapshot = findSnapshotOnOrBefore(snapshots, addDays(date, -14))
  const latestWaist = findWaist(latestSnapshot)
  const compareWaist = findWaist(compareSnapshot)
  if (latestWaist === null || compareWaist === null) {
    return null
  }

  return Math.round((latestWaist - compareWaist) * 100) / 100
}

function hasRecentAcceptedDecision(
  history: CoachingDecisionRecord[],
  date: string,
  decisionTypes: CoachingDecisionRecord['decisionType'][],
): boolean {
  const windowStart = addDays(date, -ACTION_COOLDOWN_DAYS)
  return history.some((record) => {
    if (record.status !== 'applied' || !record.appliedAt || !decisionTypes.includes(record.decisionType)) {
      return false
    }

    const effectiveDate = record.effectiveDate.slice(0, 10)
    return effectiveDate >= windowStart && effectiveDate <= date
  })
}

function hasWaistCompare(snapshots: BodyProgressSnapshot[], date: string): boolean {
  return getWaistDelta(snapshots, date) !== null
}

function isCleanWindow(
  checkIn: CheckInRecord | null | undefined,
  snapshots: BodyProgressSnapshot[],
): boolean {
  if (!checkIn?.dataQuality || !checkIn.adherence || !checkIn.confounders) {
    return false
  }

  const weighIns = checkIn.dataQuality.weighInDays
  const weighInsPass =
    weighIns > CLEAN_WINDOW_WEIGH_INS ||
    (weighIns === CLEAN_WINDOW_WEIGH_INS && hasWaistCompare(snapshots, checkIn.weekEndDate))
  const partialOrUnmarked =
    checkIn.dataQuality.partialDays + checkIn.dataQuality.unmarkedLoggedDays
  const explicitConfounders =
    checkIn.dataQuality.markedConfounderDays +
    checkIn.confounders.explicitMarkers.length +
    checkIn.confounders.highCalorieEventDays
  const calorieDeviation = Math.abs(checkIn.adherence.calorieDeviationPercent ?? 999)

  return (
    checkIn.dataQuality.eligibleDays >= CLEAN_WINDOW_ELIGIBLE_DAYS &&
    weighInsPass &&
    partialOrUnmarked <= CLEAN_WINDOW_MAX_PARTIAL_OR_UNMARKED &&
    explicitConfounders === 0 &&
    calorieDeviation <= CLEAN_WINDOW_CALORIE_DEVIATION_PERCENT &&
    checkIn.adherence.isAdequate
  )
}

function isSlowLoss(checkIn: CheckInRecord | null | undefined): boolean {
  if (!checkIn) {
    return false
  }

  const targetMagnitude = Math.abs(checkIn.targetWeeklyRatePercent)
  if (targetMagnitude === 0) {
    return false
  }

  const observedMagnitude = checkIn.actualWeeklyRatePercent < 0
    ? Math.abs(checkIn.actualWeeklyRatePercent)
    : 0
  return observedMagnitude < targetMagnitude * TRUE_STALL_TARGET_FRACTION
}

function isScaleFlatOrUp(checkIn: CheckInRecord | null | undefined): boolean {
  if (!checkIn) {
    return false
  }

  return checkIn.avgWeight >= checkIn.priorAvgWeight || isSlowLoss(checkIn)
}

function hasRecentPhaseSpike(date: string, events: DietPhaseEvent[]): boolean {
  const windowStart = addDays(date, -RECENT_PHASE_SPIKE_DAYS)
  return events.some(
    (event) =>
      !event.deletedAt &&
      (event.type === 'refeed_day' || event.type === 'high_carb_day') &&
      event.date >= windowStart &&
      event.date <= date,
  )
}

function hadPhaseSpikeOnBoundaryDay(date: string, events: DietPhaseEvent[]): boolean {
  const boundaryDate = addDays(date, -(RECENT_PHASE_SPIKE_DAYS + 1))
  return events.some(
    (event) =>
      !event.deletedAt &&
      (event.type === 'refeed_day' || event.type === 'high_carb_day') &&
      event.date === boundaryDate,
  )
}

function hasActiveDietBreak(date: string, phases: DietPhase[]): boolean {
  return phases.some(
    (phase) => phase.type === 'diet_break' && isPhaseActiveOnDate(phase, date),
  )
}

export function buildMinimumHistoryStatus(input: {
  date: string
  logsByDate: Record<string, FoodLogEntry[]>
  weights: WeightEntry[]
}): {
  met: boolean
  calendarDays: number
  loggedDays: number
  weighIns: number
} {
  const loggedDates = Object.entries(input.logsByDate)
    .filter(([date, entries]) => date <= input.date && entries.some((entry) => !entry.deletedAt))
    .map(([date]) => date)
  const weighInDates = input.weights
    .filter((entry) => !entry.deletedAt && entry.date <= input.date)
    .map((entry) => entry.date)
  const allDates = uniqueSorted([...loggedDates, ...weighInDates])
  const calendarDays = allDates.length ? dateSpanDays(allDates[0], input.date) : 0
  const loggedDays = new Set(loggedDates).size
  const weighIns = new Set(weighInDates).size

  return {
    met:
      calendarDays >= MINIMUM_CALENDAR_DAYS &&
      loggedDays >= MINIMUM_LOGGED_DAYS &&
      weighIns >= MINIMUM_WEIGH_INS,
    calendarDays,
    loggedDays,
    weighIns,
  }
}

function buildChecklistItem(input: {
  id: string
  label: string
  detail: string
  current: number
  target: number
  routeTarget: CutOsSetupChecklistItem['routeTarget']
}): CutOsSetupChecklistItem {
  return {
    id: input.id,
    label: input.label,
    detail: input.detail,
    current: input.current,
    target: input.target,
    status: input.current >= input.target ? 'complete' : 'pending',
    routeTarget: input.routeTarget,
  }
}

export function buildCutOsSetupChecklist(input: {
  date: string
  logsByDate: Record<string, FoodLogEntry[]>
  weights: WeightEntry[]
  workoutSnapshot: WorkoutDashboardSnapshot
  foodReviewQueue: FoodReviewItem[]
}): CutOsSetupChecklistItem[] {
  const minimumHistory = buildMinimumHistoryStatus({
    date: input.date,
    logsByDate: input.logsByDate,
    weights: input.weights,
  })
  const pendingFoodReviewCount = input.foodReviewQueue.filter((item) => item.status === 'pending').length
  const historyReady = minimumHistory.met ? 1 : 0

  return [
    buildChecklistItem({
      id: 'history_days',
      label: 'History window',
      detail: `${minimumHistory.calendarDays}/${MINIMUM_CALENDAR_DAYS} calendar days with local proof.`,
      current: Math.min(minimumHistory.calendarDays, MINIMUM_CALENDAR_DAYS),
      target: MINIMUM_CALENDAR_DAYS,
      routeTarget: 'settings',
    }),
    buildChecklistItem({
      id: 'logged_intake_days',
      label: 'Logged intake',
      detail: `${minimumHistory.loggedDays}/${MINIMUM_LOGGED_DAYS} logged intake days.`,
      current: Math.min(minimumHistory.loggedDays, MINIMUM_LOGGED_DAYS),
      target: MINIMUM_LOGGED_DAYS,
      routeTarget: 'log',
    }),
    buildChecklistItem({
      id: 'weigh_ins',
      label: 'Weigh-ins',
      detail: `${minimumHistory.weighIns}/${MINIMUM_WEIGH_INS} weigh-ins.`,
      current: Math.min(minimumHistory.weighIns, MINIMUM_WEIGH_INS),
      target: MINIMUM_WEIGH_INS,
      routeTarget: 'weigh_in',
    }),
    buildChecklistItem({
      id: 'training_plan',
      label: 'Training contract',
      detail:
        input.workoutSnapshot.activeProgramCount > 0
          ? 'Active workout plan is available for strength preservation.'
          : 'Add an active workout plan so Cut OS can protect performance.',
      current: input.workoutSnapshot.activeProgramCount > 0 ? 1 : 0,
      target: 1,
      routeTarget: 'train',
    }),
    {
      id: 'food_trust',
      label: 'Food trust',
      detail:
        pendingFoodReviewCount === 0
          ? 'No pending food-review blockers.'
          : `${pendingFoodReviewCount} food-review blocker${pendingFoodReviewCount === 1 ? '' : 's'} need resolution.`,
      current: pendingFoodReviewCount === 0 ? 1 : 0,
      target: 1,
      status: pendingFoodReviewCount === 0 ? 'complete' : 'pending',
      routeTarget: pendingFoodReviewCount === 0 ? 'log' : 'review_food',
    },
    buildChecklistItem({
      id: 'import_or_backfill',
      label: 'Import or backfill',
      detail:
        historyReady === 1
          ? 'Local proof is enough; third-party history is optional.'
          : 'Backfill history or keep logging locally until the proof base is complete.',
      current: historyReady,
      target: 1,
      routeTarget: 'settings',
    }),
  ]
}

export function buildPhaseOsVerdict(input: {
  date: string
  phases: DietPhase[]
  cutDayPlan?: CutDayPlan | null
}): PhaseOsVerdict {
  const activePhases = input.phases.filter((phase) => isPhaseActiveOnDate(phase, input.date))
  if (activePhases.length > 1) {
    return 'phase_review_due'
  }

  switch (input.cutDayPlan?.dayType) {
    case 'psmf_day':
      return 'psmf'
    case 'refeed_day':
      return 'refeed'
    case 'high_carb_day':
      return 'high_carb'
    case 'diet_break_day':
      return 'diet_break'
    default:
      return 'standard_cut'
  }
}

export function buildTrainingContractVerdict(input: {
  workoutSnapshot: WorkoutDashboardSnapshot
}): TrainingContractVerdict {
  if (input.workoutSnapshot.activeProgramCount === 0) {
    return 'insufficient_training_data'
  }

  const strength = input.workoutSnapshot.strengthRetention
  if (
    strength.anchorLiftTrend === 'down' ||
    strength.volumeFloorStatus === 'missed' ||
    input.workoutSnapshot.actionCard?.preservationRisk === 'high'
  ) {
    return 'leaking'
  }

  if (
    strength.volumeFloorStatus === 'at_risk' ||
    input.workoutSnapshot.actionCard?.preservationRisk === 'medium'
  ) {
    return 'at_risk'
  }

  return 'preserved'
}

export function buildFoodTrustVerdict(input: {
  date: string
  logsByDate: Record<string, FoodLogEntry[]>
  foodReviewQueue: FoodReviewItem[]
}): FoodTrustVerdict {
  const windowStart = addDays(input.date, -13)
  const windowDates = enumerateDateKeys(windowStart, input.date)
  const loggedDays = windowDates.filter((date) =>
    (input.logsByDate[date] ?? []).some((entry) => !entry.deletedAt),
  )
  const pendingReview = input.foodReviewQueue.some(
    (item) =>
      item.status === 'pending' &&
      (!item.linkedEntryDate ||
        (item.linkedEntryDate >= windowStart && item.linkedEntryDate <= input.date)),
  )
  const blockedEntry = windowDates.some((date) =>
    (input.logsByDate[date] ?? []).some((entry) => {
      if (entry.deletedAt) {
        return false
      }

      const evidence = entry.snapshot.trustEvidence ?? classifyFoodTrustEvidence({ snapshot: entry.snapshot })
      return evidence.status === 'blocked'
    }),
  )
  const untrustedEntry = windowDates.some((date) =>
    (input.logsByDate[date] ?? []).some((entry) => {
      if (entry.deletedAt) {
        return false
      }

      const evidence = entry.snapshot.trustEvidence ?? classifyFoodTrustEvidence({ snapshot: entry.snapshot })
      return entry.needsReview || evidence.status !== 'trusted'
    }),
  )

  if (blockedEntry || pendingReview || untrustedEntry) {
    return 'review_required'
  }

  if (loggedDays.length < MINIMUM_LOGGED_DAYS) {
    return 'logging_incomplete'
  }

  return 'trusted_for_coaching'
}

export function buildScaleLieVerdict(input: {
  date: string
  minimumHistoryMet: boolean
  currentCheckIn: CheckInRecord | null
  priorCheckIn: CheckInRecord | null
  bodyProgressSnapshots: BodyProgressSnapshot[]
  dietPhases: DietPhase[]
  dietPhaseEvents: DietPhaseEvent[]
  coachingDecisionHistory?: CoachingDecisionRecord[]
  foodTrustVerdict?: FoodTrustVerdict
}): ScaleLieVerdict {
  if (!input.minimumHistoryMet || !input.currentCheckIn) {
    return 'insufficient_proof'
  }

  if (input.foodTrustVerdict && input.foodTrustVerdict !== 'trusted_for_coaching') {
    return 'logging_noise'
  }

  const recentSpike = hasRecentPhaseSpike(input.date, input.dietPhaseEvents) ||
    hasActiveDietBreak(input.date, input.dietPhases)
  if (recentSpike && isScaleFlatOrUp(input.currentCheckIn)) {
    return 'expected_spike'
  }

  if (hadPhaseSpikeOnBoundaryDay(input.date, input.dietPhaseEvents) && isScaleFlatOrUp(input.currentCheckIn)) {
    return 'confounded_stall'
  }

  const currentClean = isCleanWindow(input.currentCheckIn, input.bodyProgressSnapshots)
  const priorClean = isCleanWindow(input.priorCheckIn, input.bodyProgressSnapshots)
  const currentSlow = isSlowLoss(input.currentCheckIn)
  const priorSlow = isSlowLoss(input.priorCheckIn)
  const waistDelta = getWaistDelta(input.bodyProgressSnapshots, input.date)
  const recentDecision = hasRecentAcceptedDecision(
    input.coachingDecisionHistory ?? [],
    input.date,
    ['increase_calories', 'decrease_calories', 'increase_steps'],
  )

  if (!currentClean && currentSlow) {
    return 'logging_noise'
  }

  if (currentClean && !priorClean && currentSlow) {
    return 'insufficient_proof'
  }

  if (
    currentClean &&
    priorClean &&
    currentSlow &&
    priorSlow &&
    !recentDecision &&
    (waistDelta === null || waistDelta > WAIST_PROOF_DELTA)
  ) {
    return 'true_stall'
  }

  if (currentSlow && (recentDecision || (waistDelta !== null && waistDelta <= WAIST_PROOF_DELTA))) {
    return 'confounded_stall'
  }

  return 'on_track'
}

function buildProofs(input: {
  date: string
  currentCheckIn: CheckInRecord | null
  minimumHistory: ReturnType<typeof buildMinimumHistoryStatus>
  scaleVerdict: ScaleLieVerdict
  trainingVerdict: TrainingContractVerdict
  phaseVerdict: PhaseOsVerdict
  foodTrustVerdict: FoodTrustVerdict
  workoutSnapshot: WorkoutDashboardSnapshot
  cutDayPlan?: CutDayPlan | null
}): CutOsProof[] {
  const windowStart = addDays(input.date, -13)
  const proofs: CutOsProof[] = [
    {
      id: `scale:${input.date}:${input.scaleVerdict}`,
      source: 'scale',
      title: 'Scale-lie detector',
      summary:
        input.scaleVerdict === 'true_stall'
          ? 'Two clean windows point to a real stall.'
          : input.scaleVerdict === 'expected_spike'
            ? 'A recent phase event explains scale drag.'
            : input.scaleVerdict === 'logging_noise'
              ? 'Logging quality blocks a harder cut call.'
              : input.scaleVerdict === 'confounded_stall'
                ? 'The scale is slow, but the proof stack is confounded.'
                : input.scaleVerdict === 'insufficient_proof'
                  ? `${input.minimumHistory.loggedDays}/${MINIMUM_LOGGED_DAYS} logged days and ${input.minimumHistory.weighIns}/${MINIMUM_WEIGH_INS} weigh-ins are available.`
                  : 'Scale trend does not justify a harder move today.',
      evidenceWindow: { start: windowStart, end: input.date },
      strength: input.scaleVerdict === 'true_stall' ? 'high' : input.scaleVerdict === 'insufficient_proof' ? 'low' : 'medium',
      blocking: input.scaleVerdict === 'logging_noise' || input.scaleVerdict === 'insufficient_proof',
    },
    {
      id: `training:${input.date}:${input.trainingVerdict}`,
      source: 'training',
      title: 'Training preservation contract',
      summary:
        input.trainingVerdict === 'leaking'
          ? 'Strength or volume-floor signals are leaking, so protection outranks a harder cut.'
          : input.trainingVerdict === 'at_risk'
            ? 'Training is at risk; hold aggression until the next session signal.'
            : input.trainingVerdict === 'insufficient_training_data'
              ? 'No active workout plan is available for a preservation contract.'
              : `${input.workoutSnapshot.strengthRetention.anchorLiftName ?? 'Anchor lift'} is preserved and volume floor is met.`,
      evidenceWindow: { start: addDays(input.date, -6), end: input.date },
      strength: input.trainingVerdict === 'preserved' || input.trainingVerdict === 'leaking' ? 'high' : 'medium',
      blocking: input.trainingVerdict === 'leaking',
    },
    {
      id: `phase:${input.date}:${input.phaseVerdict}`,
      source: 'phase',
      title: 'Diet phase OS',
      summary:
        input.phaseVerdict === 'phase_review_due'
          ? 'More than one phase is active today, so phase structure needs review.'
          : input.cutDayPlan?.whyToday ?? 'Standard cut day with no special phase event.',
      evidenceWindow: { start: input.date, end: input.date },
      strength: input.phaseVerdict === 'standard_cut' ? 'medium' : 'high',
      blocking: input.phaseVerdict === 'phase_review_due',
    },
    {
      id: `food:${input.date}:${input.foodTrustVerdict}`,
      source: 'food_trust',
      title: 'Food truth gate',
      summary:
        input.foodTrustVerdict === 'review_required'
          ? 'At least one food entry needs review before it can drive coaching.'
          : input.foodTrustVerdict === 'logging_incomplete'
            ? 'The current window is not logged enough for coaching-grade proof.'
            : 'Logged food data is trusted for coaching.',
      evidenceWindow: { start: windowStart, end: input.date },
      strength: input.foodTrustVerdict === 'trusted_for_coaching' ? 'high' : 'medium',
      blocking: input.foodTrustVerdict !== 'trusted_for_coaching',
    },
  ]

  if (input.currentCheckIn) {
    proofs.push({
      id: `coaching:${input.currentCheckIn.id}`,
      source: 'coaching',
      title: 'Weekly coaching packet',
      summary: input.currentCheckIn.recommendationReason,
      evidenceWindow: {
        start: input.currentCheckIn.weekStartDate,
        end: input.currentCheckIn.weekEndDate,
      },
      strength: input.currentCheckIn.confidenceBand === 'high' ? 'high' : 'medium',
      blocking: false,
    })
  }

  return proofs
}

function buildDiagnosis(input: {
  scaleVerdict: ScaleLieVerdict
  trainingVerdict: TrainingContractVerdict
  phaseVerdict: PhaseOsVerdict
  foodTrustVerdict: FoodTrustVerdict
  minimumHistoryMet: boolean
}): CutOsDiagnosis {
  const blockedBy: string[] = []
  const reasonCodes: string[] = []

  if (!input.minimumHistoryMet) {
    reasonCodes.push('minimum_history_missing')
  }
  if (input.foodTrustVerdict === 'review_required') {
    blockedBy.push('food_trust')
    reasonCodes.push('food_review_required')
  }
  if (input.foodTrustVerdict === 'logging_incomplete') {
    blockedBy.push('logging')
    reasonCodes.push('logging_incomplete')
  }
  if (input.trainingVerdict === 'leaking') {
    reasonCodes.push('training_leaking')
  }
  if (input.phaseVerdict === 'phase_review_due') {
    blockedBy.push('phase')
    reasonCodes.push('phase_review_due')
  }
  if (input.scaleVerdict === 'true_stall') {
    reasonCodes.push('true_stall')
  }
  if (input.scaleVerdict === 'expected_spike') {
    reasonCodes.push('expected_phase_spike')
  }
  if (input.scaleVerdict === 'logging_noise') {
    reasonCodes.push('logging_noise')
  }

  const verdict: CutOsDiagnosis['verdict'] =
    !input.minimumHistoryMet
      ? 'setup_required'
      : blockedBy.includes('food_trust') || blockedBy.includes('logging')
        ? 'review_food'
        : input.trainingVerdict === 'leaking'
          ? 'protect_training'
          : input.phaseVerdict === 'phase_review_due'
            ? 'phase_review'
            : input.scaleVerdict === 'true_stall'
              ? 'true_stall'
              : input.scaleVerdict === 'insufficient_proof'
                ? 'collecting_proof'
                : input.scaleVerdict === 'logging_noise'
                  ? 'blocked'
                  : 'on_track'

  return {
    verdict,
    reasonCodes,
    blockedBy,
    scaleVerdict: input.scaleVerdict,
    trainingVerdict: input.trainingVerdict,
    phaseVerdict: input.phaseVerdict,
    foodTrustVerdict: input.foodTrustVerdict,
  }
}

function buildCommand(input: {
  date: string
  diagnosis: CutOsDiagnosis
  proofs: CutOsProof[]
  currentCheckIn: CheckInRecord | null
  minimumHistory: ReturnType<typeof buildMinimumHistoryStatus>
}): CutOsCommand {
  const proofIds = input.proofs.map((proof) => proof.id)
  const diagnosisId = `cut-os:${input.date}:${input.diagnosis.verdict}:${input.diagnosis.reasonCodes.join('-') || 'none'}`
  const build = (
    partial: Omit<CutOsCommand, 'date' | 'diagnosisId' | 'proofIds'>,
  ): CutOsCommand => ({
    date: input.date,
    diagnosisId,
    proofIds,
    ...partial,
  })

  if (input.diagnosis.verdict === 'setup_required') {
    return build({
      state: 'setup_required',
      primaryAction: `Build proof base: ${input.minimumHistory.loggedDays}/${MINIMUM_LOGGED_DAYS} logged days, ${input.minimumHistory.weighIns}/${MINIMUM_WEIGH_INS} weigh-ins`,
      urgency: 'medium',
      confidence: 'low',
      cta: { label: 'Log today', target: 'log' },
      secondaryActions: [{ label: 'Add weigh-in', target: 'weigh_in', reason: 'Weight history is required for Cut OS.' }],
    })
  }

  if (input.diagnosis.verdict === 'review_food') {
    return build({
      state: 'blocked',
      primaryAction: 'Clear food-truth blockers before changing the cut',
      urgency: 'high',
      confidence: 'medium',
      cta: { label: 'Review blocked food data', target: 'review_food' },
      secondaryActions: [{ label: 'Log clean today', target: 'log', reason: 'A clean current day helps restore coaching trust.' }],
    })
  }

  if (input.diagnosis.verdict === 'protect_training') {
    return build({
      state: 'command_issued',
      primaryAction: 'Protect training before pushing fat loss harder',
      urgency: 'high',
      confidence: 'high',
      cta: { label: 'Open training contract', target: 'train' },
      secondaryActions: [{ label: 'Review proof stack', target: 'coach', reason: 'The coach packet shows why training wins today.' }],
    })
  }

  if (input.diagnosis.verdict === 'phase_review') {
    return build({
      state: 'command_issued',
      primaryAction: 'Review today\'s diet phase before logging',
      urgency: 'medium',
      confidence: 'high',
      cta: { label: 'Open phase settings', target: 'phase' },
      secondaryActions: [{ label: 'Open log', target: 'log', reason: 'Phase templates stay available after review.' }],
    })
  }

  if (input.diagnosis.verdict === 'true_stall') {
    const stepTarget = input.currentCheckIn?.recommendedStepTarget
    return build({
      state: 'command_issued',
      primaryAction: stepTarget
        ? `Raise steps to ${Math.round(stepTarget)} before cutting calories`
        : 'Review the next lever before lowering calories',
      urgency: 'medium',
      confidence: 'high',
      cta: { label: 'Review weekly decision', target: 'coach' },
      secondaryActions: [{ label: 'Open workouts', target: 'train', reason: 'Training must stay protected during the adjustment.' }],
    })
  }

  if (input.diagnosis.scaleVerdict === 'expected_spike' || input.diagnosis.scaleVerdict === 'confounded_stall') {
    return build({
      state: 'command_issued',
      primaryAction: 'Hold the cut; today\'s scale signal is confounded',
      urgency: 'low',
      confidence: 'medium',
      cta: { label: 'Review scale proof', target: 'body_progress' },
      secondaryActions: [{ label: 'Log today', target: 'log', reason: 'Clean logging keeps the next review usable.' }],
    })
  }

  if (input.diagnosis.verdict === 'collecting_proof') {
    return build({
      state: 'collecting_proof',
      primaryAction: 'Collect one more clean proof window',
      urgency: 'medium',
      confidence: 'medium',
      cta: { label: 'Log today cleanly', target: 'log' },
      secondaryActions: [{ label: 'Add weigh-in', target: 'weigh_in', reason: 'A current weigh-in tightens the next verdict.' }],
    })
  }

  return build({
    state: 'command_issued',
    primaryAction: 'Hold today\'s cut plan',
    urgency: 'low',
    confidence: input.diagnosis.trainingVerdict === 'preserved' ? 'high' : 'medium',
    cta: { label: 'Open fast log', target: 'log' },
    secondaryActions: [{ label: 'Review coach packet', target: 'coach', reason: 'Proof stack is available if you want the audit trail.' }],
  })
}

export function buildCutOsSnapshot(input: {
  enabled: boolean
  date: string
  logsByDate: Record<string, FoodLogEntry[]>
  weights: WeightEntry[]
  currentCheckIn: CheckInRecord | null
  checkInHistory?: CheckInRecord[]
  coachingDecisionHistory?: CoachingDecisionRecord[]
  bodyProgressSnapshots: BodyProgressSnapshot[]
  dietPhases: DietPhase[]
  dietPhaseEvents: DietPhaseEvent[]
  cutDayPlan?: CutDayPlan | null
  workoutSnapshot: WorkoutDashboardSnapshot
  foodReviewQueue: FoodReviewItem[]
  now?: string
}): CutOsSnapshot | null {
  if (!input.enabled) {
    return null
  }

  const priorCheckIn =
    input.checkInHistory
      ?.filter((record) => record.id !== input.currentCheckIn?.id && record.weekEndDate < input.date)
      .sort((left, right) => right.weekEndDate.localeCompare(left.weekEndDate))[0] ?? null
  const minimumHistory = buildMinimumHistoryStatus({
    date: input.date,
    logsByDate: input.logsByDate,
    weights: input.weights,
  })
  const foodTrustVerdict = buildFoodTrustVerdict({
    date: input.date,
    logsByDate: input.logsByDate,
    foodReviewQueue: input.foodReviewQueue,
  })
  const scaleVerdict = buildScaleLieVerdict({
    date: input.date,
    minimumHistoryMet: minimumHistory.met,
    currentCheckIn: input.currentCheckIn,
    priorCheckIn,
    bodyProgressSnapshots: input.bodyProgressSnapshots,
    dietPhases: input.dietPhases,
    dietPhaseEvents: input.dietPhaseEvents,
    coachingDecisionHistory: input.coachingDecisionHistory,
    foodTrustVerdict,
  })
  const trainingVerdict = buildTrainingContractVerdict({
    workoutSnapshot: input.workoutSnapshot,
  })
  const phaseVerdict = buildPhaseOsVerdict({
    date: input.date,
    phases: input.dietPhases,
    cutDayPlan: input.cutDayPlan,
  })
  const proofs = buildProofs({
    date: input.date,
    currentCheckIn: input.currentCheckIn,
    minimumHistory,
    scaleVerdict,
    trainingVerdict,
    phaseVerdict,
    foodTrustVerdict,
    workoutSnapshot: input.workoutSnapshot,
    cutDayPlan: input.cutDayPlan,
  })
  const diagnosis = buildDiagnosis({
    scaleVerdict,
    trainingVerdict,
    phaseVerdict,
    foodTrustVerdict,
    minimumHistoryMet: minimumHistory.met,
  })
  const command = buildCommand({
    date: input.date,
    diagnosis,
    proofs,
    currentCheckIn: input.currentCheckIn,
    minimumHistory,
  })

  return {
    command,
    diagnosis,
    proofs,
    generatedAt: input.now ?? new Date().toISOString(),
  }
}

export function buildMacrofactorReplayReport(input: {
  preview: HistoryImportPreview
  localDates?: Set<string>
}): MacrofactorReplayReport | null {
  if (input.preview.provider !== 'macrofactor' || !input.preview.dateRange) {
    return null
  }

  const foodDates = uniqueSorted(input.preview.payload.foodLogEntries.map((entry) => entry.date))
  const weightDates = uniqueSorted(input.preview.payload.weights.map((entry) => entry.date))
  const allDates = uniqueSorted([...foodDates, ...weightDates])
  const reconstructedCommands = allDates.slice(-14).map((date) => {
    const hasFood = foodDates.includes(date)
    const hasWeight = weightDates.includes(date)
    return {
      date,
      primaryAction:
        hasFood && hasWeight
          ? 'Replay: food and weight proof available'
          : hasFood
            ? 'Replay: logging proof available'
            : 'Replay: weight proof available',
      verdict: 'import_only' as const,
    }
  })
  const decisionDiffs = allDates
    .filter((date) => input.localDates?.has(date))
    .slice(0, 10)
    .map((date) => ({
      date,
      localWins: true,
      summary: 'Local records already exist for this date; replay marks imported rows as secondary evidence.',
    }))

  return {
    importedWindow: input.preview.dateRange,
    reconstructedCommands,
    decisionDiffs,
    switchingPitch:
      'MacroFactor history becomes a Cut OS replay: the import shows which days had enough proof, which dates overlap local records, and what commands this app can now reconstruct.',
  }
}
