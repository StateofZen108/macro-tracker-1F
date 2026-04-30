import { useMemo } from 'react'
import type {
  ActionResult,
  AppActionError,
  CoachActionProposal,
  CoachContextSnapshot,
  CoachMode,
  CoachProofAnswer,
  CoachProviderConfig,
  CoachQueuedQuestion,
  CoachingInsight,
  CutOsSurfaceModel,
  FoodLogEntry,
  InterventionEntry,
  NetworkStatus,
  TabId,
  UserSettings,
  WeightEntry,
  UiPrefs,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { addDays } from '../utils/dates'
import { calculateFoodNutrition, sumNutrition } from '../utils/macros'

interface UseCoachControllerOptions {
  selectedDate: string
  selectedDayStatus: CoachContextSnapshot['selectedDayStatus']
  selectedDateTotals: CoachContextSnapshot['selectedDayTotals']
  settings: UserSettings
  uiPrefs: UiPrefs
  weights: WeightEntry[]
  interventions: InterventionEntry[]
  coachingInsight: CoachingInsight
  logsByDate: Record<string, FoodLogEntry[]>
  getDayStatus: (date: string) => CoachContextSnapshot['selectedDayStatus']
  buildSnapshot: (baseSnapshot: CoachContextSnapshot) => CoachContextSnapshot
  queueQuestion: (
    question: string,
    mode: CoachMode,
    snapshot?: CoachContextSnapshot,
  ) => ActionResult<CoachQueuedQuestion>
  answerQuestionWithProof: (
    question: string,
    mode: CoachMode,
    snapshot: CoachContextSnapshot,
    cutOsSurface: CutOsSurfaceModel | null,
  ) => ActionResult<CoachProofAnswer>
  cutOsSurface: CutOsSurfaceModel | null
  updateUiPrefs: (prefs: UiPrefs) => ActionResult<void>
  updateSettings: (settings: UserSettings) => ActionResult<void>
  updateCoachConfig: (config: CoachProviderConfig) => ActionResult<void>
  coachConfig: CoachProviderConfig
  reportError: (error: AppActionError | string | null) => void
  requestTabChange: (nextTab: TabId) => void
  openCopyPrevious: () => void
  openInterventionSheet: () => void
  onDismissCoaching: () => void
  onChangeDayStatus: (status: CoachContextSnapshot['selectedDayStatus']) => void
  onApplyCoachingRecommendation: () => void
  networkStatus: NetworkStatus
}

export function useCoachController({
  selectedDate,
  selectedDayStatus,
  selectedDateTotals,
  settings,
  uiPrefs,
  weights,
  interventions,
  coachingInsight,
  logsByDate,
  getDayStatus,
  buildSnapshot,
  queueQuestion,
  answerQuestionWithProof,
  cutOsSurface,
  updateUiPrefs,
  updateSettings,
  updateCoachConfig,
  coachConfig,
  reportError,
  requestTabChange,
  openCopyPrevious,
  openInterventionSheet,
  onDismissCoaching,
  onChangeDayStatus,
  onApplyCoachingRecommendation,
  networkStatus,
}: UseCoachControllerOptions) {
  const recentInterventions = useMemo(() => interventions, [interventions])

  function buildCoachContextSnapshot(): CoachContextSnapshot {
    const recentDates = Array.from({ length: 30 }, (_, index) => addDays(selectedDate, -index)).reverse()
    const recentDailyCalories = recentDates.map((date) => {
      const dailyEntries = logsByDate[date] ?? []
      const totals = sumNutrition(
        dailyEntries.map((entry) => calculateFoodNutrition(entry.snapshot, entry.servings)),
      )
      return {
        date,
        calories: totals.calories,
        protein: totals.protein,
      }
    })

    const recentWeights = weights
      .filter((entry) => recentDates.includes(entry.date))
      .map((entry) => ({
        date: entry.date,
        weight: entry.weight,
        unit: entry.unit,
      }))

    const recentDayStates = recentDates.flatMap((date) => {
      const status = getDayStatus(date)
      return status === 'unmarked'
        ? []
        : [
            {
              date,
              status,
              updatedAt: new Date().toISOString(),
            },
          ]
    })

    return buildSnapshot({
      generatedAt: new Date().toISOString(),
      selectedDate,
      goalMode: settings.goalMode,
      settings: {
        calorieTarget: settings.calorieTarget,
        proteinTarget: settings.proteinTarget,
        carbTarget: settings.carbTarget,
        fatTarget: settings.fatTarget,
        weightUnit: settings.weightUnit,
        goalMode: settings.goalMode,
        coachingEnabled: settings.coachingEnabled,
        askCoachEnabled: settings.askCoachEnabled,
        shareInterventionsWithCoach: settings.shareInterventionsWithCoach,
      },
      selectedDayStatus,
      selectedDayTotals: selectedDateTotals,
      recentDailyCalories,
      recentWeights,
      recentDayStates,
      recentInterventions:
        settings.shareInterventionsWithCoach === false
          ? []
          : recentInterventions.filter((entry) => recentDates.includes(entry.date)),
      coachingInsight,
      recentThreadSummary: [],
    })
  }

  function handleCoachQuestion(question: string, mode: typeof uiPrefs.preferredAskCoachMode): void {
    const snapshot = buildCoachContextSnapshot()
    const localProofEnabled = FEATURE_FLAGS.coachProofDefaultV2 || FEATURE_FLAGS.coachProofAnswerV1
    const result = localProofEnabled
      ? answerQuestionWithProof(question, mode, snapshot, cutOsSurface)
      : queueQuestion(question, mode, snapshot)
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function handleCoachProposal(proposal: CoachActionProposal): void {
    switch (proposal.type) {
      case 'dismissCoachingSuggestion':
        onDismissCoaching()
        break
      case 'openCopyPrevious':
        requestTabChange('log')
        openCopyPrevious()
        break
      case 'openInterventionLog':
        requestTabChange('log')
        openInterventionSheet()
        break
      case 'setDayStatus':
        if (
          proposal.payload?.status === 'complete' ||
          proposal.payload?.status === 'partial' ||
          proposal.payload?.status === 'fasting' ||
          proposal.payload?.status === 'unmarked'
        ) {
          onChangeDayStatus(proposal.payload.status)
        }
        break
      case 'applyCalorieTarget':
        if (typeof proposal.payload?.calorieTarget === 'number') {
          const result = updateSettings({
            ...settings,
            calorieTarget: proposal.payload.calorieTarget,
          })
          if (!result.ok) {
            reportError(result.error)
            return
          }
          reportError(null)
          break
        }
        onApplyCoachingRecommendation()
        break
      case 'applyMacroTargets':
        if (
          typeof proposal.payload?.proteinTarget === 'number' &&
          typeof proposal.payload?.carbTarget === 'number' &&
          typeof proposal.payload?.fatTarget === 'number'
        ) {
          const result = updateSettings({
            ...settings,
            proteinTarget: proposal.payload.proteinTarget,
            carbTarget: proposal.payload.carbTarget,
            fatTarget: proposal.payload.fatTarget,
          })
          if (!result.ok) {
            reportError(result.error)
            return
          }
          reportError(null)
        }
        break
      default:
        requestTabChange('coach')
    }
  }

  function handleChangePreferredMode(mode: UiPrefs['preferredAskCoachMode']): void {
    const result = updateUiPrefs({
      ...uiPrefs,
      preferredAskCoachMode: mode,
    })
    if (!result.ok) {
      reportError(result.error)
      return
    }
    reportError(null)
  }

  function handleToggleCitationsExpanded(nextValue: boolean): void {
    const prefsResult = updateUiPrefs({
      ...uiPrefs,
      coachCitationsExpanded: nextValue,
    })
    if (!prefsResult.ok) {
      reportError(prefsResult.error)
      return
    }

    const settingsResult = updateSettings({
      ...settings,
      coachCitationsExpanded: nextValue,
    })
    if (!settingsResult.ok) {
      reportError(settingsResult.error)
      return
    }

    reportError(null)
  }

  function handleSetProvider(provider: CoachProviderConfig['provider']): void {
    const result = updateCoachConfig({
      ...coachConfig,
      provider,
      configuredAt: provider === 'none' ? undefined : new Date().toISOString(),
      autoSendQueuedWhenOnline: uiPrefs.coachAutoSendQueuedWhenOnline,
    })
    if (!result.ok) {
      reportError(result.error)
      return
    }
    reportError(null)
  }

  return {
    coachAvailabilityNote:
      networkStatus === 'offline'
        ? 'offline'
        : FEATURE_FLAGS.coachProofDefaultV2 || coachConfig.provider !== 'none'
          ? 'ready'
          : 'notConfigured',
    handleCoachQuestion,
    handleCoachProposal,
    handleChangePreferredMode,
    handleToggleCitationsExpanded,
    handleSetProvider,
  }
}
