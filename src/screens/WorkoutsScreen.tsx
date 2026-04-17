import { useEffect, useMemo, useState } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import type {
  ActionResult,
  AppActionError,
  GarminWorkoutSummary,
  ProgressionDecision,
  UserSettings,
  WorkoutDashboardSnapshot,
  WorkoutEvidenceReason,
  WorkoutGoal,
  WorkoutMuscleGroup,
  WorkoutProgram,
  WorkoutRestTimerSound,
  WorkoutSession,
} from '../types'
import { addDays, formatShortDate, getTodayDateKey } from '../utils/dates'

const MUSCLE_GROUP_OPTIONS: WorkoutMuscleGroup[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'glutes', 'core', 'full_body', 'cardio']

interface WorkoutsScreenProps {
  settings: UserSettings
  programs: WorkoutProgram[]
  sessions: WorkoutSession[]
  decisions: ProgressionDecision[]
  garminWorkoutSummaries?: GarminWorkoutSummary[]
  snapshot: WorkoutDashboardSnapshot
  lastError?: AppActionError | null
  onUpdateSettings: (settings: UserSettings) => ActionResult<void>
  onCreateProgram: (input: {
    name: string
    goal: WorkoutGoal
    templateName: string
    slotKey: string
    defaultSets: number
    defaultReps: number
    defaultLoad?: number
    defaultRir?: number
    defaultRestSeconds?: number
    exerciseDefinitions: Array<{
      name: string
      muscleGroup?: WorkoutMuscleGroup
      equipment?: string[]
      customExerciseId?: string
    }>
    gymProfileId?: string
    preservationDefaults?: WorkoutProgram['preservationDefaults']
  }) => ActionResult<WorkoutProgram>
  onUpdateProgramPreservationDefaults: (
    programId: string,
    preservationDefaults: WorkoutProgram['preservationDefaults'],
  ) => ActionResult<WorkoutProgram>
  onLogSession: (input: {
    program: WorkoutProgram
    template: WorkoutProgram['templates'][number]
    notes?: string
    date: string
    exercises: WorkoutSession['exercises']
  }) => ActionResult<{ session: WorkoutSession; decision: ProgressionDecision | null }>
}

type SetDraft = { reps: string; load: string; rir: string }

const REST_TIMER_SOUND_OPTIONS: WorkoutRestTimerSound[] = ['soft', 'beep', 'silent']

function formatGoal(goal: WorkoutGoal): string {
  return goal === 'strength_preservation' ? 'Strength preservation' : goal === 'hypertrophy' ? 'Hypertrophy' : 'General strength'
}

function formatMuscleGroup(group: WorkoutMuscleGroup): string {
  return group.replace('_', ' ')
}

function parseEquipment(input: string): string[] {
  return input.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
}

function formatEvidenceReason(reason: WorkoutEvidenceReason): string {
  switch (reason) {
    case 'readiness_freshness':
      return 'Readiness freshness'
    case 'anchor_lift_trend':
      return 'Anchor-lift trend'
    case 'recent_records':
      return 'Recent records'
    case 'volume_floor':
      return 'Volume floor'
    case 'completion_adherence':
      return 'Completion adherence'
    default:
      return reason
  }
}

function formatRestTimerSound(sound: WorkoutRestTimerSound | undefined): string {
  if (sound === 'soft') {
    return 'Soft'
  }
  if (sound === 'beep') {
    return 'Beep'
  }
  return 'Silent'
}

function buildSetDrafts(template: WorkoutProgram['templates'][number]): Record<string, SetDraft[]> {
  return Object.fromEntries(
    template.exercises.map((exercise) => [
      exercise.id,
      Array.from({ length: Math.max(exercise.targetSets, 1) }, () => ({
        reps: `${exercise.targetReps}`,
        load: typeof exercise.targetLoad === 'number' ? `${exercise.targetLoad}` : '',
        rir: typeof exercise.rir === 'number' ? `${exercise.rir}` : '',
      })),
    ]),
  )
}

function filterSessionsByRange(
  sessions: WorkoutSession[],
  range: WorkoutDashboardSnapshot['range'],
): WorkoutSession[] {
  if (range === 'all') {
    return sessions
  }

  const today = getTodayDateKey()
  const offset = range === '7d' ? -6 : range === '30d' ? -29 : range === '90d' ? -89 : -364
  const start = addDays(today, offset)
  return sessions.filter((session) => session.date >= start && session.date <= today)
}

function buildExerciseDrilldown(
  sessions: WorkoutSession[],
  programs: WorkoutProgram[],
  range: WorkoutDashboardSnapshot['range'],
  selectedExerciseId: string | null,
): WorkoutDashboardSnapshot['exerciseDrilldown'] {
  if (!selectedExerciseId) {
    return undefined
  }

  const exerciseDefinitions = new Map(
    programs.flatMap((program) =>
      program.templates.flatMap((template) =>
        template.exercises.map((exercise) => [exercise.customExerciseId ?? exercise.id, exercise] as const),
      ),
    ),
  )
  const selectedDefinition = exerciseDefinitions.get(selectedExerciseId)
  let totalVolume = 0
  let totalReps = 0
  let totalSets = 0
  let heaviestLoad = 0
  let sessionCount = 0

  for (const session of filterSessionsByRange(sessions, range)) {
    for (const exercise of session.exercises) {
      const definition = exerciseDefinitions.get(exercise.templateExerciseId)
      const resolvedExerciseId = definition?.customExerciseId ?? exercise.templateExerciseId
      const selectedMatchesCustom =
        Boolean(selectedDefinition?.customExerciseId) &&
        selectedDefinition?.customExerciseId === selectedExerciseId &&
        resolvedExerciseId === exercise.templateExerciseId
      if (resolvedExerciseId !== selectedExerciseId && !selectedMatchesCustom) {
        continue
      }

      sessionCount += 1
      totalSets += exercise.sets.length
      totalReps += exercise.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)
      totalVolume += exercise.sets.reduce((sum, set) => sum + (set.load ?? 0) * (set.reps ?? 0), 0)
      heaviestLoad = Math.max(
        heaviestLoad,
        exercise.sets.reduce((maxLoad, set) => Math.max(maxLoad, set.load ?? 0), 0),
      )
    }
  }

  if (sessionCount === 0) {
    return undefined
  }

  return {
    exerciseId: selectedExerciseId,
    name: selectedDefinition?.name ?? 'Exercise',
    range,
    totalVolume: Math.round(totalVolume),
    totalReps,
    totalSets,
    heaviestLoad,
    sessionCount,
  }
}

export function WorkoutsScreen({
  settings,
  programs,
  sessions,
  decisions,
  garminWorkoutSummaries = [],
  snapshot,
  lastError,
  onUpdateSettings,
  onCreateProgram,
  onUpdateProgramPreservationDefaults,
  onLogSession,
}: WorkoutsScreenProps) {
  const gymProfiles = settings.gymProfiles ?? []
  const customExercises = settings.customExercises ?? []
  const activePrograms = useMemo(() => programs.filter((program) => !program.archivedAt), [programs])
  const recentSessions = useMemo(() => sessions.slice(0, 5), [sessions])
  const activeGymProfile = gymProfiles.find((profile) => profile.id === settings.activeGymProfileId) ?? gymProfiles[0] ?? null
  const compatibleCustomExercises = useMemo(() => {
    if (!activeGymProfile) {
      return customExercises
    }
    return customExercises.filter((exercise) =>
      exercise.equipment.length === 0 || exercise.equipment.every((equipment) => activeGymProfile.availableEquipment.includes(equipment)),
    )
  }, [activeGymProfile, customExercises])

  const [programName, setProgramName] = useState('')
  const [templateName, setTemplateName] = useState('Day A')
  const [slotKey, setSlotKey] = useState('day-a')
  const [programGoal, setProgramGoal] = useState<WorkoutGoal>('strength_preservation')
  const [exerciseLines, setExerciseLines] = useState('Squat | legs | barbell\nBench Press | chest | barbell\nRow | back | cable')
  const [defaultSets, setDefaultSets] = useState('3')
  const [defaultReps, setDefaultReps] = useState('8')
  const [defaultLoad, setDefaultLoad] = useState('')
  const [defaultRir, setDefaultRir] = useState('2')
  const [defaultRestSeconds, setDefaultRestSeconds] = useState('120')
  const [backOffCapPercent, setBackOffCapPercent] = useState('15')
  const [restTimerSound, setRestTimerSound] = useState<WorkoutRestTimerSound>('soft')
  const [smartWarmupsEnabled, setSmartWarmupsEnabled] = useState(true)
  const [customExerciseName, setCustomExerciseName] = useState('')
  const [customExerciseMuscleGroup, setCustomExerciseMuscleGroup] = useState<WorkoutMuscleGroup>('full_body')
  const [customExerciseEquipment, setCustomExerciseEquipment] = useState('barbell')
  const [gymProfileName, setGymProfileName] = useState('')
  const [gymProfileEquipment, setGymProfileEquipment] = useState('barbell,dumbbell,machine,cable')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(activePrograms[0]?.templates[0]?.id ?? null)
  const [analyticsRange, setAnalyticsRange] = useState<WorkoutDashboardSnapshot['range']>(snapshot.range)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    snapshot.exerciseDrilldown?.exerciseId ?? snapshot.exerciseTrends[0]?.id ?? null,
  )
  const [sessionDate, setSessionDate] = useState(getTodayDateKey())
  const [sessionNotes, setSessionNotes] = useState('')
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [showAdvancedSetup, setShowAdvancedSetup] = useState(false)
  const today = getTodayDateKey()
  const selectedTemplate = useMemo(
    () =>
      activePrograms.flatMap((program) => program.templates.map((template) => ({ program, template }))).find(
        (entry) => entry.template.id === selectedTemplateId,
      ) ?? null,
    [activePrograms, selectedTemplateId],
  )
  const [setDrafts, setSetDrafts] = useState<Record<string, SetDraft[]>>(selectedTemplate ? buildSetDrafts(selectedTemplate.template) : {})

  useEffect(() => {
    if (!selectedTemplateId && activePrograms[0]?.templates[0]?.id) {
      setSelectedTemplateId(activePrograms[0].templates[0].id)
    }
  }, [activePrograms, selectedTemplateId])

  useEffect(() => {
    setAnalyticsRange(snapshot.range)
  }, [snapshot.range])

  useEffect(() => {
    if (selectedExerciseId) {
      return
    }

    setSelectedExerciseId(snapshot.exerciseDrilldown?.exerciseId ?? snapshot.exerciseTrends[0]?.id ?? null)
  }, [selectedExerciseId, snapshot.exerciseDrilldown?.exerciseId, snapshot.exerciseTrends])

  const exerciseDrilldown = useMemo(
    () => buildExerciseDrilldown(sessions, programs, analyticsRange, selectedExerciseId),
    [analyticsRange, programs, selectedExerciseId, sessions],
  )
  const todayActionOverride = useMemo(
    () =>
      [...(settings.workoutActionOverrides ?? [])]
        .filter((entry) => entry.date === today)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null,
    [settings.workoutActionOverrides, today],
  )

  function updateSettings(nextSettings: UserSettings): boolean {
    const result = onUpdateSettings(nextSettings)
    if (!result.ok) {
      setSettingsError(result.error.message)
      return false
    }
    setSettingsError(null)
    return true
  }

  function setWorkoutActionOverride(action: 'push' | 'hold' | 'back_off' | 'neutral'): void {
    const nextOverrides = (settings.workoutActionOverrides ?? [])
      .filter((entry) => entry.date !== today)
      .concat({
        date: today,
        action,
        updatedAt: new Date().toISOString(),
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

    updateSettings({
      ...settings,
      workoutActionOverrides: nextOverrides,
    })
  }

  function clearWorkoutActionOverride(): void {
    updateSettings({
      ...settings,
      workoutActionOverrides: (settings.workoutActionOverrides ?? []).filter(
        (entry) => entry.date !== today,
      ),
    })
  }

  function handleApplyProgramDefaults(program: WorkoutProgram): void {
    const result = onUpdateProgramPreservationDefaults(program.id, {
      defaultRestSeconds: defaultRestSeconds.trim() ? Number.parseInt(defaultRestSeconds, 10) : undefined,
      defaultTargetRir: defaultRir.trim() ? Number.parseFloat(defaultRir) : undefined,
      backOffCapPercent: backOffCapPercent.trim() ? Number.parseFloat(backOffCapPercent) : undefined,
      restTimerSound,
      smartWarmupsEnabled,
    })
    if (!result.ok) {
      setSettingsError(result.error.message)
      return
    }
    setSettingsError(null)
  }

  function handleAddCustomExercise(): void {
    const name = customExerciseName.trim()
    if (!name) {
      setSettingsError('Enter a custom exercise name.')
      return
    }

    const now = new Date().toISOString()
    if (
      updateSettings({
        ...settings,
        customExercises: [
          {
            id: crypto.randomUUID(),
            name,
            muscleGroup: customExerciseMuscleGroup,
            equipment: parseEquipment(customExerciseEquipment),
            createdAt: now,
            updatedAt: now,
          },
          ...customExercises,
        ],
      })
    ) {
      setCustomExerciseName('')
      setCustomExerciseEquipment('barbell')
    }
  }

  function handleAddGymProfile(): void {
    const name = gymProfileName.trim()
    const equipment = parseEquipment(gymProfileEquipment)
    if (!name || equipment.length === 0) {
      setSettingsError('Enter a gym profile name and at least one equipment type.')
      return
    }

    const now = new Date().toISOString()
    const nextProfile = {
      id: crypto.randomUUID(),
      name,
      availableEquipment: equipment,
      createdAt: now,
      updatedAt: now,
    }
    if (updateSettings({ ...settings, gymProfiles: [...gymProfiles, nextProfile], activeGymProfileId: nextProfile.id })) {
      setGymProfileName('')
      setGymProfileEquipment('barbell,dumbbell,machine,cable')
    }
  }

  function handleCreateProgram(): void {
    const exerciseDefinitions = exerciseLines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [namePart, muscleGroupPart, equipmentPart] = line.split('|').map((entry) => entry.trim())
      const customExercise = customExercises.find((exercise) => exercise.name.toLowerCase() === namePart.toLowerCase())
      return customExercise
        ? { name: customExercise.name, muscleGroup: customExercise.muscleGroup, equipment: customExercise.equipment, customExerciseId: customExercise.id }
        : {
            name: namePart,
            muscleGroup: MUSCLE_GROUP_OPTIONS.includes(muscleGroupPart as WorkoutMuscleGroup) ? (muscleGroupPart as WorkoutMuscleGroup) : undefined,
            equipment: parseEquipment(equipmentPart ?? ''),
          }
    })

    const result = onCreateProgram({
      name: programName,
      goal: programGoal,
      templateName,
      slotKey,
      defaultSets: Number.parseInt(defaultSets, 10),
      defaultReps: Number.parseInt(defaultReps, 10),
      defaultLoad: defaultLoad.trim() ? Number.parseFloat(defaultLoad) : undefined,
      defaultRir: defaultRir.trim() ? Number.parseFloat(defaultRir) : undefined,
      defaultRestSeconds: defaultRestSeconds.trim() ? Number.parseInt(defaultRestSeconds, 10) : undefined,
      exerciseDefinitions,
      gymProfileId: activeGymProfile?.id,
      preservationDefaults: {
        defaultRestSeconds: defaultRestSeconds.trim() ? Number.parseInt(defaultRestSeconds, 10) : undefined,
        defaultTargetRir: defaultRir.trim() ? Number.parseFloat(defaultRir) : undefined,
        backOffCapPercent: backOffCapPercent.trim() ? Number.parseFloat(backOffCapPercent) : undefined,
        restTimerSound,
        smartWarmupsEnabled,
      },
    })
    if (!result.ok) {
      setCreateError(result.error.message)
      return
    }
    setCreateError(null)
    setSelectedTemplateId(result.data.templates[0]?.id ?? null)
    setSetDrafts(result.data.templates[0] ? buildSetDrafts(result.data.templates[0]) : {})
  }

  function handleTemplateSelect(templateId: string): void {
    setSelectedTemplateId(templateId)
    const template = activePrograms.flatMap((program) => program.templates).find((entry) => entry.id === templateId)
    if (template) {
      setSetDrafts(buildSetDrafts(template))
    }
  }

  function handleLogSession(): void {
    if (!selectedTemplate) {
      setSessionError('Choose a template before logging a session.')
      return
    }
    const result = onLogSession({
      program: selectedTemplate.program,
      template: selectedTemplate.template,
      date: sessionDate,
      notes: sessionNotes,
      exercises: selectedTemplate.template.exercises.map((exercise) => ({
        templateExerciseId: exercise.id,
        name: exercise.name,
        sets: (setDrafts[exercise.id] ?? []).map((draft) => ({
          reps: draft.reps.trim() ? Number.parseInt(draft.reps, 10) : undefined,
          load: draft.load.trim() ? Number.parseFloat(draft.load) : undefined,
          rir: draft.rir.trim() ? Number.parseFloat(draft.rir) : undefined,
        })),
      })),
    })
    if (!result.ok) {
      setSessionError(result.error.message)
      return
    }
    setSessionError(null)
    setSessionNotes('')
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="app-card grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Active programs</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{snapshot.activeProgramCount}</p></div>
        <div><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Sessions in 7d</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{snapshot.completedSessionCount7d}</p></div>
        <div><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Strength score</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{snapshot.strengthRetention.strengthRetentionScore}</p></div>
        <div><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Steps in 7d</p><p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{snapshot.steps7d ?? 0}</p></div>
      </section>

      {snapshot.actionCard ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Today&apos;s action
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                {snapshot.actionCard.title}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {snapshot.actionCard.summary}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {snapshot.actionCard.freshnessLabel}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {snapshot.actionCard.confidence} confidence
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {snapshot.actionCard.mode === 'review_first' ? 'Review first' : 'Directive'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {snapshot.actionCard.source === 'manual_override' ? 'Manual' : 'Computed'}
              </span>
            </div>
          </div>
          {snapshot.actionCard.stalenessReason ? (
            <div className="rounded-[18px] bg-slate-100/80 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
              {snapshot.actionCard.stalenessReason}
            </div>
          ) : null}
          {snapshot.actionCard.secondaryNote ? (
            <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              {snapshot.actionCard.secondaryNote}
            </div>
          ) : null}
          <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
            {snapshot.actionCard.confidenceReason}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Fuel
              </p>
              <p className="mt-1">{snapshot.actionCard.fuelDirective}</p>
            </div>
            <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Volume
              </p>
              <p className="mt-1">{snapshot.actionCard.volumeDirective}</p>
            </div>
            <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Preservation risk
              </p>
              <p className="mt-1">{snapshot.actionCard.preservationRisk}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {snapshot.actionCard.reasons.map((reason) => (
              <div
                key={reason}
                className="rounded-[18px] bg-slate-100/80 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/60 dark:text-slate-200"
              >
                {reason}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {snapshot.actionCard.evidenceReasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {formatEvidenceReason(reason)}
              </span>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {([
              ['push', 'Push'],
              ['hold', 'Hold'],
              ['back_off', 'Back off'],
              ['neutral', 'Neutral'],
            ] as const).map(([action, label]) => (
              <button
                key={action}
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  todayActionOverride?.action === action
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
                onClick={() => setWorkoutActionOverride(action)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
            {snapshot.actionCard.primaryCta}
          </div>
          {todayActionOverride ? (
            <button
              type="button"
              className="action-button-secondary w-full"
              onClick={clearWorkoutActionOverride}
            >
              Clear manual override
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="app-card space-y-4 px-4 py-4">
        {activePrograms.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {activePrograms.map((program) => (
              <div key={program.id} className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{program.name}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {formatGoal(program.goal)} | {program.templates.length} template{program.templates.length === 1 ? '' : 's'}
                </p>
                {program.preservationDefaults ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-[16px] bg-slate-50/90 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                      Rest {program.preservationDefaults.defaultRestSeconds ?? '--'}s
                    </div>
                    <div className="rounded-[16px] bg-slate-50/90 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                      Target RIR {program.preservationDefaults.defaultTargetRir ?? '--'}
                    </div>
                    <div className="rounded-[16px] bg-slate-50/90 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                      Back-off cap {program.preservationDefaults.backOffCapPercent ?? '--'}%
                    </div>
                    <div className="rounded-[16px] bg-slate-50/90 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                      Timer {formatRestTimerSound(program.preservationDefaults.restTimerSound)}
                    </div>
                    <div className="rounded-[16px] bg-slate-50/90 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                      Warmups {program.preservationDefaults.smartWarmupsEnabled ? 'Smart on' : 'Smart off'}
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="action-button-secondary mt-3 w-full"
                  onClick={() => handleApplyProgramDefaults(program)}
                >
                  Apply current defaults to program
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-slate-900 dark:text-white">Workout setup</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Keep custom setup behind one disclosure so the default page stays action-first.
            </p>
          </div>
          {FEATURE_FLAGS.quietSettingsV1 ? (
            <button type="button" className="action-button-secondary" onClick={() => setShowAdvancedSetup((current) => !current)}>
              {showAdvancedSetup ? 'Hide advanced setup' : 'Show advanced setup'}
            </button>
          ) : null}
        </div>
        {!FEATURE_FLAGS.quietSettingsV1 || showAdvancedSetup ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="font-display text-2xl text-slate-900 dark:text-white">Custom exercises</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="field" placeholder="Exercise name" value={customExerciseName} onChange={(event) => setCustomExerciseName(event.target.value)} />
                <select className="field" value={customExerciseMuscleGroup} onChange={(event) => setCustomExerciseMuscleGroup(event.target.value as WorkoutMuscleGroup)}>
                  {MUSCLE_GROUP_OPTIONS.map((option) => <option key={option} value={option}>{formatMuscleGroup(option)}</option>)}
                </select>
                <input className="field sm:col-span-2" placeholder="barbell,dumbbell" value={customExerciseEquipment} onChange={(event) => setCustomExerciseEquipment(event.target.value)} />
              </div>
              <button type="button" className="action-button w-full" onClick={handleAddCustomExercise}>Save custom exercise</button>
              <div className="space-y-2">
                {compatibleCustomExercises.map((exercise) => (
                  <button key={exercise.id} type="button" className="w-full rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 text-left dark:border-white/10 dark:bg-slate-900/70" onClick={() => setExerciseLines((current) => current.trim() ? `${current}\n${exercise.name}` : exercise.name)}>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{exercise.name}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatMuscleGroup(exercise.muscleGroup)} | {exercise.equipment.join(', ') || 'any equipment'}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-display text-2xl text-slate-900 dark:text-white">Gym profiles</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="field" placeholder="Profile name" value={gymProfileName} onChange={(event) => setGymProfileName(event.target.value)} />
                <input className="field" placeholder="barbell,dumbbell,machine" value={gymProfileEquipment} onChange={(event) => setGymProfileEquipment(event.target.value)} />
              </div>
              <button type="button" className="action-button w-full" onClick={handleAddGymProfile}>Save gym profile</button>
              <div className="space-y-2">
                {gymProfiles.map((profile) => (
                  <div key={profile.id} className="flex items-center justify-between rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{profile.name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{profile.availableEquipment.join(', ')}</p>
                    </div>
                    {settings.activeGymProfileId === profile.id ? (
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 dark:bg-teal-500/10 dark:text-teal-200">active</span>
                    ) : (
                      <button type="button" className="action-button-secondary" onClick={() => updateSettings({ ...settings, activeGymProfileId: profile.id })}>Activate</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 text-sm text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
            Advanced workout setup is hidden by default. Expand it to edit custom exercises and gym profiles.
          </div>
        )}
        {settingsError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">{settingsError}</div> : null}
      </section>

      <section className="app-card space-y-4 px-4 py-4">
        <p className="font-display text-2xl text-slate-900 dark:text-white">Program builder</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="field" placeholder="Program name" value={programName} onChange={(event) => setProgramName(event.target.value)} />
          <select
            aria-label="Program goal"
            className="field"
            value={programGoal}
            onChange={(event) => setProgramGoal(event.target.value as WorkoutGoal)}
          >
            <option value="strength_preservation">Strength preservation</option>
            <option value="hypertrophy">Hypertrophy</option>
            <option value="general_strength">General strength</option>
          </select>
          <input className="field" placeholder="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
          <input className="field" placeholder="Slot key" value={slotKey} onChange={(event) => setSlotKey(event.target.value)} />
          <input className="field" placeholder="Sets" value={defaultSets} onChange={(event) => setDefaultSets(event.target.value)} />
          <input className="field" placeholder="Reps" value={defaultReps} onChange={(event) => setDefaultReps(event.target.value)} />
          <input className="field" placeholder="Load" value={defaultLoad} onChange={(event) => setDefaultLoad(event.target.value)} />
          <input className="field" placeholder="RIR" value={defaultRir} onChange={(event) => setDefaultRir(event.target.value)} />
          <input className="field" placeholder="Rest seconds" value={defaultRestSeconds} onChange={(event) => setDefaultRestSeconds(event.target.value)} />
          <input className="field" placeholder="Back-off cap %" value={backOffCapPercent} onChange={(event) => setBackOffCapPercent(event.target.value)} />
          <select
            className="field"
            aria-label="Rest timer sound"
            value={restTimerSound}
            onChange={(event) => setRestTimerSound(event.target.value as WorkoutRestTimerSound)}
          >
            {REST_TIMER_SOUND_OPTIONS.map((sound) => (
              <option key={sound} value={sound}>
                Rest timer: {formatRestTimerSound(sound)}
              </option>
            ))}
          </select>
          <label className="flex items-center justify-between rounded-[18px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
            <span>Smart warmups enabled</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-teal-700"
              checked={smartWarmupsEnabled}
              onChange={(event) => setSmartWarmupsEnabled(event.target.checked)}
            />
          </label>
        </div>
        <textarea className="field min-h-28" value={exerciseLines} onChange={(event) => setExerciseLines(event.target.value)} placeholder="One exercise per line. Optional format: Name | muscleGroup | equipment1,equipment2" />
        {createError || lastError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">{createError ?? lastError?.message}</div> : null}
        <button type="button" className="action-button w-full" onClick={handleCreateProgram}>Create workout program</button>
      </section>

      <section className="app-card space-y-4 px-4 py-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="space-y-2 rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Weekly progress</p>
            {snapshot.weeklyTargetsProgress.map((habit) => <div key={habit.id} className="text-sm text-slate-700 dark:text-slate-200">{habit.label}: <span className="font-semibold">{habit.current}/{habit.target}</span> ({habit.status})</div>)}
          </div>
          <div className="space-y-2 rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Muscle groups</p>
            {snapshot.muscleGroupSetCounts.map((entry) => <div key={entry.muscleGroup} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200"><span>{formatMuscleGroup(entry.muscleGroup)}</span><span className="font-semibold">{entry.setCount7d} sets</span></div>)}
          </div>
          <div className="space-y-2 rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Recent records</p>
            {snapshot.recentRecords.length ? snapshot.recentRecords.slice(0, 4).map((record) => <div key={record.id} className="text-sm text-slate-700 dark:text-slate-200">{record.label}: <span className="font-semibold">{record.value}</span> {record.unit}</div>) : <p className="text-sm text-slate-600 dark:text-slate-300">No records yet.</p>}
          </div>
        </div>

        <div className="space-y-3 rounded-[20px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Exercise drilldown</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Switch windows and inspect one exercise across sessions.</p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(['7d', '30d', '90d', '365d', 'all'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    analyticsRange === range
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                  onClick={() => setAnalyticsRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <select
            aria-label="Exercise drilldown exercise"
            className="field"
            value={selectedExerciseId ?? ''}
            onChange={(event) => setSelectedExerciseId(event.target.value)}
          >
            {snapshot.exerciseTrends.map((trend) => (
              <option key={trend.id} value={trend.id}>{trend.name}</option>
            ))}
          </select>
          {exerciseDrilldown ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Sessions</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{exerciseDrilldown.sessionCount}</p></div>
              <div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Sets</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{exerciseDrilldown.totalSets}</p></div>
              <div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Reps</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{exerciseDrilldown.totalReps}</p></div>
              <div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Heaviest load</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{exerciseDrilldown.heaviestLoad}</p></div>
              <div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Volume</p><p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{exerciseDrilldown.totalVolume}</p></div>
            </div>
          ) : <p className="text-sm text-slate-600 dark:text-slate-300">Complete more sessions for this exercise to populate the selected range.</p>}

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="space-y-2 rounded-[20px] bg-slate-50/90 px-4 py-3 dark:bg-slate-950/50">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Habits</p>
              {snapshot.habits.map((habit) => <div key={habit.id} className="text-sm text-slate-700 dark:text-slate-200">{habit.label}: <span className="font-semibold">{habit.current}/{habit.target}</span> ({habit.status})</div>)}
            </div>
            <div className="space-y-2 rounded-[20px] bg-slate-50/90 px-4 py-3 dark:bg-slate-950/50">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Exercise trends</p>
              {snapshot.exerciseTrends.map((trend) => <div key={trend.id} className="text-sm text-slate-700 dark:text-slate-200">{trend.name}: <span className="font-semibold">{trend.sessionCount}</span> sessions, {trend.totalReps} reps, {Math.round(trend.totalVolume)} volume</div>)}
            </div>
          </div>
        </div>
      </section>

      {activePrograms.length ? (
        <section className="app-card space-y-4 px-4 py-4">
          <p className="font-display text-2xl text-slate-900 dark:text-white">Session logger</p>
          <div className="flex flex-wrap gap-2">
            {activePrograms.flatMap((program) => program.templates.map((template) => (
              <button key={template.id} type="button" className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${selectedTemplateId === template.id ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`} onClick={() => handleTemplateSelect(template.id)}>
                {program.name}: {template.name}
              </button>
            )))}
          </div>
          {selectedTemplate ? (
            <div className="space-y-3 rounded-[20px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <input
                aria-label="Session date"
                type="date"
                className="field"
                value={sessionDate}
                onChange={(event) => setSessionDate(event.target.value)}
              />
              {selectedTemplate.template.exercises.map((exercise) => (
                <div key={exercise.id} className="space-y-2 rounded-[18px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{exercise.name}</p>
                  {(setDrafts[exercise.id] ?? []).map((draft, index) => (
                    <div key={`${exercise.id}-${index}`} className="grid gap-2 sm:grid-cols-3">
                      <input className="field" placeholder="Reps" value={draft.reps} onChange={(event) => setSetDrafts((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, reps: event.target.value } : item) }))} />
                      <input className="field" placeholder="Load" value={draft.load} onChange={(event) => setSetDrafts((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, load: event.target.value } : item) }))} />
                      <input className="field" placeholder="RIR" value={draft.rir} onChange={(event) => setSetDrafts((current) => ({ ...current, [exercise.id]: (current[exercise.id] ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, rir: event.target.value } : item) }))} />
                    </div>
                  ))}
                </div>
              ))}
              <textarea className="field min-h-20" placeholder="Session notes" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} />
              {sessionError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">{sessionError}</div> : null}
              <button type="button" className="action-button w-full" onClick={handleLogSession}>Save workout session</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="app-card grid gap-4 px-4 py-4 xl:grid-cols-2">
        <div className="space-y-2">
          <p className="font-display text-2xl text-slate-900 dark:text-white">Progression decisions</p>
          {decisions.length ? decisions.slice(0, 5).map((decision) => (
            <div key={decision.id} className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
              <p className="font-semibold text-slate-900 dark:text-white">{decision.decisionType.replace('_', ' ')}</p>
              <p className="mt-1">{decision.reason}</p>
            </div>
          )) : <p className="text-sm text-slate-600 dark:text-slate-300">Complete two exposures on one slot to unlock deterministic progression.</p>}
        </div>
        <div className="space-y-2">
          <p className="font-display text-2xl text-slate-900 dark:text-white">Recent sessions</p>
          {recentSessions.length ? recentSessions.map((session) => (
            <div key={session.id} className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
              <p className="font-semibold text-slate-900 dark:text-white">{session.slotKey}</p>
              <p className="mt-1">{formatShortDate(session.date)} | {session.exercises.length} exercise{session.exercises.length === 1 ? '' : 's'}</p>
            </div>
          )) : <p className="text-sm text-slate-600 dark:text-slate-300">No sessions logged yet.</p>}
        </div>
        <div className="space-y-2">
          <p className="font-display text-2xl text-slate-900 dark:text-white">Garmin workout summaries</p>
          {garminWorkoutSummaries.length ? garminWorkoutSummaries.slice(0, 5).map((summary) => (
            <div key={summary.id} className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
              <p className="font-semibold text-slate-900 dark:text-white">{summary.workoutName ?? 'Garmin workout'}</p>
              <p className="mt-1">{formatShortDate(summary.date)} | {summary.durationMinutes ?? 0} min | {summary.activeCalories ?? 0} active kcal</p>
            </div>
          )) : <p className="text-sm text-slate-600 dark:text-slate-300">Garmin workout summaries will appear here after sync.</p>}
        </div>
      </section>
    </div>
  )
}
