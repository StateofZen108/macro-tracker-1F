import { Dumbbell, FileText, House, LoaderCircle, MessageSquare, Scale, TriangleAlert, Wifi, WifiOff, X } from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { useAppShell } from './app/useAppShell'
import {
  getDefaultPsmfPhaseSelection,
  resolveSelectedPsmfPhaseId,
  sortHistoricalPhases,
  sortSelectablePsmfPhases,
} from './app/phasePlanner'
import { useBulkApplyController } from './app/useBulkApplyController'
import { useCoachController } from './app/useCoachController'
import { useFoodEntryController } from './app/useFoodEntryController'
import { useInterventionController } from './app/useInterventionController'
import { useUndoQueue } from './app/useUndoQueue'
import { BulkApplyPreviewSheet } from './components/BulkApplyPreviewSheet'
import { AppBottomNav } from './components/AppBottomNav'
import { ConfirmDialog } from './components/ConfirmDialog'
import { CopyPreviousSheet } from './components/CopyPreviousSheet'
import { EditEntrySheet } from './components/EditEntrySheet'
import { InterventionSheet } from './components/InterventionSheet'
import { QuickAddSheet } from './components/QuickAddSheet'
import { SaveRecipeSheet } from './components/SaveRecipeSheet'
import { SaveTemplateSheet } from './components/SaveTemplateSheet'
import { TemplateSheet } from './components/TemplateSheet'
import { UndoToastStack } from './components/UndoToastStack'
import type { RepeatMealCandidate } from './components/add-food/types'
import { useActivityLog } from './hooks/useActivityLog'
import { useCoach } from './hooks/useCoach'
import { useCoaching } from './hooks/useCoaching'
import { useDayMeta } from './hooks/useDayMeta'
import { useDiagnostics } from './hooks/useDiagnostics'
import { useDietPhases } from './hooks/useDietPhases'
import { useFavoriteFoods } from './hooks/useFavoriteFoods'
import { useBodyProgress } from './hooks/useBodyProgress'
import { useFoodLog } from './hooks/useFoodLog'
import { useFoods } from './hooks/useFoods'
import { useGarmin } from './hooks/useGarmin'
import { useInterventions } from './hooks/useInterventions'
import { useMealTemplates } from './hooks/useMealTemplates'
import { usePwaShell } from './hooks/usePwaShell'
import { useRecoveryCheckIns } from './hooks/useRecoveryCheckIns'
import { useRecipes } from './hooks/useRecipes'
import { useSafetySnapshots } from './hooks/useSafetySnapshots'
import { useSettings } from './hooks/useSettings'
import { useSync } from './hooks/useSync'
import { useUiPrefs } from './hooks/useUiPrefs'
import { useWeeklyCheckIns } from './hooks/useWeeklyCheckIns'
import { useWellness } from './hooks/useWellness'
import { useWeights } from './hooks/useWeights'
import { useWorkouts } from './hooks/useWorkouts'
import { DashboardScreen } from './screens/DashboardScreen'
import { LogScreen } from './screens/LogScreen'
import type {
  ActionResult,
  BodyProgressQuickCompare,
  BodyProgressScaleContext,
  CaptureConvenienceSource,
  CoachingReasonCode,
  CutDayPlan,
  DayStatus,
  DietPhase,
  DietPhaseEvent,
  FoodLogEntry,
  PhaseMealTemplate,
  PhaseReviewIntent,
  RecoveryCheckIn,
  LegacyCoachingCode,
  MealType,
  MorningPhoneSnapshot,
  RepeatLogRecommendation,
  SavedMeal,
  PrimaryTabId,
  TabId,
  UserSettings,
  WorkoutActionCard,
} from './types'
import { FEATURE_FLAGS } from './config/featureFlags'
import { reconcileFoodReviewQueue } from './domain/foods/reviewQueue'
import { buildCoreClaimSnapshot } from './domain/benchmark'
import {
  evaluateCoachRuntimeState,
  type CoachRuntimeState,
} from './domain/coaching/runtime'
import { initializeDiagnosticsPersistence } from './utils/diagnostics'
import { recordDiagnosticsEvent } from './utils/diagnostics'
import { buildNutritionOverview, getNutrientAmountV1 } from './domain/nutrition'
import { buildManualOverrideDecisionRecord } from './domain/coaching'
import {
  buildBodyProgressQuickCompare,
  buildCoachInterventionCards,
  buildCutDayPlan,
  buildCutCockpitSnapshot,
  buildMorningPhoneSnapshot,
  buildRecoveryReadiness,
} from './domain/personalCut'
import { addDays, enumerateDateKeys, formatShortDate, getTodayDateKey } from './utils/dates'
import { calculateFoodNutrition, sumNutrition } from './utils/macros'
import { appendCoachingDecision } from './utils/storage/coachDecisions'
import { subscribeToStorage } from './utils/storage/core'
import { loadActivityLog } from './utils/storage/activity'
import { loadAllFoodLogs, loadFoodLog, saveFoodLog } from './utils/storage/logs'
import {
  dismissFoodReviewItem,
  loadFoodReviewQueue,
  saveFoodReviewQueue,
  subscribeToFoodReviewQueue,
} from './utils/storage/foodReviewQueue'
import {
  loadGarminImportedWeights,
  loadGarminModifierRecords,
  loadGarminWorkoutSummaries,
  subscribeToGarminImportStorage,
} from './utils/storage/garminImports'
import { loadBenchmarkReports, subscribeToBenchmarkReports } from './utils/storage/benchmarkReports'
import { getInitializationError, getRecoveryIssues } from './utils/storage/recovery'
import { initializeStorage, isStorageInitialized } from './utils/storage/schema'
const AddFoodSheet = lazy(async () => {
  const module = await import('./components/AddFoodSheet')
  return { default: module.AddFoodSheet }
})
const WeightScreen = lazy(async () => {
  const module = await import('./screens/WeightScreen')
  return { default: module.WeightScreen }
})
const SettingsScreen = lazy(async () => {
  const module = await import('./screens/SettingsScreen')
  return { default: module.SettingsScreen }
})
const CoachScreen = lazy(async () => {
  const module = await import('./screens/CoachScreen')
  return { default: module.CoachScreen }
})
const WorkoutsScreen = lazy(async () => {
  const module = await import('./screens/WorkoutsScreen')
  return { default: module.WorkoutsScreen }
})
const TAB_ITEMS: Array<{
  id: PrimaryTabId
  label: string
  icon: typeof FileText
}> = [
  { id: 'dashboard', label: 'Home', icon: House },
  { id: 'log', label: 'Log', icon: FileText },
  { id: 'weight', label: 'Weight', icon: Scale },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'coach', label: 'Coach', icon: MessageSquare },
]

interface PreviewPsmfGarminUiState {
  dietPhase?: {
    kind: 'no_active_phase' | 'active_psmf' | 'expired_psmf' | 'diet_break_active'
    activeUntilLabel?: string
    expiredOnLabel?: string
  }
  recovery?: {
    severity: 'green' | 'yellow' | 'red'
  }
  garmin?: {
    kind:
      | 'not_enabled'
      | 'not_connected'
      | 'connected'
      | 'syncing'
      | 'rate_limited'
      | 'reconnect_required'
      | 'error'
    lastSyncedLabel?: string
    rateLimitedUntilLabel?: string
    stale?: boolean
  }
  weight?: {
    supplementalLines?: string[]
    blockedReasonLabels?: string[]
  }
}

const PREVIEW_UI_STORAGE_KEY = 'mt_preview_psmf_garmin_ui'

function readPreviewPsmfGarminUiState(): PreviewPsmfGarminUiState | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(PREVIEW_UI_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as PreviewPsmfGarminUiState
  } catch {
    return null
  }
}

function formatDateLabel(dateKey: string | undefined): string | undefined {
  return dateKey ? formatShortDate(dateKey) : undefined
}

function formatDateTimeLabel(timestamp: string | undefined): string | undefined {
  if (!timestamp) {
    return undefined
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function isGarminSnapshotStale(timestamp: string | undefined): boolean {
  if (!timestamp) {
    return false
  }

  return Date.now() - new Date(timestamp).getTime() >= 6 * 60 * 60 * 1000
}

function normalizePhaseStatus(phase: DietPhase, today: string): DietPhase['status'] {
  if (phase.status === 'cancelled' || phase.status === 'completed') {
    return phase.status
  }

  if (phase.plannedEndDate < today) {
    return 'expired'
  }

  if (phase.startDate <= today) {
    return 'active'
  }

  return 'planned'
}

function mapBlockedReasonLabel(code: string): string | null {
  switch (code) {
    case 'psmf_phase_required':
      return 'PSMF phase required'
    case 'psmf_phase_expired':
      return 'PSMF phase expired'
    case 'diet_break_active':
      return 'Diet break active'
    case 'recovery_hold':
      return 'Recovery hold'
    default:
      return null
  }
}

function mergePreviewUiState(
  derivedState: PreviewPsmfGarminUiState | null,
  overrideState: PreviewPsmfGarminUiState | null,
): PreviewPsmfGarminUiState | null {
  if (!derivedState && !overrideState) {
    return null
  }

  if (!derivedState) {
    return overrideState
  }

  if (!overrideState) {
    return derivedState
  }

  const dietPhase =
    overrideState.dietPhase || derivedState.dietPhase
      ? {
          kind: overrideState.dietPhase?.kind ?? derivedState.dietPhase!.kind,
          activeUntilLabel:
            overrideState.dietPhase?.activeUntilLabel ?? derivedState.dietPhase?.activeUntilLabel,
          expiredOnLabel:
            overrideState.dietPhase?.expiredOnLabel ?? derivedState.dietPhase?.expiredOnLabel,
        }
      : undefined
  const recovery =
    overrideState.recovery || derivedState.recovery
      ? {
          severity: overrideState.recovery?.severity ?? derivedState.recovery!.severity,
        }
      : undefined
  const garmin =
    overrideState.garmin || derivedState.garmin
      ? {
          kind: overrideState.garmin?.kind ?? derivedState.garmin!.kind,
          lastSyncedLabel:
            overrideState.garmin?.lastSyncedLabel ?? derivedState.garmin?.lastSyncedLabel,
          rateLimitedUntilLabel:
            overrideState.garmin?.rateLimitedUntilLabel ??
            derivedState.garmin?.rateLimitedUntilLabel,
          stale: overrideState.garmin?.stale ?? derivedState.garmin?.stale,
        }
      : undefined

  return {
    dietPhase,
    recovery,
    garmin,
    weight: {
      ...derivedState.weight,
      ...overrideState.weight,
    },
  }
}

function renderLazyFallback(message: string) {
  return <div className="app-card px-4 py-6 text-sm text-slate-600 dark:text-slate-300">{message}</div>
}

function buildScaleContextFromCutDayPlan(
  cutDayPlan: CutDayPlan | null | undefined,
): BodyProgressScaleContext {
  if (cutDayPlan?.dayType === 'refeed_day') {
    return 'expected_refeed_spike'
  }

  if (cutDayPlan?.dayType === 'diet_break_day') {
    return 'expected_diet_break_spike'
  }

  return 'neutral'
}

function buildDefaultPhaseTemplateLabel(dayType: PhaseMealTemplate['dayType']): string {
  switch (dayType) {
    case 'psmf_day':
      return 'PSMF day'
    case 'refeed_day':
      return 'Refeed day'
    case 'diet_break_day':
      return 'Diet break day'
    case 'high_carb_day':
      return 'High-carb day'
    default:
      return 'Standard cut day'
  }
}

function buildFoodLogEntriesFromSavedMeal(input: {
  savedMeal: SavedMeal
  date: string
  meal: MealType
}): FoodLogEntry[] {
  const baseTime = Date.now()
  return input.savedMeal.entries.map((entry, index) => {
    const timestamp = new Date(baseTime + index).toISOString()
    return {
      id: crypto.randomUUID(),
      foodId: entry.foodId,
      snapshot: entry.snapshot,
      date: input.date,
      meal: input.meal,
      servings: entry.servings,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
}

function AppContent({ bootHealthy }: { bootHealthy: boolean }) {
  const appChromeStyles = { '--app-bottom-clearance': 'calc(env(safe-area-inset-bottom) + 8.5rem)' } as CSSProperties
  const autoSnapshotPrimedRef = useRef(false)
  const [lastStorageMutationAt, setLastStorageMutationAt] = useState(() => Date.now())
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [phaseReviewIntent, setPhaseReviewIntent] = useState<PhaseReviewIntent | null>(null)

  const {
    activeTab,
    setActiveTab,
    selectedDate,
    setSelectedDate,
    globalError,
    clearGlobalError,
    reportError,
    confirmState,
    setConfirmState,
    networkStatus,
    settingsEditorState,
    setSettingsEditorState,
    requestTabChange,
  } = useAppShell()

  const recoveryIssues = getRecoveryIssues()
  const initializationError = getInitializationError()
  const { captureDailySnapshot } = useSafetySnapshots()

  const {
    foods,
    createFood,
    updateFood,
    archiveFood,
    restoreFood,
    purgeFood,
    importFood,
    searchFoods,
    getQuickFoods,
    findDuplicateFood,
    resolveFoodMatch,
    getFoodReferenceCount,
  } = useFoods()
  const allLogsByDate = loadAllFoodLogs()
  const allActivityLog = useSyncExternalStore(subscribeToStorage, loadActivityLog, loadActivityLog)
  const { settings, updateSettings } = useSettings()
  const sync = useSync()
  const diagnostics = useDiagnostics()
  const {
    dietPhases,
    dietPhaseEvents,
    updatePlannedPhase,
    startPsmfPhase,
    extendPhase,
    completePhase,
    startDietBreak,
    startCarbCycle,
    scheduleRefeed,
    scheduleHighCarbDay,
    updateRefeed,
    deleteRefeed,
    deleteHighCarbDay,
    cancelPhase,
    updatePhaseNotes,
  } = useDietPhases()
  const allFoodLogs = useSyncExternalStore(subscribeToStorage, loadAllFoodLogs, loadAllFoodLogs)
  const {
    recoveryCheckIns,
    getEntry: getRecoveryCheckInEntry,
    saveEntry: saveRecoveryCheckInEntry,
    deleteEntry: deleteRecoveryCheckInEntry,
  } = useRecoveryCheckIns()
  const { wellnessEntries } = useWellness()
  const foodReviewQueue = useSyncExternalStore(
    subscribeToFoodReviewQueue,
    loadFoodReviewQueue,
    loadFoodReviewQueue,
  )
  const garminImportedWeights = useSyncExternalStore(
    subscribeToGarminImportStorage,
    loadGarminImportedWeights,
    loadGarminImportedWeights,
  )
  const garminModifierRecords = useSyncExternalStore(
    subscribeToGarminImportStorage,
    loadGarminModifierRecords,
    loadGarminModifierRecords,
  )
  const garminWorkoutSummaries = useSyncExternalStore(
    subscribeToGarminImportStorage,
    loadGarminWorkoutSummaries,
    loadGarminWorkoutSummaries,
  )
  const benchmarkReports = useSyncExternalStore(
    subscribeToBenchmarkReports,
    loadBenchmarkReports,
    loadBenchmarkReports,
  )
  const garmin = useGarmin(sync.session)
  const { uiPrefs, updateUiPrefs } = useUiPrefs()
  const { weights, saveWeight, deleteWeight } = useWeights()
  const bodyProgress = useBodyProgress()
  const { dayMeta, getDayMeta, getDayStatus, setDayStatus, toggleDayMarker } = useDayMeta()
  const {
    getEntry: getActivityEntry,
    saveEntry: saveActivityEntry,
    deleteEntry: deleteActivityEntry,
    restoreEntry: restoreActivityEntry,
  } = useActivityLog()
  const {
    interventions,
    addIntervention,
    updateIntervention,
    deleteIntervention,
    restoreIntervention,
    getInterventionsForDate,
  } = useInterventions()
  const {
    templates,
    createTemplate,
    incrementTemplateUsage,
    deleteTemplate,
    restoreTemplate,
  } = useMealTemplates()
  const { favorites, toggleFavorite } = useFavoriteFoods(foods)
  const {
    recipes,
    allRecipes,
    createRecipe,
    incrementRecipeUsage,
    renameRecipe,
    archiveRecipe,
    restoreRecipe,
    deleteRecipe,
  } = useRecipes(foods)
  const {
    coachThread,
    coachQueue,
    coachFeedback,
    coachConfig,
    coachState,
    starterPrompts,
    queueQuestion,
    clearQueuedQuestion,
    clearThread,
    rateMessage,
    updateCoachConfig,
    buildSnapshot,
  } = useCoach(networkStatus === 'online')
  const {
    entries,
    addEntry,
    addSnapshotEntry,
    appendEntries,
    saveEntries,
    updateEntryServings,
    replaceEntryFood,
    deleteEntry,
    restoreEntry,
  } = useFoodLog(selectedDate)
  const todayDateKey = getTodayDateKey()
  const normalizedDietPhases = useMemo(
    () => {
      const today = getTodayDateKey()
      return (
      dietPhases.map((phase) => ({
        ...phase,
        status: normalizePhaseStatus(phase, today),
      }))
      )
    },
    [dietPhases],
  )
  const todayCutDayPlan = useMemo<CutDayPlan>(
    () =>
      buildCutDayPlan({
        date: todayDateKey,
        phases: normalizedDietPhases,
        phaseEvents: dietPhaseEvents,
        phaseMealTemplates: settings.phaseMealTemplates,
      }),
    [dietPhaseEvents, normalizedDietPhases, settings.phaseMealTemplates, todayDateKey],
  )
  const selectedDateCutDayPlan = useMemo<CutDayPlan>(
    () =>
      buildCutDayPlan({
        date: selectedDate,
        phases: normalizedDietPhases,
        phaseEvents: dietPhaseEvents,
        phaseMealTemplates: settings.phaseMealTemplates,
      }),
    [dietPhaseEvents, normalizedDietPhases, selectedDate, settings.phaseMealTemplates],
  )
  const coachRuntime = useMemo<CoachRuntimeState | undefined>(() => {
    if (
      !FEATURE_FLAGS.psmfPhaseV2 &&
      !FEATURE_FLAGS.recoveryLayerV1 &&
      !FEATURE_FLAGS.garminConnectV1 &&
      !FEATURE_FLAGS.recoveryHybridGates
    ) {
      return undefined
    }

    return {
      phasePlan: {
        phases: normalizedDietPhases.map((phase) => ({
          type: phase.type,
          status: phase.status,
          startDate: phase.startDate,
          plannedEndDate: phase.plannedEndDate,
          actualEndDate: phase.actualEndDate,
          notes: phase.notes,
        })),
        refeeds: dietPhaseEvents
          .filter((event) => !event.deletedAt)
          .map((event) => ({
            date: event.date,
            calorieTargetOverride: event.calorieTargetOverride,
            notes: event.notes,
          })),
      },
      recovery: {
        checkIns: FEATURE_FLAGS.recoveryLayerV1
          ? recoveryCheckIns.map((entry) => ({
              date: entry.date,
              energyScore: entry.energyScore,
              hungerScore: entry.hungerScore,
              sorenessScore: entry.sorenessScore,
              sleepQualityScore: entry.sleepQualityScore,
              notes: entry.notes,
            }))
          : [],
        wellness: FEATURE_FLAGS.garminConnectV1 || FEATURE_FLAGS.recoveryHybridGates
          ? wellnessEntries.map((entry) => ({
              date: entry.date,
              steps: entry.steps,
              sleepMinutes: entry.sleepMinutes,
              restingHeartRate: entry.restingHeartRate,
              stressScore: entry.stressScore,
              bodyBatteryMax: entry.bodyBatteryMax,
              intensityMinutes: entry.intensityMinutes,
              derivedCardioMinutes: entry.derivedCardioMinutes,
            }))
          : [],
        garminModifiers: FEATURE_FLAGS.garminIntelligenceV2
          ? garminModifierRecords.map((record) => ({
              date: record.date,
              steps: record.steps,
              sleepMinutes: record.sleepMinutes,
              restingHeartRate: record.restingHeartRate,
              activeCalories: record.activeCalories,
              derivedCardioMinutes: record.derivedCardioMinutes,
            }))
          : [],
      },
    }
  }, [
    dietPhaseEvents,
    garminModifierRecords,
    normalizedDietPhases,
    recoveryCheckIns,
    wellnessEntries,
  ])
  const coachingSettings = useMemo(
    () =>
      coachRuntime
        ? ({
            ...settings,
            coachRuntime,
          } as UserSettings)
        : settings,
    [coachRuntime, settings],
  )
  const recoveryReadiness = useMemo(
    () =>
      buildRecoveryReadiness({
        today: todayDateKey,
        modifierRecords: FEATURE_FLAGS.garminIntelligenceV2 ? garminModifierRecords : [],
        workoutSummaries: FEATURE_FLAGS.garminIntelligenceV2 ? garminWorkoutSummaries : [],
      }),
    [garminModifierRecords, garminWorkoutSummaries, todayDateKey],
  )
  const workouts = useWorkouts({
    recoverySeverity: recoveryReadiness.state,
    readiness: recoveryReadiness,
    cutDayPlan: todayCutDayPlan,
    stepRecords: garminModifierRecords.map((record) => ({ date: record.date, steps: record.steps })),
    activeGymProfileId: settings.activeGymProfileId,
  })
  const weeklyCheckInAdaptiveInputs = useMemo(
    () => ({
      bodyProgressSnapshots:
        FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1 ? bodyProgress.snapshots : [],
      dietPhases: normalizedDietPhases,
      dietPhaseEvents,
      readiness: recoveryReadiness,
      strengthRetention: workouts.snapshot.strengthRetention,
    }),
    [
      bodyProgress.snapshots,
      dietPhaseEvents,
      normalizedDietPhases,
      recoveryReadiness,
      workouts.snapshot.strengthRetention,
    ],
  )
  const coachingInsight = useCoaching(coachingSettings, weights, recoveryIssues.length)
  const {
    currentCheckIn,
    canApplyTargets: canApplyCheckInTargets,
    checkInHistory,
    coachingDecisionHistory,
    markApplied,
    markDeferred,
    markKept,
    markOverridden,
  } = useWeeklyCheckIns(
    coachingSettings,
    weights,
    recoveryIssues.length,
    weeklyCheckInAdaptiveInputs,
  )
  const visibleCurrentCheckIn = useMemo(() => {
    if (!FEATURE_FLAGS.weeklyDecisionCard || !currentCheckIn) {
      return null
    }

    if (!currentCheckIn.weeklyCheckInPacket) {
      return currentCheckIn
    }

    const interventions = FEATURE_FLAGS.cutModeV1
      ? buildCoachInterventionCards({
          checkIn: currentCheckIn,
          strengthRetention: workouts.snapshot.strengthRetention,
          readiness: recoveryReadiness,
        })
      : currentCheckIn.weeklyCheckInPacket.interventions
    const moduleSettings = settings.coachModuleSettings ?? {}
    const moduleOutputs = (['partial_logging', 'fasting', 'logging_break', 'program_update'] as const).map((kind) => ({
      kind,
      enabled: moduleSettings[kind]?.enabled ?? true,
      summary:
        kind === 'partial_logging'
          ? 'Partial logging is evaluated before a weekly adjustment is shown.'
          : kind === 'fasting'
            ? 'Fasting days remain eligible and are carried through the packet evidence.'
            : kind === 'logging_break'
              ? 'Logging breaks are surfaced as an explicit coaching confounder.'
              : 'Program updates stay attached to the current packet as an auditable module.',
    }))
    const datesInWindow = enumerateDateKeys(currentCheckIn.weekStartDate, currentCheckIn.weekEndDate)
    const statusesInWindow = datesInWindow.map((date) => ({
      date,
      status: dayMeta.find((entry) => entry.date === date)?.status,
      loggedEntryCount: (allFoodLogs[date] ?? []).filter((entry) => !entry.deletedAt).length,
    }))
    const unresolvedModuleCandidates = [
      moduleSettings.partial_logging?.enabled !== false &&
      statusesInWindow.some((entry) => entry.status === 'partial')
        ? {
            kind: 'partial_logging' as const,
            title: 'Partial logging needs review',
            unresolved: true,
            reason: 'At least one day in this check-in window is still marked partial.',
          }
        : null,
      moduleSettings.fasting?.enabled !== false &&
      statusesInWindow.some((entry) => entry.status === 'fasting')
        ? {
            kind: 'fasting' as const,
            title: 'Fasting days remain unresolved',
            unresolved: true,
            reason: 'This window includes fasting days that Standard Check-In can review in detail.',
          }
        : null,
      moduleSettings.logging_break?.enabled !== false &&
      statusesInWindow.some((entry) => !entry.status && entry.loggedEntryCount === 0)
        ? {
            kind: 'logging_break' as const,
            title: 'Logging-break signal detected',
            unresolved: true,
            reason: 'One or more days in this window have no intake state and no logged entries.',
          }
        : null,
      moduleSettings.program_update?.enabled !== false &&
      (workouts.snapshot.strengthRetention.anchorLiftTrend === 'down' ||
        workouts.snapshot.strengthRetention.volumeFloorStatus !== 'met')
        ? {
            kind: 'program_update' as const,
            title: 'Program update may be needed',
            unresolved: true,
            reason: 'Strength or volume-floor signals suggest Standard Check-In should review the program context.',
          }
        : null,
    ].filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

    return {
      ...currentCheckIn,
      weeklyCheckInPacket: {
        ...currentCheckIn.weeklyCheckInPacket,
        interventions,
        moduleOutputs,
        fastCheckInEquivalent: settings.fastCheckInPreference?.enabled ?? true,
        unresolvedModuleCandidates,
      },
    }
  }, [allFoodLogs, currentCheckIn, dayMeta, recoveryReadiness, settings.coachModuleSettings, settings.fastCheckInPreference?.enabled, workouts.snapshot.strengthRetention])
  const visibleCheckInHistory = FEATURE_FLAGS.weeklyDecisionCard ? checkInHistory : []
  const visibleCoachingDecisionHistory = FEATURE_FLAGS.weeklyDecisionCard
    ? coachingDecisionHistory
    : []
  const visibleCanApplyCheckInTargets =
    FEATURE_FLAGS.weeklyDecisionCard && canApplyCheckInTargets

  const selectedDayStatus = getDayStatus(selectedDate)
  const selectedDayMeta = getDayMeta(selectedDate)
  const selectedDateActivity = getActivityEntry(selectedDate)
  const selectedDateInterventions = getInterventionsForDate(selectedDate)
  const visibleSavedMeals = useMemo(
    () => (FEATURE_FLAGS.savedMeals ? templates.filter((template) => !template.archivedAt) : []),
    [templates],
  )
  const visibleFavorites = useMemo(
    () => (FEATURE_FLAGS.favoriteFoods ? favorites : []),
    [favorites],
  )
  const visibleRecipes = useMemo(
    () => (FEATURE_FLAGS.recipes ? recipes : []),
    [recipes],
  )

  useEffect(() => {
    if (!FEATURE_FLAGS.foodTruthV2) {
      return
    }

    const reconciliation = reconcileFoodReviewQueue({
      foods,
      logsByDate: allFoodLogs,
      queue: loadFoodReviewQueue(),
    })

    if (!reconciliation.changedDates.length && reconciliation.createdReviewItemIds.length === 0 && reconciliation.resolvedReviewItemIds.length === 0) {
      return
    }

    let saveFailed = false

    for (const date of reconciliation.changedDates) {
      const nextEntries = reconciliation.logsByDate[date]
      const result = saveFoodLog(date, nextEntries ?? [])
      if (!result.ok) {
        saveFailed = true
        reportError(result.error)
        break
      }
    }

    if (saveFailed) {
      return
    }

    const queueResult = saveFoodReviewQueue(reconciliation.queue)
    if (!queueResult.ok) {
      void recordDiagnosticsEvent({
        eventType: 'food_truth_v2_review_item_creation_failed',
        severity: 'warning',
        scope: 'diagnostics',
        message: 'Unable to persist the food review queue after orphaned-entry reconciliation.',
        payload: {
          createdReviewItemIds: reconciliation.createdReviewItemIds,
        },
      })
      reportError(queueResult.error)
      return
    }

    if (reconciliation.createdReviewItemIds.length > 0) {
      void recordDiagnosticsEvent({
        eventType: 'food_truth_v2_orphaned_entry_queued',
        severity: 'info',
        scope: 'diagnostics',
        message: 'One or more orphaned food log entries were queued for review.',
        payload: {
          createdReviewItemIds: reconciliation.createdReviewItemIds,
          changedDates: reconciliation.changedDates,
        },
      })
    }

    reportError(null)
  }, [allFoodLogs, foods, reportError])

  const previewPsmfGarminUiOverride = readPreviewPsmfGarminUiState()
  const activePsmfPhase = useMemo(
    () =>
      normalizedDietPhases.find((phase) => phase.type === 'psmf' && phase.status === 'active') ??
      null,
    [normalizedDietPhases],
  )
  const activeDietBreakPhase = useMemo(
    () =>
      normalizedDietPhases.find((phase) => phase.type === 'diet_break' && phase.status === 'active') ??
      null,
    [normalizedDietPhases],
  )
  const activeCarbCyclePhase = useMemo(
    () =>
      normalizedDietPhases.find((phase) => phase.type === 'carb_cycle' && phase.status === 'active') ??
      null,
    [normalizedDietPhases],
  )
  const expiredPsmfPhase = useMemo(
    () =>
      sortHistoricalPhases(
        normalizedDietPhases.filter((phase) => phase.type === 'psmf' && phase.status === 'expired'),
      )[0] ??
      null,
    [normalizedDietPhases],
  )
  const plannedPhases = useMemo(
    () =>
      [...normalizedDietPhases]
        .filter((phase) => phase.status === 'planned')
        .sort((left, right) => left.startDate.localeCompare(right.startDate)),
    [normalizedDietPhases],
  )
  const historicalPhases = useMemo(
    () =>
      sortHistoricalPhases(
        normalizedDietPhases.filter(
          (phase) => phase.status === 'completed' || phase.status === 'cancelled',
        ),
      ),
    [normalizedDietPhases],
  )
  const selectablePsmfPhases = useMemo(
    () =>
      sortSelectablePsmfPhases(
        normalizedDietPhases.filter(
          (phase) => phase.type === 'psmf' && phase.status !== 'cancelled',
        ),
      ),
    [normalizedDietPhases],
  )
  const refeedsByPhaseId = useMemo(() => {
    const grouped: Record<string, DietPhaseEvent[]> = {}

    for (const event of dietPhaseEvents) {
      if (event.deletedAt) {
        continue
      }

      grouped[event.phaseId] ??= []
      grouped[event.phaseId].push(event)
    }

    for (const phaseId of Object.keys(grouped)) {
      grouped[phaseId] = [...grouped[phaseId]].sort((left, right) => left.date.localeCompare(right.date))
    }

    return grouped
  }, [dietPhaseEvents])
  const [selectedPsmfPhaseId, setSelectedPsmfPhaseId] = useState<string | null>(() =>
    getDefaultPsmfPhaseSelection(selectablePsmfPhases),
  )
  useEffect(() => {
    setSelectedPsmfPhaseId((currentSelection) =>
      resolveSelectedPsmfPhaseId(selectablePsmfPhases, currentSelection),
    )
  }, [selectablePsmfPhases])
  const selectedPsmfPhase = useMemo(
    () => selectablePsmfPhases.find((phase) => phase.id === selectedPsmfPhaseId) ?? null,
    [selectablePsmfPhases, selectedPsmfPhaseId],
  )
  const selectedPsmfPhaseRefeeds = useMemo(
    () => (selectedPsmfPhase ? refeedsByPhaseId[selectedPsmfPhase.id] ?? [] : []),
    [refeedsByPhaseId, selectedPsmfPhase],
  )
  const activeCarbCycleHighCarbDays = useMemo(
    () =>
      activeCarbCyclePhase
        ? (refeedsByPhaseId[activeCarbCyclePhase.id] ?? []).filter((event) => event.type === 'high_carb_day')
        : [],
    [activeCarbCyclePhase, refeedsByPhaseId],
  )
  const currentWindowRefeeds = useMemo(
    () =>
      visibleCurrentCheckIn
        ? dietPhaseEvents
            .filter(
              (event) =>
                !event.deletedAt &&
                event.date >= visibleCurrentCheckIn.weekStartDate &&
                event.date <= visibleCurrentCheckIn.weekEndDate,
            )
            .sort((left, right) => left.date.localeCompare(right.date))
        : [],
    [dietPhaseEvents, visibleCurrentCheckIn],
  )
  const todayRecoveryCheckIn = getRecoveryCheckInEntry(todayDateKey)
  const runtimeAssessment = useMemo(
    () => {
      const today = getTodayDateKey()
      return (
      evaluateCoachRuntimeState(
        coachRuntime,
        {
          goalMode: settings.goalMode,
          fatLossMode: settings.fatLossMode ?? 'standard_cut',
        },
        visibleCurrentCheckIn?.weekEndDate ?? today,
      )
      )
    },
    [coachRuntime, settings.fatLossMode, settings.goalMode, visibleCurrentCheckIn?.weekEndDate],
  )
  const derivedPsmfGarminUiState: PreviewPsmfGarminUiState | null = (() => {
    const supplementalLines: string[] = []
    const blockedReasonLabels = new Set<string>()

    if (activePsmfPhase) {
      supplementalLines.push(`PSMF active until ${formatDateLabel(activePsmfPhase.plannedEndDate)}`)
    }
    if (activeDietBreakPhase) {
      supplementalLines.push(`Diet break active until ${formatDateLabel(activeDietBreakPhase.plannedEndDate)}`)
    }

    for (const refeed of currentWindowRefeeds) {
      supplementalLines.push(`Planned refeed on ${formatDateLabel(refeed.date)}`)
    }

    if (visibleCurrentCheckIn?.reasonCodes?.includes('recovery_watch')) {
      supplementalLines.push('Recovery strain is elevated this week.')
    }

    for (const blockedReason of visibleCurrentCheckIn?.blockedReasons ?? []) {
      const label = mapBlockedReasonLabel(blockedReason.code)
      if (label) {
        blockedReasonLabels.add(label)
      }
    }

    if (FEATURE_FLAGS.garminConnectV1 && visibleCurrentCheckIn) {
      const windowStart = visibleCurrentCheckIn.weekStartDate
      const windowEnd = visibleCurrentCheckIn.weekEndDate
      const windowWellnessEntries = wellnessEntries.filter(
        (entry) => entry.date >= windowStart && entry.date <= windowEnd && !entry.deletedAt,
      )
      const localActivityDates = new Set(
        allActivityLog
          .filter(
            (entry) =>
              entry.date >= windowStart &&
              entry.date <= windowEnd &&
              !entry.deletedAt &&
              (typeof entry.steps === 'number' || typeof entry.cardioMinutes === 'number'),
          )
          .map((entry) => entry.date),
      )
      const garminFallbackDays = windowWellnessEntries.filter(
        (entry) =>
          !localActivityDates.has(entry.date) &&
          (typeof entry.steps === 'number' || typeof entry.derivedCardioMinutes === 'number'),
      ).length

      if (windowWellnessEntries.length > 0) {
        supplementalLines.push(
          `Garmin supplied wellness context on ${windowWellnessEntries.length} of 7 check-in days.`,
        )
      }

      if (garminFallbackDays > 0) {
        supplementalLines.push(
          `Garmin filled steps or cardio context on ${garminFallbackDays} day${garminFallbackDays === 1 ? '' : 's'} without local activity logs.`,
        )
      }
    }

    const dietPhase: PreviewPsmfGarminUiState['dietPhase'] =
      FEATURE_FLAGS.psmfPhaseV2 && settings.goalMode === 'lose'
        ? activeDietBreakPhase
          ? {
              kind: 'diet_break_active' as const,
              activeUntilLabel: formatDateLabel(activeDietBreakPhase.plannedEndDate),
            }
          : activePsmfPhase
            ? {
                kind: 'active_psmf' as const,
                activeUntilLabel: formatDateLabel(activePsmfPhase.plannedEndDate),
              }
            : expiredPsmfPhase
              ? {
                  kind: 'expired_psmf' as const,
                  expiredOnLabel: formatDateLabel(expiredPsmfPhase.plannedEndDate),
                }
              : {
                  kind: 'no_active_phase' as const,
                }
        : undefined

    const recovery: PreviewPsmfGarminUiState['recovery'] =
      FEATURE_FLAGS.recoveryLayerV1 || FEATURE_FLAGS.recoveryHybridGates
        ? {
            severity: runtimeAssessment.recovery.latestSeverity ?? 'green',
          }
        : undefined

    const garminKind: NonNullable<PreviewPsmfGarminUiState['garmin']>['kind'] =
      !garmin.availability.providerConfigured ||
      !garmin.availability.persistentStoreConfigured ||
      !garmin.availability.backgroundAutomationEnabled
        ? 'not_enabled'
        : garmin.connection.status === 'connected' ||
            garmin.connection.status === 'syncing' ||
            garmin.connection.status === 'rate_limited' ||
            garmin.connection.status === 'reconnect_required' ||
            garmin.connection.status === 'error'
          ? garmin.connection.status
          : 'not_connected'
    const garminState: PreviewPsmfGarminUiState['garmin'] =
      FEATURE_FLAGS.garminConnectV1
        ? {
            kind: garminKind,
            lastSyncedLabel: formatDateTimeLabel(garmin.connection.lastSuccessfulSyncAt),
            rateLimitedUntilLabel: formatDateTimeLabel(garmin.connection.retryAfterAt),
            stale: isGarminSnapshotStale(garmin.connection.lastSuccessfulSyncAt),
          }
        : undefined

    if (!dietPhase && !recovery && !garminState && supplementalLines.length === 0) {
      return null
    }

    return {
      dietPhase,
      recovery,
      garmin: garminState,
      weight:
        supplementalLines.length > 0 || blockedReasonLabels.size > 0
          ? {
              supplementalLines,
              blockedReasonLabels: [...blockedReasonLabels],
            }
          : undefined,
    }
  })()
  const previewPsmfGarminUiState = mergePreviewUiState(
    derivedPsmfGarminUiState,
    previewPsmfGarminUiOverride,
  )
  const selectedDateTotals = sumNutrition(
    entries.map((entry) => calculateFoodNutrition(entry.snapshot, entry.servings)),
  )
  const nutritionOverview = useMemo(
    () =>
      FEATURE_FLAGS.nutritionOverviewV1
        ? buildNutritionOverview({
            today: todayDateKey,
            logsByDate: allFoodLogs,
            dayMeta,
            foods,
            includeV2: FEATURE_FLAGS.nutritionOverviewV2,
            settings,
          })
        : null,
    [allFoodLogs, dayMeta, foods, settings, todayDateKey],
  )
  const garminSurface = useMemo(() => {
    const selectedHistoryWindow = settings.garminHistoryWindow ?? '7d'
    const buildWindowSummary = (window: '7d' | '30d' | '90d') => {
      const offset = window === '7d' ? -6 : window === '30d' ? -29 : -89
      const windowStart = addDays(todayDateKey, offset)
      const modifiers = garminModifierRecords.filter((record) => record.date >= windowStart && record.date <= todayDateKey)
      const workoutsInWindow = garminWorkoutSummaries.filter((record) => record.date >= windowStart && record.date <= todayDateKey)
      const sleepValues = modifiers
        .map((record) => record.sleepMinutes)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      const rhrValues = modifiers
        .map((record) => record.restingHeartRate)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

      return {
        window,
        modifierDayCount: modifiers.length,
        workoutSummaryCount: workoutsInWindow.length,
        averageSleepMinutes: sleepValues.length
          ? sleepValues.reduce((sum, value) => sum + value, 0) / sleepValues.length
          : undefined,
        averageRestingHeartRate: rhrValues.length
          ? rhrValues.reduce((sum, value) => sum + value, 0) / rhrValues.length
          : undefined,
        totalSteps: modifiers.reduce((sum, record) => sum + (record.steps ?? 0), 0),
        totalActiveCalories: modifiers.reduce((sum, record) => sum + (record.activeCalories ?? 0), 0),
      }
    }

    if (!FEATURE_FLAGS.garminIntelligenceV2) {
      return {
        importedWeightCount: 0,
        ignoredConflictCount: 0,
        modifierDayCount7d: 0,
        workoutSummaryCount7d: 0,
        readiness: recoveryReadiness,
        historyWindow: selectedHistoryWindow,
        history: [],
        visibleConflictDates: [],
        syncStatus: garmin.connection.status,
      }
    }

    const history = [buildWindowSummary('7d'), buildWindowSummary('30d'), buildWindowSummary('90d')]
    const currentWindow = history.find((entry) => entry.window === selectedHistoryWindow) ?? history[0]

    return {
      importedWeightCount: garminImportedWeights.length,
      ignoredConflictCount: garminImportedWeights.filter((record) => record.state === 'ignored_conflict').length,
      modifierDayCount7d: history[0]?.modifierDayCount ?? 0,
      workoutSummaryCount7d: history[0]?.workoutSummaryCount ?? 0,
      latestImportedWeightDate: garminImportedWeights[0]?.date,
      averageSleepMinutes7d: currentWindow?.averageSleepMinutes,
      averageRestingHeartRate7d: currentWindow?.averageRestingHeartRate,
      totalSteps7d: currentWindow?.totalSteps,
      totalActiveCalories7d: currentWindow?.totalActiveCalories,
      readiness: recoveryReadiness,
      historyWindow: selectedHistoryWindow,
      history,
      visibleConflictDates: garminImportedWeights
        .filter((record) => record.state === 'ignored_conflict')
        .map((record) => record.date),
      syncStatus: garmin.connection.status,
    }
  }, [
    garmin.connection.status,
    garminImportedWeights,
    garminModifierRecords,
    garminWorkoutSummaries,
    recoveryReadiness,
    settings.garminHistoryWindow,
    todayDateKey,
  ])
  const cutCockpit = useMemo(
    () =>
      FEATURE_FLAGS.cutModeV1
        ? buildCutCockpitSnapshot({
            nutritionOverview,
            readiness: recoveryReadiness,
            strengthRetention: workouts.snapshot.strengthRetention,
            weeklyIntervention: visibleCurrentCheckIn?.weeklyCheckInPacket?.interventions?.[0],
            bodyProgressSnapshots:
              FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1
                ? bodyProgress.snapshots
                : [],
          })
        : null,
    [
      bodyProgress.snapshots,
      nutritionOverview,
      recoveryReadiness,
      visibleCurrentCheckIn?.weeklyCheckInPacket?.interventions,
      workouts.snapshot.strengthRetention,
    ],
  )
  const latestBenchmarkReport = benchmarkReports[0] ?? null
  const claimSnapshot = useMemo(
    () =>
      FEATURE_FLAGS.claimGateV1
        ? buildCoreClaimSnapshot({
            allCriticalReleasesGa:
              FEATURE_FLAGS.fastCheckInV1 &&
              FEATURE_FLAGS.nutritionCatalogV3 &&
              FEATURE_FLAGS.nutrientGoalsV1 &&
              FEATURE_FLAGS.loggingShortcutsV1 &&
              FEATURE_FLAGS.workoutsAnalyticsV2 &&
              FEATURE_FLAGS.workoutRecordsV1 &&
              FEATURE_FLAGS.bodyMetricVisibilityV1 &&
              FEATURE_FLAGS.bodyProgressCompareV1 &&
              FEATURE_FLAGS.bodyProgressGalleryV2 &&
              FEATURE_FLAGS.dashboardInsightsV2 &&
              FEATURE_FLAGS.recoveryPacksV1,
            readiness: {
              fastCheckInSurfaceReady:
                FEATURE_FLAGS.fastCheckInV1 &&
                (settings.fastCheckInPreference?.enabled ?? true) &&
                Boolean(settings.fastCheckInPreference?.surfaceEntryPoint ?? 'dashboard'),
              nutritionDepthReady:
                FEATURE_FLAGS.nutritionCatalogV3 &&
                FEATURE_FLAGS.nutrientGoalsV1 &&
                (nutritionOverview?.supportedNutrients.length ?? 0) >= 50,
              loggingSurfaceReady:
                FEATURE_FLAGS.loggingShortcutsV1 &&
                Boolean(settings.loggingShortcutPreference?.toolbarStyle) &&
                Boolean(settings.loggingShortcutPreference?.topShortcutId),
              workoutsAnalyticsDepthReady:
                FEATURE_FLAGS.workoutsAnalyticsV2 &&
                FEATURE_FLAGS.workoutRecordsV1 &&
                Array.isArray(workouts.snapshot.weeklyTargetsProgress) &&
                Array.isArray(workouts.snapshot.recentRecords),
              bodyProgressSurfaceReady:
                FEATURE_FLAGS.bodyMetricVisibilityV1 &&
                FEATURE_FLAGS.bodyProgressCompareV1 &&
                FEATURE_FLAGS.bodyProgressGalleryV2,
              dashboardClaimReady:
                FEATURE_FLAGS.dashboardInsightsV2 &&
                Boolean(settings.dashboardLayout) &&
                Boolean(settings.dashboardInsights?.length),
              recoverableGapClosureData: FEATURE_FLAGS.recoveryPacksV1,
            },
            scenarios: latestBenchmarkReport?.scenarios ?? [],
            reportId: latestBenchmarkReport?.id,
            latestBenchmarkCreatedAt: latestBenchmarkReport?.createdAt,
          })
        : null,
    [
      latestBenchmarkReport?.createdAt,
      latestBenchmarkReport?.id,
      latestBenchmarkReport?.scenarios,
      nutritionOverview?.supportedNutrients.length,
      settings.dashboardInsights,
      settings.dashboardLayout,
      settings.fastCheckInPreference?.enabled,
      settings.fastCheckInPreference?.surfaceEntryPoint,
      settings.loggingShortcutPreference?.toolbarStyle,
      settings.loggingShortcutPreference?.topShortcutId,
      workouts.snapshot.recentRecords,
      workouts.snapshot.weeklyTargetsProgress,
    ],
  )
  const recommendationDismissed = settings.coachingDismissedAt?.slice(0, 10) === selectedDate
  const hasGlobalRecoveryBanner = Boolean(initializationError || recoveryIssues.length)

  useEffect(() => {
    if (
      (!FEATURE_FLAGS.dashboardV1 && activeTab === 'dashboard') ||
      (!FEATURE_FLAGS.workoutsV1 && activeTab === 'workouts')
    ) {
      setActiveTab('log')
    }
  }, [activeTab, setActiveTab])

  useEffect(() => {
    if (!autoSnapshotPrimedRef.current) {
      autoSnapshotPrimedRef.current = true
      return
    }

    void captureDailySnapshot()
  }, [allFoodLogs, captureDailySnapshot, foods, settings])

  const recentCombinations = useMemo(() => {
    const byMeal: Record<MealType, Array<{ sourceDate: string; entryCount: number }>> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    }
    const sortedDates = Object.keys(allLogsByDate)
      .filter((date) => date !== selectedDate)
      .sort((left, right) => right.localeCompare(left))

    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
      const seenDates: string[] = []
      for (const date of sortedDates) {
        const mealEntries = (allLogsByDate[date] ?? []).filter(
          (entry) => !entry.deletedAt && entry.meal === meal,
        )
        if (!mealEntries.length) {
          continue
        }

        byMeal[meal].push({
          sourceDate: date,
          entryCount: mealEntries.length,
        })
        seenDates.push(date)
        if (seenDates.length >= 3) {
          break
        }
      }
    }

    return byMeal
  }, [allLogsByDate, selectedDate])
  function scrollEntryIntoView(entryId: string, meal: MealType): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const stickyHeight =
          document.querySelector<HTMLElement>('[data-log-sticky="true"]')?.getBoundingClientRect().height ?? 220
        const entryRow = document.querySelector<HTMLElement>(`[data-entry-id="${entryId}"]`)
        if (entryRow) {
          const rect = entryRow.getBoundingClientRect()
          const targetTop = Math.max(0, window.scrollY + rect.top - stickyHeight - 24)
          window.scrollTo({ top: targetTop, behavior: 'auto' })
          return
        }

        const mealSection = document.querySelector<HTMLElement>(`[data-meal-section="${meal}"]`)
        if (mealSection) {
          const rect = mealSection.getBoundingClientRect()
          const targetTop = Math.max(0, window.scrollY + rect.top - stickyHeight - 24)
          window.scrollTo({ top: targetTop, behavior: 'auto' })
        }
      })
    })
  }

  function ensureEditableIntakeDay(onContinue: () => void): void {
    if (selectedDayStatus !== 'fasting') {
      onContinue()
      return
    }

    setConfirmState({
      title: 'Convert fasting day to partial?',
      description:
        'Adding intake will convert this fasting day to partial so coaching no longer treats it as a full fast.',
      confirmLabel: 'Convert and continue',
      onConfirm: () => {
        const result = setDayStatus(selectedDate, 'partial')
        if (!result.ok) {
          reportError(result.error)
          return
        }

        reportError(null)
        setConfirmState(null)
        onContinue()
      },
    })
  }

  const { undoQueue, dismissUndoItem, queueUndoAction, handleUndo } = useUndoQueue({
    onError: reportError,
  })

  const interventionController = useInterventionController({
    selectedDate,
    interventions,
    addIntervention,
    updateIntervention,
    deleteIntervention,
    restoreIntervention,
    reportError,
    queueUndoAction,
  })

  const foodEntryController = useFoodEntryController({
    entries,
    addEntry,
    addSnapshotEntry,
    replaceEntryFood,
    deleteEntry,
    restoreEntry,
    updateEntryServings,
    reportError,
    queueUndoAction,
    scrollEntryIntoView,
    ensureEditableIntakeDay,
  })
  const repeatCandidates = useMemo<RepeatMealCandidate[]>(() => {
    if (
      !FEATURE_FLAGS.personalLibraryV1 ||
      !foodEntryController.foodSheetContext ||
      foodEntryController.foodSheetContext.kind !== 'add'
    ) {
      return []
    }

    const targetMeal = foodEntryController.foodSheetContext.meal
    const activeFoodsById = new Map(
      foods.filter((food) => !food.archivedAt).map((food) => [food.id, food] as const),
    )
    const favoriteFoodIds = new Set(visibleFavorites.map((favorite) => favorite.foodId))
    const selectedDateValue = Date.parse(`${selectedDate}T00:00:00`)
    const thirtyDayCutoff = selectedDateValue - 30 * 24 * 60 * 60 * 1000
    const fourteenDayCutoff = selectedDateValue - 14 * 24 * 60 * 60 * 1000
    const candidates = new Map<
      string,
      {
        foodId: string
        foodName: string
        servings: number
        lastUsedAt?: string
        sameMealRecent: boolean
        usageCount: number
        hasLastServings: boolean
        favorite: boolean
      }
    >()

    for (const [date, dayEntries] of Object.entries(allLogsByDate)) {
      if (date === selectedDate) {
        continue
      }

      const dateValue = Date.parse(`${date}T00:00:00`)
      if (!Number.isFinite(dateValue) || dateValue < thirtyDayCutoff) {
        continue
      }

      for (const entry of dayEntries) {
        if (entry.deletedAt || !entry.foodId) {
          continue
        }

        const food = activeFoodsById.get(entry.foodId)
        if (!food) {
          continue
        }

        const servings =
          typeof entry.servings === 'number' && Number.isFinite(entry.servings) && entry.servings > 0
            ? entry.servings
            : food.lastServings ?? 1
        const current = candidates.get(food.id)
        const sameMealRecent = entry.meal === targetMeal && dateValue >= fourteenDayCutoff
        const favorite = favoriteFoodIds.has(food.id)

        candidates.set(food.id, {
          foodId: food.id,
          foodName: food.name,
          servings,
          lastUsedAt:
            !current?.lastUsedAt || date > current.lastUsedAt ? date : current.lastUsedAt,
          sameMealRecent: (current?.sameMealRecent ?? false) || sameMealRecent,
          usageCount: Math.max(current?.usageCount ?? 0, food.usageCount),
          hasLastServings:
            (current?.hasLastServings ?? false) ||
            (typeof servings === 'number' && Number.isFinite(servings) && servings > 0),
          favorite: (current?.favorite ?? false) || favorite,
        })
      }
    }

    return [...candidates.values()]
      .sort((left, right) => {
        if (left.sameMealRecent !== right.sameMealRecent) {
          return Number(right.sameMealRecent) - Number(left.sameMealRecent)
        }

        if ((left.lastUsedAt ?? '') !== (right.lastUsedAt ?? '')) {
          return (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '')
        }

        if (left.usageCount !== right.usageCount) {
          return right.usageCount - left.usageCount
        }

        if (left.hasLastServings !== right.hasLastServings) {
          return Number(right.hasLastServings) - Number(left.hasLastServings)
        }

        if (left.favorite !== right.favorite) {
          return Number(right.favorite) - Number(left.favorite)
        }

        return left.foodName.localeCompare(right.foodName)
      })
      .slice(0, 6)
  }, [allLogsByDate, foodEntryController.foodSheetContext, foods, selectedDate, visibleFavorites])
  const todayWorkoutActionOverride = useMemo(
    () =>
      [...(settings.workoutActionOverrides ?? [])]
        .filter((entry) => entry.date === todayDateKey)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null,
    [settings.workoutActionOverrides, todayDateKey],
  )
  const effectiveWorkoutSnapshot = useMemo(() => {
    if (!todayWorkoutActionOverride) {
      return workouts.snapshot
    }

    const computedActionCard = workouts.snapshot.actionCard
    const actionLabel =
      todayWorkoutActionOverride.action === 'back_off'
        ? 'Back off'
        : todayWorkoutActionOverride.action === 'hold'
          ? 'Hold'
          : todayWorkoutActionOverride.action === 'push'
            ? 'Push'
            : 'Stay neutral'
    const manualActionCard: WorkoutActionCard = {
      action: todayWorkoutActionOverride.action,
      title: 'Manual training override',
      summary: `${actionLabel} is locked in for today by manual override.`,
      reasons: [
        `Override saved for ${formatShortDate(todayWorkoutActionOverride.date)}.`,
        computedActionCard
          ? `Computed action was ${computedActionCard.action.replace('_', ' ')}.`
          : 'No computed action card was available.',
      ],
      source: 'manual_override',
      evaluatedAt: todayWorkoutActionOverride.updatedAt,
      readinessFresh: computedActionCard?.readinessFresh ?? false,
      confidence: computedActionCard?.confidence ?? 'medium',
      stalenessReason: computedActionCard?.stalenessReason,
      reasonOrder: ['readiness', 'anchor_lift', 'records', 'completion'],
      mode: computedActionCard?.mode ?? 'review_first',
      secondaryNote: 'Manual override is active until you clear it or the day rolls over.',
      primaryCta: 'Review today\'s training signals',
      fuelDirective: computedActionCard?.fuelDirective ?? 'Fuel to match the current cut day before you train.',
      volumeDirective: computedActionCard?.volumeDirective ?? 'Keep volume tight and protect performance.',
      preservationRisk: computedActionCard?.preservationRisk ?? 'medium',
      evidenceReasons:
        computedActionCard?.evidenceReasons ?? [
          'readiness_freshness',
          'anchor_lift_trend',
          'recent_records',
          'volume_floor',
          'completion_adherence',
        ],
      confidenceReason:
        computedActionCard?.confidenceReason ??
        'Manual override is active, so the computed card is shown as context only.',
      freshnessLabel: computedActionCard?.freshnessLabel ?? 'No readiness',
    }

    return {
      ...workouts.snapshot,
      actionCard: manualActionCard,
    }
  }, [todayWorkoutActionOverride, workouts.snapshot])
  const dashboardMeal = useMemo<MealType>(() => {
    const hour = new Date().getHours()
    if (hour < 11) {
      return 'breakfast'
    }
    if (hour < 16) {
      return 'lunch'
    }
    if (hour < 21) {
      return 'dinner'
    }
    return 'snack'
  }, [])
  const savedMealsForDashboardMeal = useMemo(
    () =>
      visibleSavedMeals.filter(
        (template) => !template.defaultMeal || template.defaultMeal === dashboardMeal,
      ),
    [dashboardMeal, visibleSavedMeals],
  )
  const selectedDatePhaseTemplateLane = useMemo(() => {
    if (
      !FEATURE_FLAGS.phaseTemplatesV1 ||
      !foodEntryController.foodSheetContext ||
      foodEntryController.foodSheetContext.kind !== 'add'
    ) {
      return null
    }

    const addContext = foodEntryController.foodSheetContext
    const templateForDay =
      settings.phaseMealTemplates?.find(
        (template) =>
          template.dayType === selectedDateCutDayPlan.dayType && !template.archivedAt,
      ) ?? null
    const acceptedTemplate =
      templateForDay && (templateForDay.seedReviewState ?? 'accepted') === 'accepted'
        ? templateForDay
        : null
    const mappedMeals = acceptedTemplate
      ? acceptedTemplate.meals
          .map((mapping) => {
            if (!mapping.savedMealId) {
              return null
            }
            const savedMeal =
              visibleSavedMeals.find((template) => template.id === mapping.savedMealId) ?? null
            if (!savedMeal) {
              return null
            }
            return {
              meal: mapping.meal,
              savedMealId: savedMeal.id,
              savedMealName: savedMeal.name,
            }
          })
          .filter(
            (mapping): mapping is { meal: MealType; savedMealId: string; savedMealName: string } =>
              mapping !== null,
          )
      : []

    if (acceptedTemplate && mappedMeals.length > 0) {
      const currentMeal = mappedMeals.find((mapping) => mapping.meal === addContext.meal)
      return {
        state: 'active' as const,
        templateId: acceptedTemplate.id,
        templateLabel: acceptedTemplate.label,
        dayTypeLabel: selectedDateCutDayPlan.macroIntentLabel,
        mealCount: mappedMeals.length,
        currentMeal,
        meals: mappedMeals,
      }
    }

    const suggestedSavedMeal =
      [...visibleSavedMeals]
        .filter((savedMeal) => savedMeal.defaultMeal === addContext.meal && !savedMeal.archivedAt)
        .sort((left, right) => {
          const usedCompare = (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '')
          if (usedCompare !== 0) {
            return usedCompare
          }
          return (right.usageCount ?? 0) - (left.usageCount ?? 0)
        })[0] ?? null
    const seedSource = suggestedSavedMeal
      ? `saved_meal:${suggestedSavedMeal.id}:${selectedDateCutDayPlan.dayType}:${addContext.meal}`
      : undefined
    const suggestionSuppressed =
      Boolean(seedSource) &&
      templateForDay?.seedReviewState === 'rejected' &&
      templateForDay.seedSource === seedSource

    if (suggestedSavedMeal && !suggestionSuppressed) {
      return {
        state: 'pending_review' as const,
        templateLabel: buildDefaultPhaseTemplateLabel(selectedDateCutDayPlan.dayType),
        dayTypeLabel: selectedDateCutDayPlan.macroIntentLabel,
        mealCount: 1,
        meals: [],
        seedSource,
        seedSuggestion: {
          meal: addContext.meal,
          savedMealId: suggestedSavedMeal.id,
          savedMealName: suggestedSavedMeal.name,
        },
      }
    }

    return {
      state: 'empty' as const,
      templateLabel:
        templateForDay?.label ?? buildDefaultPhaseTemplateLabel(selectedDateCutDayPlan.dayType),
      dayTypeLabel: selectedDateCutDayPlan.macroIntentLabel,
      mealCount: 0,
      meals: [],
      secondaryHint: suggestionSuppressed
        ? 'That seed was dismissed. A new source will show here when your logging pattern changes.'
        : 'Choose a saved meal to make this cut day faster to log.',
    }
  }, [
    foodEntryController.foodSheetContext,
    selectedDateCutDayPlan.macroIntentLabel,
    selectedDateCutDayPlan.dayType,
    settings.phaseMealTemplates,
    visibleSavedMeals,
  ])
  const dashboardPhaseTemplateRecommendation = useMemo<RepeatLogRecommendation | null>(() => {
    if (!FEATURE_FLAGS.phaseTemplatesV1 || !todayCutDayPlan.templateId) {
      return null
    }

    const template =
      settings.phaseMealTemplates?.find(
        (entry) =>
          entry.id === todayCutDayPlan.templateId &&
          !entry.archivedAt &&
          (entry.seedReviewState ?? 'accepted') === 'accepted',
      ) ?? null
    if (!template) {
      return null
    }

    const mappedMeals = template.meals.filter((entry) => entry.savedMealId)
    if (mappedMeals.length === 0) {
      return null
    }

    const hasCurrentMealTemplate = mappedMeals.some((entry) => entry.meal === dashboardMeal)
    return {
      meal: dashboardMeal,
      label: template.label,
      count: mappedMeals.length,
      source: 'saved_meal',
      entryContext: 'meal_slot',
      autocommitAction: 'saved_meal_review',
      preserveQueryOnBatchAdd: true,
      templateId: template.id,
      templateLabel: template.label,
      batchAction:
        mappedMeals.length > 1
          ? 'fill_day'
          : hasCurrentMealTemplate
            ? 'fill_meal'
            : 'fill_day',
    }
  }, [dashboardMeal, settings.phaseMealTemplates, todayCutDayPlan.templateId])
  const morningBodyProgress = useMemo<BodyProgressQuickCompare | undefined>(() => {
    const latestSnapshot =
      FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1
        ? bodyProgress.snapshots[0] ?? null
        : null
    if (!latestSnapshot) {
      return undefined
    }

    const preset =
      settings.bodyProgressFocusState?.comparePreset === 'same_day' ||
      settings.bodyProgressFocusState?.comparePreset === '7d' ||
      settings.bodyProgressFocusState?.comparePreset === '30d'
        ? settings.bodyProgressFocusState.comparePreset
        : '7d'
    const pose = settings.bodyProgressFocusState?.lastSelectedPose ?? 'front'
    const compareSnapshot =
      preset === 'same_day'
        ? latestSnapshot
        : bodyProgress.snapshots.find((snapshot) =>
            snapshot.date <= addDays(latestSnapshot.date, preset === '7d' ? -7 : -30),
          ) ?? null
    const latestSnapshotCutDayPlan = buildCutDayPlan({
      date: latestSnapshot.date,
      phases: normalizedDietPhases,
      phaseEvents: dietPhaseEvents,
      phaseMealTemplates: settings.phaseMealTemplates,
    })
    return (
      buildBodyProgressQuickCompare({
        latestSnapshot,
        compareSnapshot,
        pose,
        preset,
        compareMode: settings.bodyProgressFocusState?.compareMode ?? 'side_by_side',
        galleryMode: settings.bodyProgressFocusState?.galleryMode ?? 'latest_vs_compare',
        focusedMetricKey: settings.bodyProgressFocusState?.focusedMetricKey,
        scaleContext: buildScaleContextFromCutDayPlan(latestSnapshotCutDayPlan),
        weights,
      }) ?? undefined
    )
  }, [
    bodyProgress.snapshots,
    dietPhaseEvents,
    normalizedDietPhases,
    settings.bodyProgressFocusState,
    settings.phaseMealTemplates,
    weights,
  ])
  const morningPhoneSnapshot = useMemo<MorningPhoneSnapshot | null>(() => {
    const repeatLog: RepeatLogRecommendation | null =
      dashboardPhaseTemplateRecommendation
        ? dashboardPhaseTemplateRecommendation
        : savedMealsForDashboardMeal.length > 0
        ? {
            meal: dashboardMeal,
            label: `Saved ${dashboardMeal} meals`,
            count: savedMealsForDashboardMeal.length,
            source: 'saved_meal',
            entryContext: 'meal_slot',
            autocommitAction: 'saved_meal_review',
            preserveQueryOnBatchAdd: true,
            batchAction: 'none',
          }
        : visibleFavorites.length > 0
          ? {
              meal: dashboardMeal,
              label: 'Favorite foods',
              count: visibleFavorites.length,
              source: 'favorite',
              entryContext: 'meal_slot',
              autocommitAction: 'use_last_amount',
              preserveQueryOnBatchAdd: true,
              batchAction: 'none',
            }
          : null

    return buildMorningPhoneSnapshot({
      meal: dashboardMeal,
      repeatLog,
      workoutAction: effectiveWorkoutSnapshot.actionCard,
      bodyProgress: morningBodyProgress,
      cutDayPlan: todayCutDayPlan,
      reviewBlockedCount: foodReviewQueue.filter((item) => item.status === 'pending').length,
    })
  }, [
    dashboardPhaseTemplateRecommendation,
    dashboardMeal,
    effectiveWorkoutSnapshot.actionCard,
    foodReviewQueue,
    morningBodyProgress,
    savedMealsForDashboardMeal,
    todayCutDayPlan,
    visibleFavorites.length,
  ])

  const bulkApplyController = useBulkApplyController({
    selectedDate,
    selectedDayStatus,
    entries,
    templates,
    getEntriesForDate: loadFoodLog,
    saveEntriesForDate: saveFoodLog,
    saveEntries,
    setDayStatus,
    incrementTemplateUsage,
    deleteTemplate,
    restoreTemplate,
    reportError,
    queueUndoAction,
    scrollEntryIntoView,
  })

  useEffect(() => {
    return subscribeToStorage(() => {
      setLastStorageMutationAt(Date.now())
    })
  }, [])

  useEffect(() => {
    const markUserInteraction = () => {
      setHasUserInteracted(true)
    }

    window.addEventListener('pointerdown', markUserInteraction, true)
    window.addEventListener('keydown', markUserInteraction, true)
    window.addEventListener('input', markUserInteraction, true)

    return () => {
      window.removeEventListener('pointerdown', markUserInteraction, true)
      window.removeEventListener('keydown', markUserInteraction, true)
      window.removeEventListener('input', markUserInteraction, true)
    }
  }, [])

  const reloadSafetyBlocked = useMemo(
    () =>
      !bootHealthy ||
      confirmState !== null ||
      foodEntryController.foodSheetContext !== null ||
      foodEntryController.editingEntry !== null ||
      foodEntryController.quickAddOpen ||
      foodEntryController.copyPreviousOpen ||
      interventionController.interventionSheetOpen ||
      foodEntryController.saveTemplateMeal !== null ||
      foodEntryController.saveRecipeMeal !== null ||
      bulkApplyController.bulkApplyState !== null ||
      settingsEditorState?.open === true ||
      foodEntryController.foodSheetDirty ||
      foodEntryController.editSheetDirty ||
      foodEntryController.quickAddDirty ||
      foodEntryController.copyPreviousDirty ||
      interventionController.interventionSheetDirty ||
      foodEntryController.saveTemplateDirty ||
      foodEntryController.saveRecipeDirty ||
      settingsEditorState?.dirty === true ||
      sync.syncState.status === 'authenticating' ||
      sync.syncState.status === 'syncing' ||
      sync.syncState.status === 'bootstrapRequired',
    [
      bootHealthy,
      bulkApplyController.bulkApplyState,
      confirmState,
      foodEntryController.copyPreviousDirty,
      foodEntryController.copyPreviousOpen,
      foodEntryController.editSheetDirty,
      foodEntryController.editingEntry,
      foodEntryController.foodSheetContext,
      foodEntryController.foodSheetDirty,
      foodEntryController.quickAddDirty,
      foodEntryController.quickAddOpen,
      foodEntryController.saveRecipeDirty,
      foodEntryController.saveRecipeMeal,
      foodEntryController.saveTemplateDirty,
      foodEntryController.saveTemplateMeal,
      interventionController.interventionSheetDirty,
      interventionController.interventionSheetOpen,
      settingsEditorState?.dirty,
      settingsEditorState?.open,
      sync.syncState.status,
    ],
  )

  const pwaShell = usePwaShell({
    bootHealthy,
    reloadSafetyBlocked,
    lastStorageMutationAt,
    hasUserInteracted,
  })
  const visibleTabItems = useMemo(
    () =>
      TAB_ITEMS.filter((item) => {
        if (item.id === 'dashboard') {
          return FEATURE_FLAGS.dashboardV1
        }

        if (item.id === 'workouts') {
          return FEATURE_FLAGS.workoutsV1
        }

        return true
      }),
    [],
  )

  function closeLogSheets(): void {
    foodEntryController.closeLogSheets()
    interventionController.closeInterventionSheet()
    bulkApplyController.closeBulkApply()
  }

  function openLogDate(date: string): void {
    setSelectedDate(date)
    setActiveTab('log')
  }

  function openDashboardQuickLog(meal: MealType): void {
    setSelectedDate(getTodayDateKey())
    setActiveTab('log')
    foodEntryController.openAddFood(meal, { entryContext: 'meal_slot' })
  }

  function openDashboardCaptureConvenience(source: CaptureConvenienceSource): void {
    setSelectedDate(getTodayDateKey())
    setActiveTab('log')
    foodEntryController.openAddFood(dashboardMeal, {
      entryContext: 'global_add',
      captureSource: source,
    })
  }

  function handleDismissReviewItem(reviewItemId: string): void {
    const result = dismissFoodReviewItem(reviewItemId)
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function guardedTabChange(nextTab: TabId): void {
    requestTabChange(nextTab, {
      foodSheet: {
        open: foodEntryController.foodSheetContext !== null,
        dirty: foodEntryController.foodSheetDirty,
        discard: foodEntryController.closeFoodSheet,
      },
      editEntry: {
        open: foodEntryController.editingEntry !== null,
        dirty: foodEntryController.editSheetDirty,
        discard: foodEntryController.closeEditSheet,
      },
      quickAdd: {
        open: foodEntryController.quickAddOpen,
        dirty: foodEntryController.quickAddDirty,
        discard: foodEntryController.closeQuickAdd,
      },
      copyPrevious: {
        open: foodEntryController.copyPreviousOpen,
        dirty: foodEntryController.copyPreviousDirty,
        discard: foodEntryController.closeCopyPrevious,
      },
      intervention: {
        open: interventionController.interventionSheetOpen,
        dirty: interventionController.interventionSheetDirty,
        discard: interventionController.closeInterventionSheet,
      },
      saveTemplate: {
        open: foodEntryController.saveTemplateMeal !== null,
        dirty: foodEntryController.saveTemplateDirty,
        discard: foodEntryController.closeSaveTemplate,
      },
      saveRecipe: {
        open: foodEntryController.saveRecipeMeal !== null,
        dirty: foodEntryController.saveRecipeDirty,
        discard: foodEntryController.closeSaveRecipe,
      },
      bulkApply: {
        open: bulkApplyController.bulkApplyState !== null,
        close: bulkApplyController.closeBulkApply,
      },
      settingsEditorState,
      closeLogSheets,
    })
  }

  function openSettingsTab(): void {
    guardedTabChange('settings')
  }

  function resolvePhaseReviewIntent(record: NonNullable<typeof currentCheckIn>): PhaseReviewIntent | null {
    const nextEvent =
      [...dietPhaseEvents]
        .filter(
          (event) =>
            !event.deletedAt &&
            (event.type === 'refeed_day' || event.type === 'high_carb_day') &&
            event.date > record.weekEndDate &&
            event.date <= addDays(record.weekEndDate, 14),
        )
        .sort((left, right) => left.date.localeCompare(right.date))[0] ?? null

    if (!nextEvent) {
      return null
    }

    return {
      eventId: nextEvent.id,
      phaseId: nextEvent.phaseId,
      type: nextEvent.type,
      date: nextEvent.date,
    }
  }

  function handleChangeDayStatus(nextStatus: DayStatus): void {
    if (nextStatus === selectedDayStatus) {
      return
    }

    if (nextStatus === 'complete' && entries.length === 0) {
      reportError('A complete day needs logged intake. Use fasting for intentional zero-calorie days.')
      return
    }

    if (nextStatus === 'fasting' && entries.length > 0) {
      const previousEntries = [...entries]
      const previousStatus = selectedDayStatus
      setConfirmState({
        title: 'Clear intake and mark fasting?',
        description:
          'This will clear the current day’s food entries and mark the day as fasting. You can undo the entire change.',
        confirmLabel: 'Clear intake and mark fasting',
        onConfirm: () => {
          const clearResult = saveFoodLog(selectedDate, [])
          if (!clearResult.ok) {
            reportError(clearResult.error)
            return
          }

          const statusResult = setDayStatus(selectedDate, 'fasting')
          if (!statusResult.ok) {
            void saveFoodLog(selectedDate, previousEntries)
            reportError(statusResult.error)
            return
          }

          reportError(null)
          queueUndoAction({
            id: crypto.randomUUID(),
            title: 'Fasting day saved',
            description: `Cleared ${previousEntries.length} entr${previousEntries.length === 1 ? 'y' : 'ies'}`,
            actionLabel: 'Undo',
            undo: () => {
              const restoreLogResult = saveFoodLog(selectedDate, previousEntries)
              if (!restoreLogResult.ok) {
                return restoreLogResult
              }

              return setDayStatus(selectedDate, previousStatus)
            },
          })
          setConfirmState(null)
        },
      })
      return
    }

    const result = setDayStatus(selectedDate, nextStatus)
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleToggleDayMarker(marker: 'travel' | 'illness' | 'high_calorie_event'): void {
    const result = toggleDayMarker(selectedDate, marker)
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleDeleteWeight(date: string): ActionResult<void> {
    const entry = weights.find((currentWeight) => currentWeight.date === date)
    const result = deleteWeight(date)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    if (entry) {
      queueUndoAction({
        id: crypto.randomUUID(),
        title: 'Weight cleared',
        description: `${entry.weight} ${entry.unit} on ${entry.date}`,
        actionLabel: 'Undo',
        undo: () => saveWeight(entry.date, entry.weight, entry.unit),
      })
    }

    return result
  }

  function handleSaveActivity(draft: {
    steps?: number
    cardioMinutes?: number
    cardioType?: 'walk' | 'incline_treadmill' | 'bike' | 'run' | 'other'
    notes?: string
  }): ActionResult<void> {
    const result = saveActivityEntry(selectedDate, draft)
    if (!result.ok) {
      reportError(result.error)
      return result as ActionResult<void>
    }

    reportError(null)
    return { ok: true, data: undefined }
  }

  function handleDeleteActivity(): ActionResult<void> {
    const entry = selectedDateActivity
    const result = deleteActivityEntry(selectedDate)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    if (entry) {
      queueUndoAction({
        id: crypto.randomUUID(),
        title: 'Activity cleared',
        description: `${entry.date} activity`,
        actionLabel: 'Undo',
        undo: () => restoreActivityEntry(entry),
      })
    }

    return result
  }

  function handleArchiveFood(foodId: string): ActionResult<void> {
    const food = foods.find((currentFood) => currentFood.id === foodId)
    const result = archiveFood(foodId)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    if (food) {
      queueUndoAction({
        id: crypto.randomUUID(),
        title: 'Food archived',
        description: food.name,
        actionLabel: 'Undo',
        undo: () => restoreFood(food.id),
      })
    }

    return result
  }

  function handleRestoreFood(foodId: string): ActionResult<void> {
    const food = foods.find((currentFood) => currentFood.id === foodId)
    const result = restoreFood(foodId)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    if (food) {
      queueUndoAction({
        id: crypto.randomUUID(),
        title: 'Food restored',
        description: food.name,
        actionLabel: 'Undo',
        undo: () => archiveFood(food.id),
      })
    }

    return result
  }

  function handleSaveMealTemplate(name: string, meal: MealType, mealEntries: FoodLogEntry[]): ActionResult<void> {
    const result = createTemplate(name, meal, mealEntries)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    foodEntryController.closeSaveTemplate()
    return { ok: true, data: undefined }
  }

  function handleSaveRecipe(payload: {
    name: string
    entries: FoodLogEntry[]
    yieldServings: number
    yieldLabel?: string
    notes?: string
  }): ActionResult<void> {
    const missingLocalEntry = payload.entries.find(
      (entry) => !entry.foodId || !foods.some((food) => food.id === entry.foodId && !food.archivedAt),
    )
    if (missingLocalEntry) {
      const result: ActionResult<void> = {
        ok: false,
        error: {
          code: 'recipeMissingLocalFoods',
          message: 'Recipes can only be created from saved local foods. Replace quick adds, recipes, or imported-only items first.',
        },
      }
      reportError(result.error)
      return result
    }

    const recipeResult = createRecipe({
      name: payload.name,
      foods: payload.entries.flatMap((entry) => {
        const sourceFood = foods.find((food) => food.id === entry.foodId)
        return sourceFood ? [{ food: sourceFood, servings: entry.servings }] : []
      }),
      yieldServings: payload.yieldServings,
      yieldLabel: payload.yieldLabel,
      notes: payload.notes,
    })
    if (!recipeResult.ok) {
      reportError(recipeResult.error)
      return recipeResult as ActionResult<void>
    }

    reportError(null)
    foodEntryController.closeSaveRecipe()
    return { ok: true, data: undefined }
  }

  function buildSelectedDateTimestamp(): string {
    return `${selectedDate}T12:00:00.000Z`
  }

  function handleApplyCoachingRecommendation(): void {
    if (coachingInsight.recommendedCalories === null) {
      return
    }

    const result = updateSettings({
      ...settings,
      calorieTarget: coachingInsight.recommendedCalories,
      tdeeEstimate: coachingInsight.estimatedTdee ?? settings.tdeeEstimate,
      coachingDismissedAt: buildSelectedDateTimestamp(),
    })
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleKeepCurrentTarget(): void {
    const result = updateSettings({
      ...settings,
      tdeeEstimate: coachingInsight.estimatedTdee ?? settings.tdeeEstimate,
      coachingDismissedAt: buildSelectedDateTimestamp(),
    })
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleApplyCheckInSuggestion(): void {
    if (!currentCheckIn) {
      return
    }

    if (
      currentCheckIn.decisionType === 'increase_steps' &&
      typeof currentCheckIn.recommendedStepTarget === 'number'
    ) {
      const settingsResult = updateSettings({
        ...settings,
        dailyStepTarget: currentCheckIn.recommendedStepTarget,
      })
      if (!settingsResult.ok) {
        reportError(settingsResult.error)
        return
      }

      const historyResult = markApplied()
      if (!historyResult.ok) {
        void updateSettings(settings)
        reportError(historyResult.error)
        return
      }

      void recordDiagnosticsEvent({
        eventType: 'cut_intel_v1.step_apply_succeeded',
        severity: 'info',
        scope: 'diagnostics',
        recordKey: currentCheckIn.decisionRecordId,
        message: `Applied adaptive step target for ${currentCheckIn.weekEndDate}.`,
        payload: {
          decisionRecordId: currentCheckIn.decisionRecordId,
          decisionType: currentCheckIn.decisionType,
          recommendedStepTarget: currentCheckIn.recommendedStepTarget,
        },
      })

      reportError(null)
      return
    }

    if (currentCheckIn.decisionType === 'review_phase_structure') {
      const intent = resolvePhaseReviewIntent(currentCheckIn)
      if (!intent) {
        reportError('No upcoming refeed or high-carb day is available to review in the next 14 days.')
        return
      }

      setPhaseReviewIntent(intent)
      guardedTabChange('settings')
      const historyResult = markApplied()
      if (!historyResult.ok) {
        reportError(historyResult.error)
        return
      }

      void recordDiagnosticsEvent({
        eventType: 'cut_intel_v1.phase_review_opened',
        severity: 'info',
        scope: 'diagnostics',
        recordKey: currentCheckIn.decisionRecordId,
        message: `Opened phase review for ${currentCheckIn.weekEndDate}.`,
        payload: {
          decisionRecordId: currentCheckIn.decisionRecordId,
          phaseReviewIntent: intent,
        },
      })

      reportError(null)
      return
    }

    if (
      currentCheckIn.recommendedCalorieTarget === undefined ||
      !currentCheckIn.recommendedMacroTargets
    ) {
      return
    }

    const settingsResult = updateSettings({
      ...settings,
      calorieTarget: currentCheckIn.recommendedCalorieTarget,
      proteinTarget: currentCheckIn.recommendedMacroTargets.protein,
      carbTarget: currentCheckIn.recommendedMacroTargets.carbs,
      fatTarget: currentCheckIn.recommendedMacroTargets.fat,
    })
    if (!settingsResult.ok) {
      reportError(settingsResult.error)
      return
    }

    const historyResult = markApplied()
    if (!historyResult.ok) {
      void updateSettings(settings)
      reportError(historyResult.error)
      return
    }

    void recordDiagnosticsEvent({
      eventType: 'coaching_decision_applied',
      severity: 'info',
      scope: 'diagnostics',
      recordKey: currentCheckIn.decisionRecordId,
      message: `Applied weekly coaching decision for ${currentCheckIn.weekEndDate}.`,
      payload: {
        decisionRecordId: currentCheckIn.decisionRecordId,
        decisionType: currentCheckIn.decisionType,
        recommendedCalorieTarget: currentCheckIn.recommendedCalorieTarget,
      },
    })

    reportError(null)
  }

  function handleKeepCurrentCheckIn(): void {
    const result = markKept()
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleDeferCutReview(): void {
    const result = markDeferred()
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function summarizeFastCheckInRecommendation(checkIn: NonNullable<typeof visibleCurrentCheckIn>): string {
    if (typeof checkIn.recommendedStepTarget === 'number') {
      return `${checkIn.recommendationReason} (${Math.round(checkIn.recommendedStepTarget)} steps/day target)`
    }

    if (typeof checkIn.recommendedCalorieDelta === 'number' && checkIn.recommendedCalorieDelta !== 0) {
      return `${checkIn.recommendationReason} (${Math.round(checkIn.recommendedCalorieDelta)} kcal/day delta)`
    }

    if (typeof checkIn.recommendedCalorieTarget === 'number') {
      return `${checkIn.recommendationReason} (${Math.round(checkIn.recommendedCalorieTarget)} kcal/day target)`
    }

    return checkIn.recommendationReason
  }

  function handleRunFastCheckIn(surface: 'dashboard' | 'coach'): void {
    if (!FEATURE_FLAGS.fastCheckInV1 || !visibleCurrentCheckIn) {
      return
    }

    const result = updateSettings({
      ...settings,
      lastFastCheckInRun: {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        checkInId: visibleCurrentCheckIn.id,
        surface,
        decisionType: visibleCurrentCheckIn.decisionType ?? 'keep_targets',
        recommendationSummary: summarizeFastCheckInRecommendation(visibleCurrentCheckIn),
        unresolvedModules:
          visibleCurrentCheckIn.weeklyCheckInPacket?.unresolvedModuleCandidates ?? [],
      },
    })
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleManualSettingsUpdate(
    nextSettings: typeof settings,
    options?: { reasonCode?: CoachingReasonCode | LegacyCoachingCode; effectiveDate?: string },
  ): ActionResult<void> {
    const targetsChanged =
      settings.calorieTarget !== nextSettings.calorieTarget ||
      settings.proteinTarget !== nextSettings.proteinTarget ||
      settings.carbTarget !== nextSettings.carbTarget ||
      settings.fatTarget !== nextSettings.fatTarget ||
      settings.dailyStepTarget !== nextSettings.dailyStepTarget

    const result = updateSettings(nextSettings)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    if (targetsChanged) {
      const decisionRecord = buildManualOverrideDecisionRecord(
        settings,
        nextSettings,
        options?.effectiveDate ?? buildSelectedDateTimestamp(),
        options?.reasonCode,
      )
      const decisionResult = appendCoachingDecision(decisionRecord)
      if (!decisionResult.ok) {
        reportError(decisionResult.error)
        return decisionResult as ActionResult<void>
      }

      const overrideResult = markOverridden(
        decisionRecord.id,
        options?.effectiveDate ?? buildSelectedDateTimestamp(),
      )
      if (!overrideResult.ok) {
        reportError(overrideResult.error)
        return overrideResult as ActionResult<void>
      }

      void recordDiagnosticsEvent({
        eventType: 'coaching_decision_overridden',
        severity: 'warning',
        scope: 'diagnostics',
        recordKey: decisionRecord.id,
        message: 'Targets were changed manually from Settings.',
        payload: {
          decisionRecordId: decisionRecord.id,
          previousTargets: decisionRecord.previousTargets,
          proposedTargets: decisionRecord.proposedTargets,
        },
      })
    }

    reportError(null)
    return result
  }

  function handleStartPsmfPhase(startDate: string, plannedEndDate: string, notes?: string): ActionResult<DietPhase> {
    const result = startPsmfPhase(startDate, plannedEndDate, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleUpdatePlannedDietPhase(
    phaseId: string,
    patch: Pick<DietPhase, 'startDate' | 'plannedEndDate' | 'calorieTargetOverride' | 'notes'>,
  ): ActionResult<DietPhase> {
    const result = updatePlannedPhase(phaseId, patch)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleExtendDietPhase(phaseId: string, plannedEndDate: string): ActionResult<DietPhase> {
    const result = extendPhase(phaseId, plannedEndDate)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleCompleteDietPhase(phaseId: string, actualEndDate: string): ActionResult<DietPhase> {
    const result = completePhase(phaseId, actualEndDate)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleStartDietBreak(
    startDate: string,
    plannedEndDate: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhase> {
    const result = startDietBreak(startDate, plannedEndDate, calorieTargetOverride, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleStartCarbCycle(
    startDate: string,
    plannedEndDate: string,
    notes?: string,
  ): ActionResult<DietPhase> {
    const result = startCarbCycle(startDate, plannedEndDate, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleScheduleRefeed(
    phaseId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhaseEvent> {
    const result = scheduleRefeed(phaseId, date, calorieTargetOverride, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleScheduleHighCarbDay(
    phaseId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhaseEvent> {
    const result = scheduleHighCarbDay(phaseId, date, calorieTargetOverride, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleUpdateRefeed(
    eventId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhaseEvent> {
    const result = updateRefeed(eventId, date, calorieTargetOverride, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleDeleteRefeed(eventId: string): ActionResult<void> {
    const result = deleteRefeed(eventId)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleDeleteHighCarbDay(eventId: string): ActionResult<void> {
    const result = deleteHighCarbDay(eventId)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleCancelDietPhase(phaseId: string): ActionResult<DietPhase> {
    const result = cancelPhase(phaseId)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleUpdateDietPhaseNotes(
    phaseId: string,
    notes: string | undefined,
  ): ActionResult<DietPhase> {
    const result = updatePhaseNotes(phaseId, notes)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleExitPsmf(): ActionResult<void> {
    return handleManualSettingsUpdate({
      ...settings,
      fatLossMode: 'standard_cut',
    })
  }

  function handleSaveRecoveryCheckIn(
    date: string,
    nextCheckIn: Pick<
      RecoveryCheckIn,
      'energyScore' | 'hungerScore' | 'sorenessScore' | 'sleepQualityScore' | 'notes'
    >,
  ): ActionResult<RecoveryCheckIn> {
    const result = saveRecoveryCheckInEntry(date, nextCheckIn)
    reportError(result.ok ? null : result.error)
    return result
  }

  function handleDeleteRecoveryCheckIn(date: string): ActionResult<void> {
    const result = deleteRecoveryCheckInEntry(date)
    reportError(result.ok ? null : result.error)
    return result
  }

  async function handleGarminConnect(): Promise<void> {
    const result = await garmin.connect()
    reportError(result.ok ? null : result.error)
  }

  async function handleGarminSync(): Promise<void> {
    const result = await garmin.syncNow()
    reportError(result.ok ? null : result.error)
  }

  async function handleGarminDisconnect(): Promise<void> {
    const result = await garmin.disconnect()
    reportError(result.ok ? null : result.error)
  }

  function handleDismissCoaching(): void {
    const result = updateSettings({
      ...settings,
      coachingDismissedAt: buildSelectedDateTimestamp(),
    })
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  const coachController = useCoachController({
    selectedDate,
    selectedDayStatus,
    selectedDateTotals,
    settings: coachingSettings,
    uiPrefs,
    weights,
    interventions,
    coachingInsight,
    logsByDate: Object.fromEntries(
      Object.entries(allLogsByDate).map(([date, dayEntries]) => [
        date,
        dayEntries.filter((entry) => !entry.deletedAt),
      ]),
    ),
    getDayStatus,
    buildSnapshot,
    queueQuestion,
    updateUiPrefs,
    updateSettings,
    updateCoachConfig,
    coachConfig,
    reportError,
    requestTabChange: guardedTabChange,
    openCopyPrevious: foodEntryController.openCopyPrevious,
    openInterventionSheet: () => interventionController.openInterventionSheet(),
    onDismissCoaching: handleDismissCoaching,
    onChangeDayStatus: handleChangeDayStatus,
    onApplyCoachingRecommendation: handleApplyCoachingRecommendation,
    networkStatus,
  })

  const statusBadge = useMemo(() => {
    if (networkStatus === 'offline') {
      return {
        label: 'Offline',
        className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
        Icon: WifiOff,
      }
    }

    return {
      label: 'Online',
      className: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-200',
      Icon: Wifi,
    }
  }, [networkStatus])

  function handleAddFavoriteFood(meal: MealType, foodId: string): void {
    const favoriteFood = foods.find((food) => food.id === foodId && !food.archivedAt)
    if (!favoriteFood) {
      reportError('That favorite food is no longer available.')
      return
    }

    ensureEditableIntakeDay(() => {
      const result = addEntry(meal, favoriteFood, favoriteFood.lastServings ?? 1)
      if (!result.ok) {
        reportError(result.error)
        return
      }

      reportError(null)
      queueUndoAction({
        id: crypto.randomUUID(),
        title: 'Favorite food added',
        description: favoriteFood.name,
        actionLabel: 'Undo',
        undo: () => deleteEntry(result.data.id),
      })
      scrollEntryIntoView(result.data.id, meal)
    })
  }

  function handleConfirmRecipe(recipeId: string, servings: number): ActionResult<unknown> {
    const recipe = recipes.find((currentRecipe) => currentRecipe.id === recipeId && !currentRecipe.deletedAt)
    if (!recipe || !foodEntryController.foodSheetContext || foodEntryController.foodSheetContext.kind !== 'add') {
      return {
        ok: false,
        error: {
          code: 'recipeUnavailable',
          message: 'That recipe is no longer available.',
        },
      }
    }

    const perServingCalories =
      recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.calories * ingredient.servings, 0) /
      Math.max(recipe.yieldServings, 1)
    const perServingProtein =
      recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.protein * ingredient.servings, 0) /
      Math.max(recipe.yieldServings, 1)
    const perServingCarbs =
      recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.carbs * ingredient.servings, 0) /
      Math.max(recipe.yieldServings, 1)
    const perServingFat =
      recipe.ingredients.reduce((sum, ingredient) => sum + ingredient.snapshot.fat * ingredient.servings, 0) /
      Math.max(recipe.yieldServings, 1)
    const result = addSnapshotEntry(
      foodEntryController.foodSheetContext.meal,
      {
        name: recipe.name,
        servingSize: 1,
        servingUnit: recipe.yieldLabel ?? 'recipe serving',
        calories: perServingCalories,
        protein: perServingProtein,
        carbs: perServingCarbs,
        fat: perServingFat,
        fiber: recipe.nutrients ? getNutrientAmountV1(recipe.nutrients, 'fiber') ?? undefined : undefined,
        source: 'recipe',
        nutrients: recipe.nutrients,
      },
      servings,
    )
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    const usageResult = incrementRecipeUsage(recipeId)
    if (!usageResult.ok) {
      reportError(usageResult.error)
      return usageResult
    }

    reportError(null)
    return { ok: true, data: result.data }
  }

  function handleApplySavedMealFromSheet(savedMealId: string): ActionResult<unknown> {
    if (!foodEntryController.foodSheetContext || foodEntryController.foodSheetContext.kind !== 'add') {
      return {
        ok: false,
        error: {
          code: 'savedMealUnavailable',
          message: 'That saved meal cannot be applied right now.',
        },
      }
    }

    return bulkApplyController.handleApplyTemplate(savedMealId, foodEntryController.foodSheetContext.meal)
  }

  function applyPhaseMealTemplate(
    template: PhaseMealTemplate,
    batchAction: 'fill_meal' | 'fill_day',
  ): ActionResult<unknown> {
    if (!foodEntryController.foodSheetContext || foodEntryController.foodSheetContext.kind !== 'add') {
      return {
        ok: false,
        error: {
          code: 'templateUnavailable',
          message: 'That phase template cannot be applied right now.',
        },
      }
    }

    const sheetMeal = foodEntryController.foodSheetContext.meal
    const mappedSavedMeals = template.meals
      .map((mapping) => {
        if (!mapping.savedMealId) {
          return null
        }
        const savedMeal =
          visibleSavedMeals.find((candidate) => candidate.id === mapping.savedMealId) ?? null
        if (!savedMeal) {
          return null
        }
        return {
          meal: mapping.meal,
          savedMeal,
        }
      })
      .filter((mapping): mapping is { meal: MealType; savedMeal: SavedMeal } => mapping !== null)

    if (mappedSavedMeals.length === 0) {
      return {
        ok: false,
        error: {
          code: 'templateEmpty',
          message: 'This phase template does not have any saved meals mapped yet.',
        },
      }
    }

    const targetSavedMeals =
      batchAction === 'fill_meal'
        ? mappedSavedMeals.filter((mapping) => mapping.meal === sheetMeal)
        : mappedSavedMeals

    if (targetSavedMeals.length === 0) {
      return {
        ok: false,
        error: {
          code: 'templateMealMissing',
          message: `No saved meal is mapped for ${sheetMeal} in this phase template.`,
        },
      }
    }

    const appendedEntries = targetSavedMeals.flatMap(({ meal, savedMeal }) =>
      buildFoodLogEntriesFromSavedMeal({
        savedMeal,
        date: selectedDate,
        meal,
      }),
    )
    const appendResult = appendEntries(appendedEntries)
    if (!appendResult.ok) {
      reportError(appendResult.error)
      return appendResult
    }

    for (const { savedMeal } of targetSavedMeals) {
      const usageResult = incrementTemplateUsage(savedMeal.id)
      if (!usageResult.ok) {
        reportError(usageResult.error)
        return usageResult
      }
    }

    reportError(null)
    if (appendedEntries[0]) {
      scrollEntryIntoView(appendedEntries[0].id, appendedEntries[0].meal)
    }

    return { ok: true, data: undefined }
  }

  function handleApplyPhaseTemplateMeal(templateId: string): ActionResult<unknown> {
    const template =
      settings.phaseMealTemplates?.find((entry) => entry.id === templateId && !entry.archivedAt) ??
      null
    if (!template) {
      return {
        ok: false,
        error: {
          code: 'templateMissing',
          message: 'That phase template is no longer available.',
        },
      }
    }

    return applyPhaseMealTemplate(template, 'fill_meal')
  }

  function handleApplyPhaseTemplateDay(templateId: string): ActionResult<unknown> {
    const template =
      settings.phaseMealTemplates?.find((entry) => entry.id === templateId && !entry.archivedAt) ??
      null
    if (!template) {
      return {
        ok: false,
        error: {
          code: 'templateMissing',
          message: 'That phase template is no longer available.',
        },
      }
    }

    return applyPhaseMealTemplate(template, 'fill_day')
  }

  function handleAcceptPhaseTemplateSeed(): ActionResult<unknown> {
    if (
      !selectedDatePhaseTemplateLane ||
      selectedDatePhaseTemplateLane.state !== 'pending_review' ||
      !selectedDatePhaseTemplateLane.seedSuggestion
    ) {
      return {
        ok: false,
        error: {
          code: 'templateSeedMissing',
          message: 'No pending phase-template suggestion is available right now.',
        },
      }
    }

    const now = new Date().toISOString()
    const existingTemplates = settings.phaseMealTemplates ?? []
    const existing = existingTemplates.find(
      (template) =>
        template.dayType === selectedDateCutDayPlan.dayType && !template.archivedAt,
    )
    const nextMeals = [
      ...(existing?.meals.filter(
        (entry) => entry.meal !== selectedDatePhaseTemplateLane.seedSuggestion?.meal,
      ) ?? []),
      {
        meal: selectedDatePhaseTemplateLane.seedSuggestion.meal,
        savedMealId: selectedDatePhaseTemplateLane.seedSuggestion.savedMealId,
      },
    ]
    const nextTemplate: PhaseMealTemplate = {
      id: existing?.id ?? crypto.randomUUID(),
      label: existing?.label ?? buildDefaultPhaseTemplateLabel(selectedDateCutDayPlan.dayType),
      dayType: selectedDateCutDayPlan.dayType,
      meals: nextMeals,
      source: 'saved_meal_map',
      seedSource: selectedDatePhaseTemplateLane.seedSource,
      seedReviewState: 'accepted',
      lastSeededAt: now,
      lastAppliedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return handleManualSettingsUpdate({
      ...settings,
      phaseMealTemplates: [
        ...existingTemplates.filter((template) => template.id !== existing?.id),
        nextTemplate,
      ].sort((left, right) => left.dayType.localeCompare(right.dayType)),
    })
  }

  function handleRejectPhaseTemplateSeed(): ActionResult<unknown> {
    if (
      !selectedDatePhaseTemplateLane ||
      selectedDatePhaseTemplateLane.state !== 'pending_review'
    ) {
      return {
        ok: false,
        error: {
          code: 'templateSeedMissing',
          message: 'No pending phase-template suggestion is available right now.',
        },
      }
    }

    const now = new Date().toISOString()
    const existingTemplates = settings.phaseMealTemplates ?? []
    const existing = existingTemplates.find(
      (template) =>
        template.dayType === selectedDateCutDayPlan.dayType && !template.archivedAt,
    )
    const nextTemplate: PhaseMealTemplate = {
      id: existing?.id ?? crypto.randomUUID(),
      label: existing?.label ?? buildDefaultPhaseTemplateLabel(selectedDateCutDayPlan.dayType),
      dayType: selectedDateCutDayPlan.dayType,
      meals: existing?.meals ?? [],
      source: 'saved_meal_map',
      seedSource: selectedDatePhaseTemplateLane.seedSource,
      seedReviewState: 'rejected',
      lastSeededAt: now,
      lastAppliedAt: existing?.lastAppliedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return handleManualSettingsUpdate({
      ...settings,
      phaseMealTemplates: [
        ...existingTemplates.filter((template) => template.id !== existing?.id),
        nextTemplate,
      ].sort((left, right) => left.dayType.localeCompare(right.dayType)),
    })
  }

  return (
    <div className="min-h-screen" style={appChromeStyles}>
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-3 pb-[var(--app-bottom-clearance)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <header className="mb-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                MacroTracker
              </p>
              <h1 className="font-display text-[1.7rem] leading-tight text-slate-900 dark:text-white">
                Local-first macro logging
              </h1>
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusBadge.className}`}
            >
              <statusBadge.Icon className="h-3.5 w-3.5" />
              {statusBadge.label}
            </div>
          </div>
        </header>

        {hasGlobalRecoveryBanner ? (
          <button
            type="button"
            className="mb-3 flex items-start gap-3 rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-3 text-left text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
            onClick={openSettingsTab}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {initializationError
                  ? initializationError.message
                  : `${recoveryIssues.length} recoverable data issue${recoveryIssues.length === 1 ? '' : 's'} need review.`}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                Open Settings to inspect storage health
              </p>
            </div>
          </button>
        ) : null}

        {pwaShell.showInstallPrompt ? (
          <div className="mb-3 rounded-[24px] border border-teal-200 bg-teal-50/90 px-4 py-4 text-sm text-teal-900 shadow-sm dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Install MacroTracker</p>
                <p className="mt-1 text-sm text-teal-800 dark:text-teal-100">
                  Add MacroTracker to your Samsung home screen so logging opens like a full-screen phone app.
                </p>
              </div>
              <button
                type="button"
                className="icon-button shrink-0"
                onClick={pwaShell.dismissInstallPrompt}
                aria-label="Dismiss install prompt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="action-button flex-1"
                onClick={() => {
                  void pwaShell.install()
                }}
              >
                Install app
              </button>
              <button
                type="button"
                className="action-button-secondary flex-1"
                onClick={pwaShell.dismissInstallPrompt}
              >
                Maybe later
              </button>
            </div>
          </div>
        ) : null}

        {pwaShell.updateStatus !== 'idle' && pwaShell.updateStatus !== 'applying' ? (
          <div className="mb-3 rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/80 dark:text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {pwaShell.updateStatus === 'suppressed'
                    ? 'Update paused'
                    : pwaShell.updateStatus === 'deferred'
                      ? 'Update downloaded'
                      : 'Update ready'}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {pwaShell.updateMessage}
                </p>
              </div>
              <button
                type="button"
                className="action-button shrink-0"
                onClick={() => {
                  void pwaShell.applyUpdate()
                }}
              >
                Update now
              </button>
            </div>
          </div>
        ) : null}

        {pwaShell.updateStatus === 'applying' ? (
          <div className="mb-3 rounded-[24px] border border-slate-200 bg-white/95 px-4 py-4 text-sm text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/90 dark:text-white">
            <div className="flex items-center gap-3">
              <LoaderCircle className="h-5 w-5 animate-spin text-slate-500 dark:text-slate-300" />
              <div>
                <p className="font-semibold">Updating MacroTracker</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{pwaShell.updateMessage}</p>
              </div>
            </div>
          </div>
        ) : null}

        {globalError ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
            <p>{globalError.message}</p>
            <button type="button" className="icon-button shrink-0" onClick={clearGlobalError} aria-label="Dismiss message">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <main className="min-h-0 flex-1 pb-4">
          {FEATURE_FLAGS.dashboardV1 && activeTab === 'dashboard' ? (
            <DashboardScreen
              currentCheckIn={visibleCurrentCheckIn}
              nutritionOverview={nutritionOverview}
              foodReviewQueue={foodReviewQueue}
              garminSurface={garminSurface}
              workoutSnapshot={effectiveWorkoutSnapshot}
              cutCockpit={cutCockpit}
              settings={settings}
              cutModeEnabled={FEATURE_FLAGS.cutModeV1}
              morningSnapshot={morningPhoneSnapshot}
              bodyProgressSnapshots={
                FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1
                  ? bodyProgress.snapshots
                  : []
              }
              benchmarkReports={benchmarkReports}
              claimSnapshot={claimSnapshot}
              commandHomeEnabled={FEATURE_FLAGS.commandHomeV1}
              onOpenCoach={() => setActiveTab('coach')}
              onOpenWeight={() => setActiveTab('weight')}
              onOpenWorkouts={() => setActiveTab('workouts')}
              onOpenAddFood={openDashboardQuickLog}
              onOpenCaptureConvenience={
                FEATURE_FLAGS.captureConvenienceV1 ? openDashboardCaptureConvenience : undefined
              }
              onOpenLogDate={openLogDate}
              onOpenSettings={openSettingsTab}
              onRunFastCheckIn={() => handleRunFastCheckIn('dashboard')}
              onDismissReviewItem={handleDismissReviewItem}
              onUpdateSettings={handleManualSettingsUpdate}
              onOpenAdaptiveReview={() => guardedTabChange('coach')}
            />
          ) : null}

          {activeTab === 'log' ? (
            <LogScreen
              date={selectedDate}
              foods={foods}
              entries={entries}
              interventions={selectedDateInterventions}
              dayStatus={selectedDayStatus}
              dayMarkers={selectedDayMeta?.markers ?? []}
              activityEntry={selectedDateActivity}
              templates={visibleSavedMeals}
              favoriteFoods={visibleFavorites}
              recentCombinations={recentCombinations}
              coachingInsight={coachingInsight}
              recommendationDismissed={recommendationDismissed}
              settings={settings}
              cutDayPlan={selectedDateCutDayPlan}
              onChangeDate={setSelectedDate}
              onChangeDayStatus={handleChangeDayStatus}
              onToggleDayMarker={handleToggleDayMarker}
              onSaveActivity={handleSaveActivity}
              onDeleteActivity={handleDeleteActivity}
              onOpenCoach={() => setActiveTab('coach')}
              onApplyCoachingRecommendation={handleApplyCoachingRecommendation}
              onKeepCurrentTarget={handleKeepCurrentTarget}
              onDismissCoaching={handleDismissCoaching}
              onOpenQuickAdd={foodEntryController.openQuickAdd}
              onOpenCopyPrevious={foodEntryController.openCopyPrevious}
              onOpenIntervention={() => interventionController.openInterventionSheet()}
              onEditIntervention={(interventionId) => interventionController.openInterventionSheet(interventionId)}
              onDeleteIntervention={interventionController.handleDeleteIntervention}
              onOpenAddFood={foodEntryController.openAddFood}
              onAddFavoriteFood={handleAddFavoriteFood}
              onOpenTemplates={foodEntryController.openTemplateSheet}
              onSaveMealTemplate={foodEntryController.openSaveTemplate}
              onSaveRecipe={FEATURE_FLAGS.recipes ? foodEntryController.openSaveRecipe : () => undefined}
              onApplyQuickTemplate={bulkApplyController.handleApplyTemplate}
              onApplyRecentCombination={bulkApplyController.handleCopyMeal}
              onEditEntry={foodEntryController.openEditSheet}
              onAdjustEntryServings={foodEntryController.handleAdjustEntryServings}
              onDeleteEntry={foodEntryController.handleDeleteEntry}
              onOpenSettings={openSettingsTab}
            />
          ) : null}

          {activeTab === 'weight' ? (
            <Suspense fallback={renderLazyFallback('Loading weight tools...')}>
              <WeightScreen
                settings={settings}
                weights={weights}
                currentCheckIn={visibleCurrentCheckIn}
                canApplyCheckInTargets={visibleCanApplyCheckInTargets}
                checkInHistory={visibleCheckInHistory}
                coachingDecisionHistory={visibleCoachingDecisionHistory}
                nutritionOverview={nutritionOverview}
                nutritionOverviewV2Enabled={FEATURE_FLAGS.nutritionOverviewV2}
                bodyProgressSnapshots={
                  FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1
                    ? bodyProgress.snapshots
                    : []
                }
                cutDayPlan={todayCutDayPlan}
                previewPsmfGarminUiState={previewPsmfGarminUiState}
                onSaveWeight={(date, weight, unit) => {
                  const result = saveWeight(date, weight, unit)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onDeleteWeight={handleDeleteWeight}
                onApplyCheckInSuggestion={handleApplyCheckInSuggestion}
                onKeepCurrentCheckIn={handleKeepCurrentCheckIn}
                onManualOverrideTargets={(nextSettings, reasonCode) =>
                  handleManualSettingsUpdate(nextSettings, { reasonCode, effectiveDate: buildSelectedDateTimestamp() })
                }
                onUpdateSettings={handleManualSettingsUpdate}
                onSaveBodyProgress={
                  FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1
                    ? bodyProgress.saveSnapshot
                    : undefined
                }
                onDeleteBodyProgress={
                  FEATURE_FLAGS.bodyMetricsV1 || FEATURE_FLAGS.progressPhotosV1
                    ? bodyProgress.deleteSnapshot
                    : undefined
                }
                onOpenCoach={() => setActiveTab('coach')}
                onOpenSettings={openSettingsTab}
              />
            </Suspense>
          ) : null}

          {activeTab === 'coach' ? (
            <Suspense fallback={renderLazyFallback('Loading coach...')}>
              <CoachScreen
                coachState={coachState}
                preferredMode={uiPrefs.preferredAskCoachMode}
                citationsExpanded={uiPrefs.coachCitationsExpanded}
                config={coachConfig}
                thread={coachThread.messages}
                queue={coachQueue}
                feedback={coachFeedback}
                starterPrompts={starterPrompts}
                onAsk={coachController.handleCoachQuestion}
                onClearQueued={(questionId) => {
                  const result = clearQueuedQuestion(questionId)
                  if (!result.ok) {
                    reportError(result.error)
                    return
                  }
                  reportError(null)
                }}
                onRate={(messageId, rating) => {
                  const result = rateMessage(messageId, rating)
                  if (!result.ok) {
                    reportError(result.error)
                    return
                  }
                  reportError(null)
                }}
                onProposal={coachController.handleCoachProposal}
                onClearThread={() => {
                  const result = clearThread()
                  if (!result.ok) {
                    reportError(result.error)
                    return
                  }
                  reportError(null)
                }}
                onChangePreferredMode={coachController.handleChangePreferredMode}
                onToggleCitationsExpanded={coachController.handleToggleCitationsExpanded}
                onSetProvider={coachController.handleSetProvider}
                currentCheckIn={visibleCurrentCheckIn}
                fastCheckInEnabled={settings.fastCheckInPreference?.enabled ?? true}
                lastFastCheckInRun={settings.lastFastCheckInRun}
                onRunFastCheckIn={() => handleRunFastCheckIn('coach')}
                cutDayPlan={todayCutDayPlan}
                workoutAction={effectiveWorkoutSnapshot.actionCard}
                onOpenWorkouts={() => setActiveTab('workouts')}
                onOpenSettings={openSettingsTab}
                onApplyCutReview={handleApplyCheckInSuggestion}
                onDeferCutReview={handleDeferCutReview}
              />
            </Suspense>
          ) : null}

          {FEATURE_FLAGS.workoutsV1 && activeTab === 'workouts' ? (
            <Suspense fallback={renderLazyFallback('Loading workouts...')}>
              <WorkoutsScreen
                settings={settings}
                programs={workouts.programs}
                sessions={workouts.sessions}
                decisions={workouts.decisions}
                garminWorkoutSummaries={garminWorkoutSummaries}
                snapshot={effectiveWorkoutSnapshot}
                lastError={workouts.lastError}
                onUpdateSettings={handleManualSettingsUpdate}
                onCreateProgram={workouts.createProgram}
                onUpdateProgramPreservationDefaults={workouts.updateProgramPreservationDefaults}
                onLogSession={workouts.logSession}
                onOpenSettings={openSettingsTab}
              />
            </Suspense>
          ) : null}

          {activeTab === 'settings' ? (
            <Suspense fallback={renderLazyFallback('Loading settings...')}>
              <SettingsScreen
                settings={settings}
                syncConfigured={sync.configured}
                syncState={sync.syncState}
                syncSessionEmail={sync.session?.user.email ?? null}
                syncAuthNotice={sync.authNotice}
                syncAuthError={sync.authError}
                bootstrapSummary={sync.bootstrapSummary}
                bootstrapResolutionView={sync.bootstrapResolutionView}
                mergePreview={sync.mergePreview}
                bootstrapBusy={sync.bootstrapBusy}
                diagnosticsSummary={diagnostics.summary}
                foods={foods}
                recipes={FEATURE_FLAGS.recipes ? allRecipes : []}
                savedMeals={visibleSavedMeals}
                foodReviewQueue={foodReviewQueue}
                recoveryIssues={recoveryIssues}
                previewPsmfGarminUiState={previewPsmfGarminUiState}
                activePsmfPhase={activePsmfPhase}
                activeDietBreakPhase={activeDietBreakPhase}
                activeCarbCyclePhase={activeCarbCyclePhase}
                activeCarbCycleHighCarbDays={activeCarbCycleHighCarbDays}
                expiredPsmfPhase={expiredPsmfPhase}
                plannedPhases={plannedPhases}
                historicalPhases={historicalPhases}
                selectablePsmfPhases={selectablePsmfPhases}
                selectedPsmfPhaseId={selectedPsmfPhaseId}
                selectedPsmfPhase={selectedPsmfPhase}
                selectedPsmfPhaseRefeeds={selectedPsmfPhaseRefeeds}
                recoveryCheckInToday={todayRecoveryCheckIn}
                garminBusy={garmin.busy}
                initializationError={initializationError}
                getFoodReferenceCount={getFoodReferenceCount}
                onUpdateSettings={handleManualSettingsUpdate}
                phaseReviewIntent={phaseReviewIntent}
                onClearPhaseReviewIntent={() => setPhaseReviewIntent(null)}
                onStartPsmfPhase={handleStartPsmfPhase}
                onUpdatePlannedPhase={handleUpdatePlannedDietPhase}
                onExtendDietPhase={handleExtendDietPhase}
                onCompleteDietPhase={handleCompleteDietPhase}
                onStartDietBreak={handleStartDietBreak}
                onStartCarbCycle={handleStartCarbCycle}
                onScheduleRefeed={handleScheduleRefeed}
                onScheduleHighCarbDay={handleScheduleHighCarbDay}
                onUpdateRefeed={handleUpdateRefeed}
                onDeleteRefeed={handleDeleteRefeed}
                onDeleteHighCarbDay={handleDeleteHighCarbDay}
                onCancelPhase={handleCancelDietPhase}
                onUpdatePhaseNotes={handleUpdateDietPhaseNotes}
                onSelectPsmfPhase={setSelectedPsmfPhaseId}
                hasLoggedEntriesOnDate={(date) => (allFoodLogs[date]?.length ?? 0) > 0}
                onExitPsmf={handleExitPsmf}
                onSaveRecoveryCheckIn={handleSaveRecoveryCheckIn}
                onDeleteRecoveryCheckIn={handleDeleteRecoveryCheckIn}
                onConnectGarmin={() => void handleGarminConnect()}
                onSyncGarmin={() => void handleGarminSync()}
                onDisconnectGarmin={() => void handleGarminDisconnect()}
                onOpenLogDate={openLogDate}
                onCreateFood={(draft) => {
                  const result = createFood(draft)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onUpdateFood={(foodId, draft) => {
                  const result = updateFood(foodId, draft)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onArchiveFood={handleArchiveFood}
                onRestoreFood={handleRestoreFood}
                onPurgeFood={(foodId) => {
                  const result = purgeFood(foodId)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onRenameRecipe={(recipeId, name) => {
                  const result = renameRecipe(recipeId, name)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onArchiveRecipe={(recipeId) => {
                  const result = archiveRecipe(recipeId)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onRestoreRecipe={(recipeId) => {
                  const result = restoreRecipe(recipeId)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onDeleteRecipe={(recipeId) => {
                  const result = deleteRecipe(recipeId)
                  if (!result.ok) {
                    reportError(result.error)
                    return result
                  }

                  reportError(null)
                  return result
                }}
                onDismissFoodReviewItem={handleDismissReviewItem}
                onReportGlobalError={reportError}
                onFoodEditorStateChange={setSettingsEditorState}
                onFindDuplicateFood={findDuplicateFood}
                onSendMagicLink={sync.sendMagicLink}
                onSignOut={() => void sync.signOut()}
                onSyncNow={() => void sync.syncNow()}
                onPreviewMerge={() => void sync.previewMerge()}
                onApplyBootstrap={(resolution) => void sync.applyBootstrap(resolution)}
                onClearSyncDeadLetters={sync.clearDeadLetters}
                onExportDiagnostics={() => diagnostics.exportDiagnosticsJson()}
              />
            </Suspense>
          ) : null}
        </main>
      </div>

      <AppBottomNav items={visibleTabItems} activeTab={activeTab} onSelect={guardedTabChange} />

      <UndoToastStack undoQueue={undoQueue} onUndo={handleUndo} onDismiss={dismissUndoItem} />

      {foodEntryController.foodSheetContext !== null ? (
        <Suspense fallback={renderLazyFallback('Loading add-food tools...')}>
          <AddFoodSheet
            open={foodEntryController.foodSheetContext !== null}
            mode={foodEntryController.foodSheetContext.kind === 'replace' ? 'replace' : 'add'}
            mealLabel={
              foodEntryController.foodSheetContext.kind === 'add'
                ? foodEntryController.foodSheetContext.meal
                : undefined
            }
            foods={foods}
            loggingShortcutPreference={settings.loggingShortcutPreference}
            loggingToolbarStyle={settings.loggingToolbarStyle}
            loggingShortcuts={settings.loggingShortcuts}
            entryContext={
              foodEntryController.foodSheetContext.kind === 'add'
                ? foodEntryController.foodSheetContext.entryContext
                : 'meal_slot'
            }
            initialCaptureSource={
              foodEntryController.foodSheetContext.kind === 'add'
                ? foodEntryController.foodSheetContext.captureSource ?? null
                : null
            }
            isOnline={networkStatus === 'online'}
            captureConvenienceEnabled={FEATURE_FLAGS.captureConvenienceV1}
            foodCatalogSearchEnabled={FEATURE_FLAGS.foodCatalogSearch}
            savedMeals={visibleSavedMeals}
            recipes={visibleRecipes}
            favorites={visibleFavorites}
            favoriteFoodIds={visibleFavorites.map((favorite) => favorite.foodId)}
            keepOpenAfterAdd={uiPrefs.keepOpenAfterAdd}
            onChangeKeepOpenAfterAdd={(keepOpenAfterAdd) => {
              const result = updateUiPrefs({
                ...uiPrefs,
                keepOpenAfterAdd,
              })
              if (!result.ok) {
                reportError(result.error)
                return
              }
              reportError(null)
            }}
            onClose={foodEntryController.closeFoodSheet}
            onDirtyChange={foodEntryController.setFoodSheetDirty}
            onConfirmFood={foodEntryController.handleConfirmFood}
            onCreateFood={createFood}
            onImportFood={importFood}
            onToggleFavoriteFood={
              FEATURE_FLAGS.favoriteFoods ? (foodId) => toggleFavorite(foodId) : undefined
            }
            onConfirmRecipe={FEATURE_FLAGS.recipes ? handleConfirmRecipe : undefined}
            onApplySavedMeal={FEATURE_FLAGS.savedMeals ? handleApplySavedMealFromSheet : undefined}
            phaseTemplateLane={selectedDatePhaseTemplateLane}
            onApplyPhaseTemplateMeal={handleApplyPhaseTemplateMeal}
            onApplyPhaseTemplateDay={handleApplyPhaseTemplateDay}
            onAcceptPhaseTemplateSeed={handleAcceptPhaseTemplateSeed}
            onRejectPhaseTemplateSeed={handleRejectPhaseTemplateSeed}
            onOpenPhaseTemplateSettings={openSettingsTab}
            onFindDuplicateFood={findDuplicateFood}
            onResolveFoodMatch={resolveFoodMatch}
            onRestoreFood={handleRestoreFood}
            searchFoods={searchFoods}
            getQuickFoods={getQuickFoods}
            repeatCandidates={repeatCandidates}
          />
        </Suspense>
      ) : null}

      <QuickAddSheet
        key={`quick-add-${selectedDate}-${foodEntryController.quickAddOpen ? 'open' : 'closed'}`}
        open={foodEntryController.quickAddOpen}
        defaultMeal="breakfast"
        onClose={foodEntryController.closeQuickAdd}
        onDirtyChange={foodEntryController.setQuickAddDirty}
        onSubmit={foodEntryController.handleQuickAdd}
      />

      <CopyPreviousSheet
        key={`copy-previous-${selectedDate}-${foodEntryController.copyPreviousOpen ? 'open' : 'closed'}`}
        open={foodEntryController.copyPreviousOpen}
        currentDate={selectedDate}
        onClose={foodEntryController.closeCopyPrevious}
        onDirtyChange={foodEntryController.setCopyPreviousDirty}
        onCopyPreviousDay={bulkApplyController.handleCopyPreviousDay}
        onCopyMeal={bulkApplyController.handleCopyMeal}
      />

      <InterventionSheet
        key={`intervention-${selectedDate}-${interventionController.editingInterventionId ?? 'new'}-${interventionController.interventionSheetOpen ? 'open' : 'closed'}`}
        open={interventionController.interventionSheetOpen}
        entry={interventionController.editingIntervention}
        recentNames={interventionController.recentInterventionNames}
        onClose={interventionController.closeInterventionSheet}
        onDirtyChange={interventionController.setInterventionSheetDirty}
        onSubmit={interventionController.handleSubmitIntervention}
        onDelete={
          interventionController.editingIntervention
            ? () => {
                const interventionId = interventionController.editingIntervention?.id
                if (interventionId) {
                  interventionController.handleDeleteIntervention(interventionId)
                }
              }
            : null
        }
      />

      <TemplateSheet
        key={`template-sheet-${selectedDate}-${foodEntryController.templateSheetMeal ?? 'none'}-${foodEntryController.templateSheetMeal ? 'open' : 'closed'}`}
        open={foodEntryController.templateSheetMeal !== null}
        meal={foodEntryController.templateSheetMeal}
        templates={visibleSavedMeals}
        onClose={foodEntryController.closeTemplateSheet}
        onApplyTemplate={bulkApplyController.handleApplyTemplate}
        onDeleteTemplate={bulkApplyController.handleDeleteTemplate}
      />

      <BulkApplyPreviewSheet
        open={bulkApplyController.bulkApplyState !== null}
        title={bulkApplyController.bulkApplyState?.title ?? 'Review bulk apply'}
        description={bulkApplyController.bulkApplyState?.description ?? ''}
        note={bulkApplyController.bulkApplyState?.note}
        preview={bulkApplyController.bulkApplyState?.preview ?? null}
        selectedMode={bulkApplyController.bulkApplyState?.selectedMode ?? 'append'}
        onChangeMode={bulkApplyController.setBulkApplyMode}
        onClose={bulkApplyController.closeBulkApply}
        onApply={() => {
          const result = bulkApplyController.applyCurrentBulkApply()
          if (!result.ok) {
            reportError(result.error)
            return
          }

          bulkApplyController.closeBulkApply()
          foodEntryController.closeCopyPrevious()
          foodEntryController.closeTemplateSheet()
        }}
      />

      <SaveTemplateSheet
        key={`save-template-${selectedDate}-${foodEntryController.saveTemplateMeal ?? 'none'}-${foodEntryController.saveTemplateMeal ? 'open' : 'closed'}`}
        open={foodEntryController.saveTemplateMeal !== null}
        meal={foodEntryController.saveTemplateMeal}
        entries={entries.filter((entry) => entry.meal === foodEntryController.saveTemplateMeal)}
        templates={visibleSavedMeals}
        onClose={foodEntryController.closeSaveTemplate}
        onDirtyChange={foodEntryController.setSaveTemplateDirty}
        onSaveTemplate={handleSaveMealTemplate}
      />

      <SaveRecipeSheet
        key={`save-recipe-${selectedDate}-${foodEntryController.saveRecipeMeal ?? 'none'}-${foodEntryController.saveRecipeMeal ? 'open' : 'closed'}`}
        open={foodEntryController.saveRecipeMeal !== null}
        meal={foodEntryController.saveRecipeMeal}
        entries={entries.filter((entry) => entry.meal === foodEntryController.saveRecipeMeal)}
        recipes={allRecipes}
        onClose={foodEntryController.closeSaveRecipe}
        onDirtyChange={foodEntryController.setSaveRecipeDirty}
        onSaveRecipe={handleSaveRecipe}
      />

      <EditEntrySheet
        entry={foodEntryController.editingEntry}
        nutrition={foodEntryController.editingNutrition}
        editingError={foodEntryController.editingError}
        editingServings={foodEntryController.editingServings}
        onChangeServings={foodEntryController.setEditingServings}
        onClose={foodEntryController.closeEditSheet}
        isDirty={foodEntryController.editSheetDirty}
        onSave={foodEntryController.saveEditingEntry}
        onReplaceFood={() => {
          if (foodEntryController.editingEntry) {
            foodEntryController.openReplaceFood(foodEntryController.editingEntry.id)
          }
        }}
        onDelete={() => {
          if (foodEntryController.editingEntry) {
            foodEntryController.handleDeleteEntry(foodEntryController.editingEntry.id)
            foodEntryController.closeEditSheet()
          }
        }}
      />

      <ConfirmDialog confirmState={confirmState} onClose={() => setConfirmState(null)} />
    </div>
  )
}

function App() {
  const [storageReady, setStorageReady] = useState(isStorageInitialized())
  const [storageError, setStorageError] = useState<string | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const { restoreLatestSnapshot, summary } = useSafetySnapshots()

  useEffect(() => {
    let cancelled = false

    if (storageReady) {
      return undefined
    }

    void Promise.all([initializeStorage(), initializeDiagnosticsPersistence()])
      .then(() => {
        if (!cancelled) {
          setStorageReady(true)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStorageError(error instanceof Error ? error.message : 'Unable to load local storage.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [storageReady])

  if (storageError) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-sm dark:border-rose-500/30 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-5 w-5 text-rose-500" />
            <p className="text-sm font-semibold">Storage bootstrap failed</p>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{storageError}</p>
          <div className="mt-4 space-y-3 rounded-[24px] border border-black/5 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-950/60">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {summary.lastSnapshotAt
                ? `Latest safety snapshot: ${new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(summary.lastSnapshotAt))}`
                : 'No safety snapshot is available yet.'}
            </p>
            <button
              type="button"
              className="action-button w-full"
              disabled={!summary.lastSnapshotAt}
              onClick={() => {
                void restoreLatestSnapshot().then((result) => {
                  if (!result.ok) {
                    setRecoveryError(result.error.message)
                    return
                  }

                  window.location.reload()
                })
              }}
            >
              Restore latest safety snapshot
            </button>
            {recoveryError ? (
              <p className="text-sm text-rose-700 dark:text-rose-200">{recoveryError}</p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  if (!storageReady) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-slate-500" />
            <p className="text-sm font-semibold">Loading your local data</p>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Preparing your foods, logs, sync state, and recovery data.
          </p>
        </div>
      </div>
    )
  }

  return <AppContent bootHealthy={storageReady && storageError === null} />
}

export default App
