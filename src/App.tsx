import { FileText, LoaderCircle, MessageSquare, Scale, Settings2, TriangleAlert, Wifi, WifiOff, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useAppShell } from './app/useAppShell'
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
import { useActivityLog } from './hooks/useActivityLog'
import { useCoach } from './hooks/useCoach'
import { useCoaching } from './hooks/useCoaching'
import { useDayMeta } from './hooks/useDayMeta'
import { useDiagnostics } from './hooks/useDiagnostics'
import { useFavoriteFoods } from './hooks/useFavoriteFoods'
import { useFoodLog } from './hooks/useFoodLog'
import { useFoods } from './hooks/useFoods'
import { useInterventions } from './hooks/useInterventions'
import { useMealTemplates } from './hooks/useMealTemplates'
import { useRecipes } from './hooks/useRecipes'
import { useSettings } from './hooks/useSettings'
import { useSync } from './hooks/useSync'
import { useUiPrefs } from './hooks/useUiPrefs'
import { useWeeklyCheckIns } from './hooks/useWeeklyCheckIns'
import { useWeights } from './hooks/useWeights'
import { LogScreen } from './screens/LogScreen'
import type { ActionResult, DayStatus, FoodLogEntry, MealType, TabId } from './types'
import { FEATURE_FLAGS } from './config/featureFlags'
import { initializeDiagnosticsPersistence } from './utils/diagnostics'
import { recordDiagnosticsEvent } from './utils/diagnostics'
import { getNutrientAmountV1 } from './domain/nutrition'
import { buildManualOverrideDecisionRecord } from './domain/coaching'
import { calculateFoodNutrition, sumNutrition } from './utils/macros'
import { appendCoachingDecision } from './utils/storage/coachDecisions'
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

function renderLazyFallback(message: string) {
  return <div className="app-card px-4 py-6 text-sm text-slate-600 dark:text-slate-300">{message}</div>
}

function AppContent() {
  const appChromeStyles = { '--app-bottom-clearance': 'calc(env(safe-area-inset-bottom) + 8.5rem)' } as CSSProperties

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

  const {
    foods,
    createFood,
    updateFood,
    archiveFood,
    restoreFood,
    purgeFood,
    searchFoods,
    getQuickFoods,
    findDuplicateFood,
    getFoodReferenceCount,
  } = useFoods()
  const allLogsByDate = loadAllFoodLogs()
  const { settings, updateSettings } = useSettings()
  const sync = useSync()
  const diagnostics = useDiagnostics()
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
  const coachingInsight = useCoaching(settings, weights, recoveryIssues.length)
  const {
    currentCheckIn,
    canApplyTargets: canApplyCheckInTargets,
    checkInHistory,
    coachingDecisionHistory,
    markApplied,
    markKept,
  } = useWeeklyCheckIns(settings, weights, recoveryIssues.length)
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
  const visibleSavedMeals = FEATURE_FLAGS.savedMeals
    ? templates.filter((template) => !template.archivedAt)
    : []
  const visibleFavorites = FEATURE_FLAGS.favoriteFoods ? favorites : []
  const visibleRecipes = FEATURE_FLAGS.recipes ? recipes : []
  const selectedDateTotals = sumNutrition(
    entries.map((entry) => calculateFoodNutrition(entry.snapshot, entry.servings)),
  )
  const recommendationDismissed = settings.coachingDismissedAt?.slice(0, 10) === selectedDate
  const hasGlobalRecoveryBanner = Boolean(initializationError || recoveryIssues.length)
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

  function handleManualSettingsUpdate(nextSettings: typeof settings): ActionResult<void> {
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
        buildSelectedDateTimestamp(),
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
    settings,
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
                initializationError={initializationError}
                getFoodReferenceCount={getFoodReferenceCount}
                onUpdateSettings={handleManualSettingsUpdate}
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
            onToggleFavoriteFood={
              FEATURE_FLAGS.favoriteFoods ? (foodId) => toggleFavorite(foodId) : undefined
            }
            onConfirmRecipe={FEATURE_FLAGS.recipes ? handleConfirmRecipe : undefined}
            onApplySavedMeal={FEATURE_FLAGS.savedMeals ? handleApplySavedMealFromSheet : undefined}
            onFindDuplicateFood={findDuplicateFood}
            searchFoods={searchFoods}
            getQuickFoods={getQuickFoods}
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
