import { FileText, LoaderCircle, MessageSquare, Scale, Settings2, TriangleAlert, Wifi, WifiOff, X } from 'lucide-react'
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
import { LogScreen } from './screens/LogScreen'
import type {
  ActionResult,
  CoachingReasonCode,
  DayStatus,
  DietPhase,
  DietPhaseEvent,
  FoodLogEntry,
  RecoveryCheckIn,
  LegacyCoachingCode,
  MealType,
  TabId,
  UserSettings,
} from './types'
import { FEATURE_FLAGS } from './config/featureFlags'
import {
  evaluateCoachRuntimeState,
  type CoachRuntimeState,
} from './domain/coaching/runtime'
import { initializeDiagnosticsPersistence } from './utils/diagnostics'
import { recordDiagnosticsEvent } from './utils/diagnostics'
import { getNutrientAmountV1 } from './domain/nutrition'
import { buildManualOverrideDecisionRecord } from './domain/coaching'
import { formatShortDate, getTodayDateKey } from './utils/dates'
import { calculateFoodNutrition, sumNutrition } from './utils/macros'
import { appendCoachingDecision } from './utils/storage/coachDecisions'
import { subscribeToStorage } from './utils/storage/core'
import { loadAllFoodLogs, loadFoodLog, saveFoodLog } from './utils/storage/logs'
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
const TAB_ITEMS: Array<{
  id: TabId
  label: string
  icon: typeof FileText
}> = [
  { id: 'log', label: 'Log', icon: FileText },
  { id: 'weight', label: 'Weight', icon: Scale },
  { id: 'coach', label: 'Coach', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings2 },
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
    kind: 'not_connected' | 'connected' | 'syncing' | 'rate_limited' | 'reconnect_required' | 'error'
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

function AppContent() {
  const appChromeStyles = { '--app-bottom-clearance': 'calc(env(safe-area-inset-bottom) + 8.5rem)' } as CSSProperties
  const autoSnapshotPrimedRef = useRef(false)

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
  const pwaShell = usePwaShell(true)
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
    scheduleRefeed,
    updateRefeed,
    deleteRefeed,
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
  const garmin = useGarmin(sync.session)
  const { uiPrefs, updateUiPrefs } = useUiPrefs()
  const { weights, saveWeight, deleteWeight } = useWeights()
  const { getDayMeta, getDayStatus, setDayStatus, toggleDayMarker } = useDayMeta()
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
      },
    }
  }, [
    dietPhaseEvents,
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
  const coachingInsight = useCoaching(coachingSettings, weights, recoveryIssues.length)
  const {
    currentCheckIn,
    canApplyTargets: canApplyCheckInTargets,
    checkInHistory,
    coachingDecisionHistory,
    markApplied,
    markKept,
  } = useWeeklyCheckIns(coachingSettings, weights, recoveryIssues.length)
  const visibleCurrentCheckIn = FEATURE_FLAGS.weeklyDecisionCard ? currentCheckIn : null
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
      garmin.connection.status === 'connected' ||
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
            stale: garmin.connection.staleData,
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
  const recommendationDismissed = settings.coachingDismissedAt?.slice(0, 10) === selectedDate
  const hasGlobalRecoveryBanner = Boolean(initializationError || recoveryIssues.length)

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

  function closeLogSheets(): void {
    foodEntryController.closeLogSheets()
    interventionController.closeInterventionSheet()
    bulkApplyController.closeBulkApply()
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
    if (
      !currentCheckIn ||
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

  function handleManualSettingsUpdate(
    nextSettings: typeof settings,
    options?: { reasonCode?: CoachingReasonCode | LegacyCoachingCode; effectiveDate?: string },
  ): ActionResult<void> {
    const targetsChanged =
      settings.calorieTarget !== nextSettings.calorieTarget ||
      settings.proteinTarget !== nextSettings.proteinTarget ||
      settings.carbTarget !== nextSettings.carbTarget ||
      settings.fatTarget !== nextSettings.fatTarget

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
            onClick={() => setActiveTab('settings')}
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

        {pwaShell.updateReady ? (
          <div className="mb-3 rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/80 dark:text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">Update ready</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  A fresher build is ready. Reload into the updated version now.
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

        {globalError ? (
          <div className="mb-3 flex items-start justify-between gap-3 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
            <p>{globalError.message}</p>
            <button type="button" className="icon-button shrink-0" onClick={clearGlobalError} aria-label="Dismiss message">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <main className="min-h-0 flex-1 pb-4">
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
                onOpenCoach={() => setActiveTab('coach')}
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
                mergePreview={sync.mergePreview}
                bootstrapBusy={sync.bootstrapBusy}
                diagnosticsSummary={diagnostics.summary}
                foods={foods}
                recipes={FEATURE_FLAGS.recipes ? allRecipes : []}
                recoveryIssues={recoveryIssues}
                previewPsmfGarminUiState={previewPsmfGarminUiState}
                activePsmfPhase={activePsmfPhase}
                activeDietBreakPhase={activeDietBreakPhase}
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
                onStartPsmfPhase={handleStartPsmfPhase}
                onUpdatePlannedPhase={handleUpdatePlannedDietPhase}
                onExtendDietPhase={handleExtendDietPhase}
                onCompleteDietPhase={handleCompleteDietPhase}
                onStartDietBreak={handleStartDietBreak}
                onScheduleRefeed={handleScheduleRefeed}
                onUpdateRefeed={handleUpdateRefeed}
                onDeleteRefeed={handleDeleteRefeed}
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

      <AppBottomNav items={TAB_ITEMS} activeTab={activeTab} onSelect={guardedTabChange} />

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
            isOnline={networkStatus === 'online'}
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

  return <AppContent />
}

export default App
