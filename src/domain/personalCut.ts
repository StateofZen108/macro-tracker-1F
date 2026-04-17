import type {
  BodyProgressCompareMode,
  BodyProgressComparePreset,
  BodyProgressQuickCompare,
  BodyProgressScaleContext,
  BodyProgressSnapshot,
  CheckInRecord,
  CoachInterventionCard,
  CommandConfidence,
  CutDayPlan,
  CutCockpitSnapshot,
  CutCockpitTargetCard,
  DietPhase,
  DietPhaseEvent,
  GarminModifierRecord,
  GarminWorkoutSummary,
  MealType,
  MorningPhoneSnapshot,
  MorningStatusItem,
  NutritionOverviewBundle,
  PhaseMealTemplate,
  ProgressPhotoPose,
  RepeatLogRecommendation,
  RecoveryReadiness,
  RecoveryReadinessSignal,
  RecoverySeverity,
  WeightEntry,
  WorkoutAction,
  WorkoutActionCard,
  StrengthRetentionSnapshot,
  WorkoutRecordSnapshot,
  WorkoutProgram,
  WorkoutSession,
} from '../types'
import { addDays } from '../utils/dates'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 0): number {
  const multiplier = 10 ** digits
  return Math.round(value * multiplier) / multiplier
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatMinutes(value: number | null): string {
  return value === null ? 'Unavailable' : `${Math.round(value)} min`
}

function formatBpm(value: number | null): string {
  return value === null ? 'Unavailable' : `${Math.round(value)} bpm`
}

function formatSignedDelta(value: number, unit: string, digits = 1): string {
  const rounded = digits === 0 ? Math.round(value) : round(value, digits)
  return `${rounded > 0 ? '+' : ''}${rounded} ${unit}`
}

function formatDeltaMagnitude(value: number, unit: string, digits = 1): string {
  const rounded = digits === 0 ? Math.round(value) : round(value, digits)
  return `${rounded} ${unit}`
}

function formatComparePresetLabel(preset: BodyProgressComparePreset): string {
  switch (preset) {
    case '7d':
      return '7-day'
    case '30d':
      return '30-day'
    case 'custom':
      return 'Custom'
    default:
      return 'Same-day'
  }
}

function buildSignal(
  id: RecoveryReadinessSignal['id'],
  label: string,
  status: RecoveryReadinessSignal['status'],
  detail: string,
): RecoveryReadinessSignal {
  return { id, label, status, detail }
}

function sortDescendingByDate<T extends { date: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => right.date.localeCompare(left.date))
}

function getLatestDate(
  today: string,
  modifiers: GarminModifierRecord[],
  workouts: GarminWorkoutSummary[],
): string {
  const dates = [
    ...modifiers.map((record) => record.date),
    ...workouts.map((record) => record.date),
    today,
  ].filter((value) => value <= today)

  return dates.sort((left, right) => right.localeCompare(left))[0] ?? today
}

export function buildRecoveryReadiness(params: {
  today: string
  modifierRecords: GarminModifierRecord[]
  workoutSummaries: GarminWorkoutSummary[]
}): RecoveryReadiness {
  const evaluatedDate = getLatestDate(
    params.today,
    params.modifierRecords,
    params.workoutSummaries,
  )
  const todayRecord =
    sortDescendingByDate(
      params.modifierRecords.filter((record) => record.date <= evaluatedDate),
    )[0] ?? null
  const previousDay = addDays(evaluatedDate, -1)
  const previousDayRecord =
    params.modifierRecords.find((record) => record.date === previousDay) ?? null
  const baselineWindowStart = addDays(evaluatedDate, -14)
  const baselineWindowEnd = addDays(evaluatedDate, -1)
  const baselineRecords = params.modifierRecords.filter(
    (record) => record.date >= baselineWindowStart && record.date <= baselineWindowEnd,
  )
  const baselineSleep = average(
    baselineRecords
      .map((record) => record.sleepMinutes)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  )
  const baselineRhr = average(
    baselineRecords
      .map((record) => record.restingHeartRate)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  )
  const baselineSteps = average(
    baselineRecords
      .map((record) => record.steps)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  )
  const recentWorkout =
    sortDescendingByDate(
      params.workoutSummaries.filter((record) => record.date <= evaluatedDate),
    )[0] ?? null

  const signals: RecoveryReadinessSignal[] = []
  const reasons: string[] = []

  const currentSleep =
    typeof todayRecord?.sleepMinutes === 'number' ? todayRecord.sleepMinutes : null
  const currentRhr =
    typeof todayRecord?.restingHeartRate === 'number'
      ? todayRecord.restingHeartRate
      : null
  const priorDaySteps =
    typeof previousDayRecord?.steps === 'number' ? previousDayRecord.steps : null

  const sleepDegraded =
    currentSleep !== null && baselineSleep !== null && currentSleep <= baselineSleep - 45
  signals.push(
    buildSignal(
      'sleep',
      'Sleep',
      sleepDegraded ? 'degraded' : 'baseline',
      sleepDegraded
        ? `${Math.round(currentSleep)} min versus ${formatMinutes(baselineSleep)} baseline`
        : currentSleep === null
          ? 'No recent sleep import.'
          : `${Math.round(currentSleep)} min versus ${formatMinutes(baselineSleep)}`,
    ),
  )
  if (sleepDegraded) {
    reasons.push('Sleep fell materially below your 14-day baseline.')
  }

  const rhrDegraded =
    currentRhr !== null && baselineRhr !== null && currentRhr >= baselineRhr + 4
  signals.push(
    buildSignal(
      'resting_heart_rate',
      'Resting HR',
      rhrDegraded ? 'degraded' : 'baseline',
      rhrDegraded
        ? `${Math.round(currentRhr)} bpm versus ${formatBpm(baselineRhr)} baseline`
        : currentRhr === null
          ? 'No recent resting-HR import.'
          : `${Math.round(currentRhr)} bpm versus ${formatBpm(baselineRhr)}`,
    ),
  )
  if (rhrDegraded) {
    reasons.push('Resting heart rate rose above your 14-day baseline.')
  }

  const stepLoadDegraded =
    priorDaySteps !== null && baselineSteps !== null && priorDaySteps >= baselineSteps + 3000
  signals.push(
    buildSignal(
      'step_load',
      'Step load',
      stepLoadDegraded ? 'degraded' : 'baseline',
      stepLoadDegraded
        ? `${Math.round(priorDaySteps)} steps on the prior day versus ${Math.round(baselineSteps)} baseline`
        : priorDaySteps === null
          ? 'No prior-day step import.'
          : `${Math.round(priorDaySteps)} steps on the prior day`,
    ),
  )
  if (stepLoadDegraded) {
    reasons.push('Prior-day step load was materially higher than baseline.')
  }

  const workoutLoadDegraded = Boolean(
    recentWorkout &&
      recentWorkout.date >= addDays(evaluatedDate, -1) &&
      ((recentWorkout.durationMinutes ?? 0) >= 75 || (recentWorkout.activeCalories ?? 0) >= 500),
  )
  signals.push(
    buildSignal(
      'workout_load',
      'Workout load',
      workoutLoadDegraded ? 'degraded' : 'baseline',
      recentWorkout
        ? workoutLoadDegraded
          ? `${recentWorkout.workoutName ?? 'Recent workout'} created elevated training load.`
          : `${recentWorkout.workoutName ?? 'Recent workout'} stayed within normal load.`
        : 'No recent Garmin workout summary.',
    ),
  )
  if (workoutLoadDegraded) {
    reasons.push('Recent workout load was high enough to justify a recovery check.')
  }

  const degradedCount = signals.filter((signal) => signal.status === 'degraded').length
  const state: RecoverySeverity =
    (sleepDegraded && rhrDegraded) || degradedCount >= 2
      ? 'red'
      : degradedCount === 1
        ? 'yellow'
        : 'green'
  return {
    state,
    evaluatedDate,
    reasons:
      reasons.length > 0
        ? reasons
        : ['Recovery signals are within baseline and do not justify backing off today.'],
    signals,
  }
}

function buildAnchorTrend(params: {
  templateId: string
  anchorExerciseId: string
  sessions: WorkoutSession[]
}): StrengthRetentionSnapshot['anchorLiftTrend'] {
  const matchingSessions = sortDescendingByDate(
    params.sessions
      .filter((session) => session.templateId === params.templateId)
      .map((session) => ({ ...session, date: session.completedAt })),
  )
  const scoredSessions = matchingSessions
    .map((session) => {
      const exercise = session.exercises.find(
        (entry) => entry.templateExerciseId === params.anchorExerciseId,
      )
      if (!exercise) {
        return null
      }

      const topSetScore = Math.max(
        ...exercise.sets.map((set) => {
          if (typeof set.load === 'number' && typeof set.reps === 'number') {
            return set.load * set.reps
          }

          if (typeof set.reps === 'number') {
            return set.reps
          }

          return 0
        }),
        0,
      )

      return topSetScore > 0 ? topSetScore : null
    })
    .filter((score): score is number => typeof score === 'number')

  if (scoredSessions.length < 2) {
    return 'flat'
  }

  const [latestScore, priorScore] = scoredSessions
  if (latestScore >= priorScore * 1.02) {
    return 'up'
  }

  if (latestScore <= priorScore * 0.98) {
    return 'down'
  }

  return 'flat'
}

export function buildStrengthRetentionSnapshot(params: {
  programs: WorkoutProgram[]
  sessions: WorkoutSession[]
  recoveryState?: RecoverySeverity
}): StrengthRetentionSnapshot {
  const activePrograms = params.programs.filter((program) => !program.archivedAt)
  const primaryTemplate =
    [...activePrograms]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
      ?.templates[0] ?? null
  const anchorExercise = primaryTemplate?.exercises[0] ?? null
  const anchorLiftTrend =
    primaryTemplate && anchorExercise
      ? buildAnchorTrend({
          templateId: primaryTemplate.id,
          anchorExerciseId: anchorExercise.id,
          sessions: params.sessions,
        })
      : 'flat'

  const windowStart = addDays(new Date().toISOString().slice(0, 10), -6)
  const recentSessions = params.sessions.filter((session) => session.date >= windowStart)
  const recentSetCount = recentSessions.reduce(
    (sum, session) =>
      sum + session.exercises.reduce((exerciseSum, exercise) => exerciseSum + exercise.sets.length, 0),
    0,
  )
  const plannedSetCount = activePrograms.reduce(
    (programSum, program) =>
      programSum +
      program.templates.reduce(
        (templateSum, template) =>
          templateSum +
          template.exercises.reduce(
            (exerciseSum, exercise) => exerciseSum + Math.max(exercise.targetSets, 0),
            0,
          ),
        0,
      ),
    0,
  )
  const sessionCompletionRate7d =
    activePrograms.length > 0
      ? clamp(recentSessions.length / Math.max(activePrograms.flatMap((program) => program.templates).length, 1), 0, 1)
      : 0
  const volumeFloorStatus: StrengthRetentionSnapshot['volumeFloorStatus'] =
    plannedSetCount <= 0 || recentSetCount >= plannedSetCount
      ? 'met'
      : recentSetCount >= plannedSetCount * 0.6
        ? 'at_risk'
        : 'missed'

  const score =
    70 +
    (anchorLiftTrend === 'up' ? 15 : anchorLiftTrend === 'flat' ? 5 : -20) +
    (volumeFloorStatus === 'met' ? 15 : volumeFloorStatus === 'at_risk' ? 0 : -15) +
    (params.recoveryState === 'red' ? -10 : params.recoveryState === 'yellow' ? -5 : 0) +
    (sessionCompletionRate7d >= 1 ? 10 : sessionCompletionRate7d >= 0.6 ? 0 : -10)

  return {
    anchorLiftName: anchorExercise?.name,
    anchorLiftTrend,
    volumeFloorStatus,
    sessionCompletionRate7d: round(sessionCompletionRate7d * 100, 0),
    strengthRetentionScore: clamp(Math.round(score), 0, 100),
  }
}

function isFreshReadinessSnapshot(readiness: RecoveryReadiness | null | undefined, today: string): boolean {
  if (!readiness) {
    return false
  }

  return readiness.evaluatedDate >= addDays(today, -3) && readiness.evaluatedDate <= today
}

function hasImportedReadinessSnapshot(readiness: RecoveryReadiness | null | undefined): boolean {
  if (!readiness) {
    return false
  }

  return readiness.signals.some((signal) => !signal.detail.startsWith('No '))
}

function findLatestWeightOnOrBeforeDate(weights: WeightEntry[], targetDate?: string): WeightEntry | null {
  if (!targetDate) {
    return null
  }

  return (
    [...weights]
      .filter((entry) => entry.date <= targetDate)
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  )
}

function getPhaseEffectiveEndDate(phase: DietPhase): string {
  return phase.actualEndDate ?? phase.plannedEndDate
}

function isPhaseActiveOnDate(phase: DietPhase, date: string): boolean {
  return (
    phase.status !== 'cancelled' &&
    phase.status !== 'completed' &&
    phase.startDate <= date &&
    getPhaseEffectiveEndDate(phase) >= date
  )
}

function findCutDayTemplate(
  templates: PhaseMealTemplate[] | undefined,
  dayType: CutDayPlan['dayType'],
): PhaseMealTemplate | null {
  return (
    (templates ?? [])
      .filter(
        (template) =>
          !template.archivedAt &&
          template.dayType === dayType &&
          (template.seedReviewState ?? 'accepted') === 'accepted',
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null
  )
}

function buildCutDayCopy(dayType: CutDayPlan['dayType']): Pick<
  CutDayPlan,
  'macroIntentLabel' | 'trainingIntentLabel' | 'whyToday'
> {
  switch (dayType) {
    case 'diet_break_day':
      return {
        macroIntentLabel: 'Diet break targets',
        trainingIntentLabel: 'Train with recovery restored, not forced aggression',
        whyToday: 'A diet break is active today, so normal cut-day pressure is suppressed.',
      }
    case 'refeed_day':
      return {
        macroIntentLabel: 'Refeed targets',
        trainingIntentLabel: 'Use the extra fuel to preserve performance, not to ignore risk',
        whyToday: 'A planned PSMF refeed is active today.',
      }
    case 'high_carb_day':
      return {
        macroIntentLabel: 'High-carb day targets',
        trainingIntentLabel: 'Use the higher-carb day to support performance and recovery',
        whyToday: 'A carb-cycle high-carb day is active today.',
      }
    case 'psmf_day':
      return {
        macroIntentLabel: 'PSMF targets',
        trainingIntentLabel: 'Preserve strength while training conservatively',
        whyToday: 'A PSMF phase is active today.',
      }
    default:
      return {
        macroIntentLabel: 'Standard cut targets',
        trainingIntentLabel: 'Train off recovery and strength signals',
        whyToday: 'No special cut-day event is active today.',
      }
  }
}

export function buildCutDayPlan(params: {
  date: string
  phases: DietPhase[]
  phaseEvents: DietPhaseEvent[]
  phaseMealTemplates?: PhaseMealTemplate[]
}): CutDayPlan {
  const activePhases = params.phases.filter((phase) => isPhaseActiveOnDate(phase, params.date))
  const activeDietBreak =
    activePhases.find((phase) => phase.type === 'diet_break') ?? null
  const activePsmf =
    activePhases.find((phase) => phase.type === 'psmf') ?? null
  const activeCarbCycle =
    activePhases.find((phase) => phase.type === 'carb_cycle') ?? null
  const activeEvents = params.phaseEvents
    .filter((event) => !event.deletedAt && event.date === params.date)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const activeRefeed =
    activePsmf
      ? activeEvents.find(
          (event) => event.phaseId === activePsmf.id && event.type === 'refeed_day',
        ) ?? null
      : null
  const activeHighCarb =
    activeCarbCycle
      ? activeEvents.find(
          (event) => event.phaseId === activeCarbCycle.id && event.type === 'high_carb_day',
        ) ?? null
      : null

  const resolvedDayType: CutDayPlan['dayType'] = activeDietBreak
    ? 'diet_break_day'
    : activeRefeed
      ? 'refeed_day'
      : activeHighCarb
        ? 'high_carb_day'
        : activePsmf
          ? 'psmf_day'
          : 'standard_cut_day'
  const copy = buildCutDayCopy(resolvedDayType)
  const template = findCutDayTemplate(params.phaseMealTemplates, resolvedDayType)

  return {
    date: params.date,
    dayType: resolvedDayType,
    phaseId:
      resolvedDayType === 'diet_break_day'
        ? activeDietBreak?.id
        : resolvedDayType === 'refeed_day'
          ? activePsmf?.id
          : resolvedDayType === 'high_carb_day'
            ? activeCarbCycle?.id
            : activePsmf?.id,
    eventId: activeRefeed?.id ?? activeHighCarb?.id,
    templateId: template?.id,
    ...copy,
  }
}

function buildTrainingConfidence(params: {
  readinessFresh: boolean
  readinessAvailable: boolean
  readinessState: RecoveryReadiness['state'] | null
  hasStrongLocalRisk: boolean
  hasLocalRisk: boolean
  hasAnchorLift: boolean
}): CommandConfidence {
  if (!params.hasAnchorLift) {
    return 'low'
  }

  const alignedFreshSignals =
    params.readinessFresh &&
    params.hasAnchorLift &&
    ((params.readinessState === 'green' && !params.hasLocalRisk && !params.hasStrongLocalRisk) ||
      (params.readinessState === 'yellow' && params.hasLocalRisk) ||
      (params.readinessState === 'red' && params.hasStrongLocalRisk))

  if (alignedFreshSignals) {
    return 'high'
  }

  if ((!params.readinessFresh || !params.readinessAvailable) && (params.hasLocalRisk || params.hasStrongLocalRisk)) {
    return 'medium'
  }

  return 'low'
}

function buildFuelDirective(
  cutDayPlan: CutDayPlan | null | undefined,
  action: WorkoutAction,
): string {
  if (action === 'back_off') {
    return 'Keep fueling consistent and do not use carbs as a reason to ignore the back-off call.'
  }

  switch (cutDayPlan?.dayType) {
    case 'refeed_day':
      return 'Use the planned refeed carbs to support performance and recovery today.'
    case 'high_carb_day':
      return 'Use the planned high-carb intake to support the session without overshooting the plan.'
    case 'diet_break_day':
      return 'Eat to the diet-break target and let recovery normalize before adding aggression.'
    case 'psmf_day':
      return 'Keep protein high, keep carbs tight, and avoid adding extra food unless recovery requires it.'
    default:
      return 'Hold the planned cut-day intake and fuel the session off the existing target.'
  }
}

function buildVolumeDirective(action: WorkoutAction): string {
  switch (action) {
    case 'back_off':
      return 'Reduce top-end effort and cap volume below the normal floor today.'
    case 'hold':
      return 'Keep planned volume steady and avoid adding extra work.'
    case 'push':
      return 'Run the planned work and allow normal progression if the session stays clean.'
    default:
      return 'Review the planned volume before deciding whether to push or trim work.'
  }
}

function buildPreservationRisk(
  action: WorkoutAction,
  hasStrongLocalRisk: boolean,
  hasLocalRisk: boolean,
): WorkoutActionCard['preservationRisk'] {
  if (action === 'back_off' || hasStrongLocalRisk) {
    return 'high'
  }

  if (action === 'hold' || hasLocalRisk) {
    return 'medium'
  }

  return 'low'
}

function buildWorkoutActionPrimaryCta(
  mode: WorkoutActionCard['mode'],
  action: WorkoutAction,
): string {
  if (mode === 'review_first') {
    return 'Review today\'s training signals'
  }

  if (action === 'back_off') {
    return 'Open workouts and reduce today'
  }

  if (action === 'hold') {
    return 'Open workouts and hold steady'
  }

  if (action === 'push') {
    return 'Open workouts and push today'
  }

  return 'Review today\'s training signals'
}

function buildWorkoutActionSecondaryNote(
  mode: WorkoutActionCard['mode'],
  stalenessReason?: string,
): string | undefined {
  if (mode === 'review_first') {
    return 'Signals are incomplete or conflicting, so review the workout before changing the plan.'
  }

  return stalenessReason
}

function buildWorkoutFreshnessLabel(params: {
  readinessAvailable: boolean
  readinessFresh: boolean
}): WorkoutActionCard['freshnessLabel'] {
  if (!params.readinessAvailable) {
    return 'No readiness'
  }

  return params.readinessFresh ? 'Fresh readiness' : 'Stale readiness'
}

function buildWorkoutConfidenceReason(params: {
  confidence: CommandConfidence
  readinessAvailable: boolean
  readinessFresh: boolean
  hasStrongLocalRisk: boolean
  hasLocalRisk: boolean
  hasAnchorLift: boolean
}): string {
  if (params.confidence === 'high') {
    return 'Fresh readiness and local strength signals are aligned.'
  }

  if (params.confidence === 'medium') {
    return params.readinessAvailable && !params.readinessFresh
      ? 'Local training evidence is strong enough to guide today even though readiness is stale.'
      : 'Local strength evidence is sufficient, but not every signal is aligned.'
  }

  if (!params.hasAnchorLift) {
    return 'Anchor-lift evidence is missing, so today stays review-first.'
  }

  if (!params.readinessAvailable) {
    return 'Readiness is missing, so the card stays low confidence until more signals land.'
  }

  return 'Signals conflict or are incomplete, so today stays review-first.'
}

function buildWorkoutEvidenceReasons(): WorkoutActionCard['evidenceReasons'] {
  return [
    'readiness_freshness',
    'anchor_lift_trend',
    'recent_records',
    'volume_floor',
    'completion_adherence',
  ]
}

function buildWorkoutActionReasons(params: {
  action: WorkoutAction
  readiness: RecoveryReadiness | null | undefined
  readinessFresh: boolean
  strengthRetention: StrengthRetentionSnapshot
  recentRecords: WorkoutRecordSnapshot[]
  sessionCompletionRate7d: number
}): string[] {
  const reasons: string[] = []
  const { readiness, readinessFresh, strengthRetention, recentRecords, sessionCompletionRate7d } = params
  const readinessAvailable = hasImportedReadinessSnapshot(readiness)

  if (readinessFresh && readiness && readinessAvailable) {
    reasons.push(`Garmin readiness is ${readiness.state}.`)
  } else if (readiness && readinessAvailable) {
    reasons.push(`Garmin readiness is stale because the latest snapshot is older than 72 hours.`)
  } else {
    reasons.push('No Garmin readiness snapshot is available for today.')
  }

  if (strengthRetention.anchorLiftName) {
    reasons.push(
      `${strengthRetention.anchorLiftName} trend is ${strengthRetention.anchorLiftTrend} and the weekly volume floor is ${strengthRetention.volumeFloorStatus}.`,
    )
  } else {
    reasons.push('No anchor lift is configured yet, so the card is leaning on broader training signals.')
  }

  if (recentRecords.length > 0) {
    const latestRecord = recentRecords[0]
    reasons.push(`Recent workout records are available, led by ${latestRecord.label}.`)
  } else {
    reasons.push('No recent workout records are available yet.')
  }

  reasons.push(`Session completion over the last 7 days is ${Math.round(sessionCompletionRate7d)}%.`)

  if (params.action === 'back_off') {
    reasons.push(
      readinessFresh && readiness?.state === 'red'
        ? 'Readiness is red, so the safest move is to back off today.'
        : 'Anchor lift and volume floor are both slipping, so backing off is the safer call.',
    )
  } else if (params.action === 'hold') {
    reasons.push(
      readinessFresh && readiness?.state === 'yellow'
        ? 'Readiness is yellow, so keep today steady.'
        : 'Local strength evidence is soft enough to justify holding instead of pushing.',
    )
  } else if (params.action === 'push') {
    reasons.push('Readiness is green and no strength-risk condition is present.')
  } else {
    reasons.push('Readiness is stale or missing, and local evidence does not justify changing the plan.')
  }

  return reasons
}

export function buildWorkoutActionCard(params: {
  readiness?: RecoveryReadiness | null
  strengthRetention: StrengthRetentionSnapshot
  recentRecords: WorkoutRecordSnapshot[]
  sessionCompletionRate7d: number
  cutDayPlan?: CutDayPlan | null
  today?: string
  evaluatedAt?: string
}): WorkoutActionCard {
  const today = params.today ?? new Date().toISOString().slice(0, 10)
  const readinessAvailable = hasImportedReadinessSnapshot(params.readiness)
  const readinessFresh = readinessAvailable && isFreshReadinessSnapshot(params.readiness, today)
  const readinessState = readinessFresh ? params.readiness?.state ?? null : null
  const hasStrongLocalRisk =
    params.strengthRetention.anchorLiftTrend === 'down' &&
    params.strengthRetention.volumeFloorStatus === 'missed'
  const hasLocalRisk =
    params.strengthRetention.anchorLiftTrend === 'down' ||
    params.strengthRetention.volumeFloorStatus === 'at_risk' ||
    params.strengthRetention.sessionCompletionRate7d < 60

  let action: WorkoutAction = 'neutral'
  if (readinessState === 'red' || hasStrongLocalRisk) {
    action = 'back_off'
  } else if (readinessState === 'yellow' || hasLocalRisk) {
    action = 'hold'
  } else if (readinessState === 'green' && !hasLocalRisk && !hasStrongLocalRisk) {
    action = 'push'
  }

  const summaryByAction: Record<WorkoutAction, string> = {
    push: 'Readiness and training signals are clean enough to push today.',
    hold: 'Training signals suggest holding steady instead of forcing progression.',
    back_off: 'Recovery or strength-retention signals suggest backing off today.',
    neutral: 'The card is informational because readiness is stale or local signals are inconclusive.',
  }
  const confidence = buildTrainingConfidence({
    readinessFresh,
    readinessAvailable,
    readinessState,
    hasStrongLocalRisk,
    hasLocalRisk,
    hasAnchorLift: Boolean(params.strengthRetention.anchorLiftName),
  })
  const stalenessReason =
    readinessAvailable && params.readiness && !readinessFresh
      ? 'Latest Garmin readiness is older than 72 hours.'
      : !readinessAvailable
        ? 'No Garmin readiness snapshot is available yet.'
        : undefined
  const mode: WorkoutActionCard['mode'] = confidence === 'low' ? 'review_first' : 'directive'
  const normalizedPrimaryCta = buildWorkoutActionPrimaryCta(mode, action)
  const primaryCta =
    mode === 'review_first'
      ? 'Review today\'s training signals'
      : action === 'back_off'
        ? 'Open workouts and reduce today'
        : action === 'hold'
          ? 'Open workouts and hold steady'
      : action === 'push'
            ? 'Open workouts and push today'
            : 'Review today\'s training signals'
  const hasAnchorLift = Boolean(params.strengthRetention.anchorLiftName)
  const readinessAvailableForLabel = readinessAvailable
  const freshnessLabel = buildWorkoutFreshnessLabel({
    readinessAvailable: readinessAvailableForLabel,
    readinessFresh,
  })

  return {
    action,
    title:
      action === 'push'
        ? 'Push today'
        : action === 'hold'
          ? 'Hold steady'
          : action === 'back_off'
            ? 'Back off today'
            : 'Neutral',
    summary: summaryByAction[action],
    reasons: buildWorkoutActionReasons({
      action,
      readiness: params.readiness,
      readinessFresh,
      strengthRetention: params.strengthRetention,
      recentRecords: params.recentRecords,
      sessionCompletionRate7d: params.sessionCompletionRate7d,
    }),
    reasonOrder: ['readiness', 'anchor_lift', 'records', 'completion'],
    source: 'computed',
    evaluatedAt: params.evaluatedAt ?? new Date().toISOString(),
    readinessFresh,
    confidence,
    stalenessReason,
    primaryCta: normalizedPrimaryCta || primaryCta,
    mode,
    secondaryNote: buildWorkoutActionSecondaryNote(mode, stalenessReason),
    fuelDirective: buildFuelDirective(params.cutDayPlan, action),
    volumeDirective: buildVolumeDirective(action),
    preservationRisk: buildPreservationRisk(action, hasStrongLocalRisk, hasLocalRisk),
    evidenceReasons: buildWorkoutEvidenceReasons(),
    confidenceReason: buildWorkoutConfidenceReason({
      confidence,
      readinessAvailable: readinessAvailableForLabel,
      readinessFresh,
      hasStrongLocalRisk,
      hasLocalRisk,
      hasAnchorLift,
    }),
    freshnessLabel,
  }
}

function buildCaptureConsistency(params: {
  latestPhoto?: BodyProgressSnapshot['photos'][number]
  comparePhoto?: BodyProgressSnapshot['photos'][number]
}): BodyProgressQuickCompare['captureConsistency'] {
  if (!params.latestPhoto || !params.comparePhoto) {
    return 'loose'
  }

  if (
    !params.latestPhoto.width ||
    !params.latestPhoto.height ||
    !params.comparePhoto.width ||
    !params.comparePhoto.height
  ) {
    return 'loose'
  }

  const widthDrift =
    Math.abs(params.latestPhoto.width - params.comparePhoto.width) /
    Math.max(params.latestPhoto.width, params.comparePhoto.width, 1)
  const heightDrift =
    Math.abs(params.latestPhoto.height - params.comparePhoto.height) /
    Math.max(params.latestPhoto.height, params.comparePhoto.height, 1)
  const driftPercent = Math.max(widthDrift, heightDrift) * 100
  if (driftPercent <= 10) {
    return 'tight'
  }
  if (driftPercent <= 20) {
    return 'mixed'
  }
  return 'loose'
}

function buildCaptureChecklist(params: {
  latestPhoto?: BodyProgressSnapshot['photos'][number]
  comparePhoto?: BodyProgressSnapshot['photos'][number]
  captureConsistency: BodyProgressQuickCompare['captureConsistency']
}): BodyProgressQuickCompare['captureChecklist'] {
  const hasPair = Boolean(params.latestPhoto && params.comparePhoto)
  const cropStatus =
    !hasPair
      ? 'missing'
      : params.captureConsistency === 'tight'
        ? 'pass'
        : 'watch'
  const distanceStatus =
    !hasPair
      ? 'missing'
      : params.captureConsistency === 'loose'
        ? 'watch'
        : 'pass'
  const lightingStatus =
    !hasPair
      ? 'missing'
      : params.captureConsistency === 'tight'
        ? 'pass'
        : 'watch'

  return [
    {
      id: 'pose_match',
      label: 'Pose match',
      status: hasPair ? 'pass' : 'missing',
      detail: hasPair ? 'Both photos use the same pose.' : 'A matching compare pose photo is missing.',
    },
    {
      id: 'crop_match',
      label: 'Crop match',
      status: cropStatus,
      detail:
        cropStatus === 'pass'
          ? 'Framing is tight enough for a confident compare.'
          : cropStatus === 'watch'
            ? 'Framing drift is noticeable, so compare interpretation stays conservative.'
            : 'Crop consistency cannot be checked without both photos.',
    },
    {
      id: 'distance_match',
      label: 'Distance match',
      status: distanceStatus,
      detail:
        distanceStatus === 'pass'
          ? 'Camera distance looks consistent enough for comparison.'
          : distanceStatus === 'watch'
            ? 'Distance drift is visible, so photo interpretation is softened.'
            : 'Distance consistency cannot be checked without both photos.',
    },
    {
      id: 'lighting_match',
      label: 'Lighting match',
      status: lightingStatus,
      detail:
        lightingStatus === 'pass'
          ? 'Lighting conditions are stable enough for a clean compare.'
          : lightingStatus === 'watch'
            ? 'Lighting is usable but not ideal, so rely on waist and scale context too.'
            : 'Lighting consistency cannot be checked without both photos.',
    },
  ]
}

export function buildBodyProgressQuickCompare(params: {
  latestSnapshot: BodyProgressSnapshot | null
  compareSnapshot: BodyProgressSnapshot | null
  pose: ProgressPhotoPose
  preset: BodyProgressComparePreset
  focusedMetricKey?: string
  compareMode?: BodyProgressCompareMode
  galleryMode?: BodyProgressQuickCompare['galleryMode']
  weights?: WeightEntry[]
  scaleContext?: BodyProgressScaleContext
}): BodyProgressQuickCompare | null {
  const { latestSnapshot, compareSnapshot, pose, preset } = params
  if (!latestSnapshot) {
    return null
  }

  const compareMode = params.compareMode ?? 'side_by_side'
  const galleryMode = params.galleryMode ?? 'latest_vs_compare'
  const scaleContext = params.scaleContext ?? 'neutral'
  const latestMetric =
    latestSnapshot.metrics.find((metric) => metric.key === 'waist') ??
    latestSnapshot.metrics.find((metric) => metric.key === params.focusedMetricKey) ??
    latestSnapshot.metrics[0]
  const compareMetric = latestMetric
    ? compareSnapshot?.metrics.find((metric) => metric.key === latestMetric.key)
    : undefined
  const latestPhoto = latestSnapshot.photos.find((photo) => photo.pose === pose)
  const comparePhoto =
    compareSnapshot?.photos.find((photo) => photo.pose === pose) ??
    (preset === 'same_day' ? latestPhoto : undefined)
  const waistLatest = latestSnapshot.metrics.find((metric) => metric.key === 'waist')
  const waistCompare =
    compareSnapshot && compareSnapshot.id !== latestSnapshot.id
      ? compareSnapshot.metrics.find((metric) => metric.key === 'waist')
      : undefined
  const weightLatest = findLatestWeightOnOrBeforeDate(params.weights ?? [], latestSnapshot.date)
  const weightCompare = findLatestWeightOnOrBeforeDate(params.weights ?? [], compareSnapshot?.date)
  const waistDelta =
    waistLatest && waistCompare ? waistLatest.value - waistCompare.value : undefined
  const weightDelta =
    weightLatest && weightCompare ? weightLatest.weight - weightCompare.weight : undefined
  const missingPhoto = !latestPhoto || (preset !== 'same_day' && !comparePhoto)
  const presetLabel = formatComparePresetLabel(preset)
  const missingSignals: BodyProgressQuickCompare['missingSignals'] = []

  if (missingPhoto) {
    missingSignals.push('compare_photo')
  }
  if (!waistLatest || (preset !== 'same_day' && !waistCompare)) {
    missingSignals.push('waist_metric')
  }
  if (!weightLatest || (preset !== 'same_day' && !weightCompare)) {
    missingSignals.push('weight_compare')
  }

  const captureConsistency =
    compareSnapshot?.id === latestSnapshot.id
      ? 'tight'
      : buildCaptureConsistency({ latestPhoto, comparePhoto })
  const captureChecklist = buildCaptureChecklist({
    latestPhoto,
    comparePhoto,
    captureConsistency,
  })
  const shareEnabled = galleryMode === 'before_after' && Boolean(latestPhoto && comparePhoto)

  let storyTone: BodyProgressQuickCompare['storyTone'] =
    typeof waistDelta === 'number' && waistDelta >= 0.25
      ? 'stalled'
      : typeof waistDelta === 'number' &&
          waistDelta <= -0.25 &&
          (typeof weightDelta !== 'number' ||
            weightDelta <= 0 ||
            scaleContext === 'expected_refeed_spike' ||
            scaleContext === 'expected_diet_break_spike')
        ? 'on_track'
        : 'watch'

  if (captureConsistency === 'loose' && storyTone === 'on_track' && typeof waistDelta !== 'number') {
    storyTone = 'watch'
  }

  const waistTrendLabel =
    typeof waistDelta === 'number' && waistLatest
      ? waistDelta === 0
        ? `Waist flat ${formatDeltaMagnitude(0, waistLatest.unit)}`
        : `Waist ${waistDelta < 0 ? 'down' : 'up'} ${formatDeltaMagnitude(Math.abs(waistDelta), waistLatest.unit)}`
      : undefined
  const scaleContextNote =
    scaleContext === 'expected_refeed_spike'
      ? ' Scale is allowed to look temporarily heavier after a refeed.'
      : scaleContext === 'expected_diet_break_spike'
        ? ' Scale is allowed to look temporarily heavier during a diet break.'
        : ''
  const captureNote =
    captureConsistency === 'loose'
      ? ' Capture consistency is loose, so photo interpretation stays conservative.'
      : captureConsistency === 'mixed'
        ? ' Capture consistency is mixed, so use waist and scale together.'
        : ''
  const storySummary =
    storyTone === 'on_track'
      ? `${presetLabel} progress looks on track${waistTrendLabel ? `: ${waistTrendLabel.toLowerCase()}` : ''}${missingPhoto ? '. Photo compare is missing but your waist trend still supports the cut.' : '.'}${scaleContextNote}${captureNote}`
      : storyTone === 'stalled'
        ? `${presetLabel} progress looks stalled${waistTrendLabel ? `: ${waistTrendLabel.toLowerCase()}` : ''}. Review intake adherence and training recovery before pushing harder.${scaleContextNote}${captureNote}`
        : `${presetLabel} progress needs a watch check${waistTrendLabel ? `: ${waistTrendLabel.toLowerCase()}` : ''}${missingPhoto ? '. Add the missing pose photo to tighten the compare.' : '.'}${scaleContextNote}${captureNote}`
  const nextActionPrompt =
    storyTone === 'on_track'
      ? 'Keep the current cut settings and capture the next compare on schedule.'
      : storyTone === 'stalled'
        ? 'Review logging adherence and recovery before forcing a harder cut.'
        : missingPhoto
          ? 'Add the missing pose photo to tighten the compare.'
          : 'Run another compare before making a bigger change.'

  return {
    preset,
    pose,
    compareMode,
    galleryMode,
    latestDate: latestSnapshot.date,
    compareDate: compareSnapshot?.date,
    metricKey: latestMetric?.key,
    metricLabel: latestMetric?.label,
    metricUnit: latestMetric?.unit,
    metricCurrentValue: latestMetric?.value,
    metricCompareValue: compareMetric?.value,
    metricDeltaLabel:
      latestMetric && compareMetric && latestSnapshot.id !== compareSnapshot?.id
        ? formatSignedDelta(latestMetric.value - compareMetric.value, latestMetric.unit)
        : undefined,
    latestPhotoDataUrl: latestPhoto?.dataUrl,
    comparePhotoDataUrl: comparePhoto?.dataUrl,
    missingPhoto,
    storyTone,
    waistTrendLabel,
    storySummary,
    nextActionPrompt,
    missingSignals,
    scaleContext,
    captureConsistency,
    captureChecklist,
    shareEnabled,
  }
}

export function buildMorningPhoneSnapshot(params: {
  meal: MealType
  repeatLog: RepeatLogRecommendation | null
  workoutAction?: WorkoutActionCard | null
  bodyProgress?: BodyProgressQuickCompare | null
  cutDayPlan?: CutDayPlan | null
  reviewBlockedCount?: number
}): MorningPhoneSnapshot | null {
  const statusItems: MorningStatusItem[] = []
  if (params.workoutAction?.source === 'manual_override') {
    statusItems.push({
      id: 'manual_override_active',
      label: 'Manual workout override',
      detail: 'Today is following your manual action instead of the computed card.',
      tone: 'warning',
    })
  }
  if (!params.workoutAction?.readinessFresh && params.workoutAction?.stalenessReason) {
    statusItems.push({
      id: 'garmin_readiness_stale',
      label: 'Garmin readiness stale',
      detail: params.workoutAction.stalenessReason,
      tone: 'neutral',
    })
  }
  if ((params.reviewBlockedCount ?? 0) > 0) {
    statusItems.push({
      id: 'review_required_logging_blocked',
      label: 'Review-required logging blocked',
      detail: `${params.reviewBlockedCount} item${params.reviewBlockedCount === 1 ? '' : 's'} still need review before logging is fully clear.`,
      tone: 'warning',
    })
  }
  if (params.bodyProgress?.missingPhoto) {
    statusItems.push({
      id: 'compare_photo_missing',
      label: 'Compare photo missing',
      detail: 'The current quick review is missing at least one compare photo.',
      tone: 'neutral',
    })
  }

  const repeatLogAvailable = Boolean(params.repeatLog && params.repeatLog.count > 0)
  const reviewQueueAvailable = (params.reviewBlockedCount ?? 0) > 0 && !repeatLogAvailable
  const progressAvailable = Boolean(params.bodyProgress?.latestDate)
  const candidates: Array<{
    target: MorningPhoneSnapshot['primaryTarget']
    label: string
    confidence: CommandConfidence
    whyNow: string
    available: boolean
  }> = [
    {
      target: 'train',
      label: params.workoutAction?.title ?? 'Back off today',
      confidence: params.workoutAction?.confidence ?? 'medium',
      whyNow: params.workoutAction?.summary ?? 'Training risk is the highest-priority signal right now.',
      available: params.workoutAction?.action === 'back_off',
    },
    {
      target: 'review_queue',
      label: 'Clear pending review items',
      confidence: 'high',
      whyNow: `${params.reviewBlockedCount ?? 0} review item${params.reviewBlockedCount === 1 ? '' : 's'} still need attention before logging is fully clear.`,
      available: reviewQueueAvailable,
      },
      {
        target: 'log',
        label:
          params.repeatLog?.batchAction === 'fill_day'
            ? `Fill today from ${params.repeatLog.templateLabel ?? params.repeatLog?.label ?? 'template'}`
            : params.repeatLog?.batchAction === 'fill_meal'
              ? `Fill ${params.repeatLog?.meal ?? params.meal} from ${params.repeatLog.templateLabel ?? params.repeatLog?.label ?? 'template'}`
              : `Log ${params.repeatLog?.meal ?? params.meal} with one tap`,
        confidence: 'high',
        whyNow:
          params.repeatLog?.batchAction === 'fill_day'
            ? `${params.cutDayPlan?.macroIntentLabel ?? 'Today'} has a full day template ready from ${params.repeatLog.templateLabel ?? params.repeatLog?.label ?? 'saved meals'}.`
            : params.repeatLog?.batchAction === 'fill_meal'
              ? `${params.cutDayPlan?.macroIntentLabel ?? 'Today'} has a meal template ready for ${params.repeatLog?.meal ?? params.meal}.`
              : `${params.repeatLog?.count ?? 0} quick option${params.repeatLog?.count === 1 ? '' : 's'} are ready from ${params.repeatLog?.label.toLowerCase() ?? 'logging shortcuts'}.`,
        available: repeatLogAvailable,
      },
    {
      target: 'train',
      label: params.workoutAction?.title ?? 'Review training signals',
      confidence: params.workoutAction?.confidence ?? 'low',
      whyNow:
        params.workoutAction?.summary ??
        'Training signals are available, but they still need a quick review before you act.',
      available: Boolean(params.workoutAction),
    },
    {
      target: 'progress',
      label: 'Review body progress',
      confidence: params.bodyProgress?.storyTone === 'watch' ? 'medium' : 'high',
      whyNow:
        params.bodyProgress?.storySummary ??
        'Open body progress to review the latest compare and cut story.',
      available: progressAvailable,
    },
  ]

  const primaryCandidate = candidates.find((candidate) => candidate.available)
  if (!primaryCandidate) {
    return null
  }

  const secondaryCandidate = candidates.find(
    (candidate) => candidate.available && candidate.target !== primaryCandidate.target,
  )
  const reasonStack = [
    primaryCandidate.whyNow,
    params.workoutAction?.confidenceReason,
    secondaryCandidate?.whyNow,
  ].filter((reason): reason is string => Boolean(reason)).slice(0, 3)
  const surfaceDensity: MorningPhoneSnapshot['surfaceDensity'] =
    reasonStack.length >= 3 || statusItems.length > 2 ? 'balanced' : 'tight'

  return {
    meal: params.meal,
    laneLabel: params.repeatLog?.label ?? 'Logging shortcuts',
    laneCount: params.repeatLog?.count ?? 0,
    repeatLog: params.repeatLog ?? undefined,
    workoutAction: params.workoutAction ?? undefined,
    bodyProgress: params.bodyProgress ?? undefined,
    cutDayPlan: params.cutDayPlan ?? undefined,
    primaryTarget: primaryCandidate.target,
    primaryLabel: primaryCandidate.label,
    secondaryTarget: secondaryCandidate?.target,
    secondaryLabel: secondaryCandidate?.label,
    secondaryReason: secondaryCandidate?.whyNow,
    whyNow: primaryCandidate.whyNow,
    blockingStatusIds: statusItems.map((item) => item.id),
    confidence: primaryCandidate.confidence,
    statusItems,
    deepLinkTarget: primaryCandidate.target,
    reasonStack,
    surfaceDensity,
  }
}

export function buildCoachInterventionCards(params: {
  checkIn: CheckInRecord | null
  strengthRetention: StrengthRetentionSnapshot
  readiness: RecoveryReadiness
}): CoachInterventionCard[] {
  const checkIn = params.checkIn
  if (!checkIn) {
    return []
  }

  const targetRateMagnitude = Math.abs(checkIn.targetWeeklyRatePercent)
  const actualRateMagnitude = Math.abs(checkIn.actualWeeklyRatePercent)
  const loggingRiskHigh = Boolean(
    (checkIn.dataQuality && checkIn.dataQuality.partialDays + checkIn.dataQuality.unmarkedLoggedDays > 2) ||
      checkIn.blockedReasons?.some(
        (reason) =>
          reason.code === 'partial_logging_high' || reason.code === 'unmarked_logging_high',
      ),
  )
  const tooFastLoss =
    targetRateMagnitude > 0 && actualRateMagnitude > targetRateMagnitude * 1.25
  const tooSlowLoss =
    targetRateMagnitude > 0 &&
    actualRateMagnitude < targetRateMagnitude * 0.75 &&
    checkIn.adherence?.isAdequate === true
  const strengthRiskHigh =
    params.strengthRetention.anchorLiftTrend === 'down' ||
    params.strengthRetention.volumeFloorStatus === 'missed'
  const recoveryRiskHigh = params.readiness.state === 'red'

  if (loggingRiskHigh) {
    return [
      {
        id: `${checkIn.id}:logging_cleanup`,
        kind: 'logging_cleanup',
        title: 'Clean up logging before pushing harder',
        summary: 'Too many partial or untrusted days make this cut look less reliable than it is.',
        severity: 'high',
        reasons: [
          'More than two of the last seven days were partial or untrusted.',
          'Keep complete or fasting days clean before forcing a harder adjustment.',
        ],
      },
    ]
  }

  if (tooFastLoss && (recoveryRiskHigh || strengthRiskHigh)) {
    return [
      {
        id: `${checkIn.id}:diet_break_prompt`,
        kind: 'diet_break_prompt',
        title: 'Back off before strength starts leaking',
        summary: 'Loss is faster than planned and recovery or strength risk is already elevated.',
        severity: 'high',
        reasons: [
          `Actual loss rate is ${round(actualRateMagnitude, 2)}%/week against a ${round(targetRateMagnitude, 2)}% target.`,
          recoveryRiskHigh
            ? 'Readiness is red today.'
            : 'Anchor-lift trend or weekly volume floor is slipping.',
        ],
      },
    ]
  }

  if (tooFastLoss) {
    return [
      {
        id: `${checkIn.id}:hold_target`,
        kind: 'hold_target',
        title: 'Hold the current cut instead of pushing harder',
        summary: 'Fat loss is already moving faster than target, so the next window should stabilize before changing targets.',
        severity: 'medium',
        reasons: [
          `Actual loss rate is ${round(actualRateMagnitude, 2)}%/week against a ${round(targetRateMagnitude, 2)}% target.`,
        ],
      },
    ]
  }

  if (strengthRiskHigh || recoveryRiskHigh) {
    return [
      {
        id: `${checkIn.id}:deload_prompt`,
        kind: 'deload_prompt',
        title: 'Reduce training aggression this week',
        summary: 'Recovery or strength-retention signals are high enough to justify a lighter next exposure.',
        severity: recoveryRiskHigh ? 'high' : 'medium',
        reasons: [
          recoveryRiskHigh
            ? 'Garmin readiness is red.'
            : 'Anchor lift is trending down or the weekly volume floor was missed.',
        ],
      },
    ]
  }

  if (tooSlowLoss) {
    return [
      {
        id: `${checkIn.id}:hold_target_slow`,
        kind: 'hold_target',
        title: 'Do not cut harder until another clean week confirms the stall',
        summary: 'Loss is slower than target, but the next move should wait for one more compliant window before changing targets.',
        severity: 'medium',
        reasons: [
          `Actual loss rate is ${round(actualRateMagnitude, 2)}%/week against a ${round(targetRateMagnitude, 2)}% target.`,
          'Compliance looks adequate, so this week needs confirmation instead of a panic adjustment.',
        ],
      },
    ]
  }

  return [
    {
      id: `${checkIn.id}:stay_the_course`,
      kind: 'stay_the_course',
      title: 'Stay the course',
      summary: 'The cut is moving fast enough without obvious strength or recovery leaks.',
      severity: 'low',
      reasons: [
        'Current signals do not justify changing targets or backing off training.',
      ],
    },
  ]
}

export function buildCutCockpitSnapshot(params: {
  nutritionOverview: NutritionOverviewBundle | null
  readiness: RecoveryReadiness
  strengthRetention: StrengthRetentionSnapshot
  weeklyIntervention?: CoachInterventionCard
  bodyProgressSnapshots: BodyProgressSnapshot[]
}): CutCockpitSnapshot {
  const priorityMetricKeys: CutCockpitTargetCard['key'][] = [
    'calories',
    'protein',
    'fiber',
    'sodium',
    'potassium',
  ]

  const todayMetrics = params.nutritionOverview?.today.metrics ?? []
  const remainingTargets = priorityMetricKeys.flatMap((key) => {
    const metric = todayMetrics.find((candidate) => candidate.key === key)
    if (!metric) {
      return []
    }

    return [
      {
        key,
        label: metric.label,
        consumed: round(metric.value, 0),
        target: round(metric.target, 0),
        remaining: round(metric.target - metric.value, 0),
        unit: metric.unit,
      } satisfies CutCockpitTargetCard,
    ]
  })

  const latestSnapshot = params.bodyProgressSnapshots[0] ?? null
  const compareSnapshot = latestSnapshot
    ? params.bodyProgressSnapshots.find(
        (snapshot) => snapshot.date <= addDays(latestSnapshot.date, -7),
      ) ??
      params.bodyProgressSnapshots.find(
        (snapshot) => snapshot.date <= addDays(latestSnapshot.date, -30),
      ) ??
      null
    : null
  const comparedMetricCount =
    latestSnapshot && compareSnapshot
      ? latestSnapshot.metrics.filter((metric) =>
          compareSnapshot.metrics.some((candidate) => candidate.key === metric.key),
        ).length
      : latestSnapshot?.metrics.length ?? 0

  return {
    dailyQuestion: 'What should I do today to keep losing fast without giving away strength?',
    remainingTargets,
    readiness: params.readiness,
    weeklyIntervention: params.weeklyIntervention,
    strengthRetention: params.strengthRetention,
    latestBodyProgressDate: latestSnapshot?.date,
    compareBodyProgressDate: compareSnapshot?.date,
    comparedMetricCount,
    comparedPhotoCount: latestSnapshot?.photos.length ?? 0,
  }
}
