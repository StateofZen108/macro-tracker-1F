import { Barcode, Beaker, Copy, Plus, Search, Settings2, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CoachingCard } from '../components/CoachingCard'
import { DailySummaryBar } from '../components/DailySummaryBar'
import { DateNavigator } from '../components/DateNavigator'
import { DayStatusCard } from '../components/DayStatusCard'
import { MealSection } from '../components/MealSection'
import { CutOsCommandCard } from '../components/cut-os/CutOsCommandCard'
import { DailyGuardrailStrip } from '../components/cut-os/DailyGuardrailStrip'
import type { RecentCombinationOption } from '../components/log/RecentCombinationsStrip'
import { FEATURE_FLAGS } from '../config/featureFlags'
import type {
  ActionResult,
  ActivityDraft,
  ActivityEntry,
  CoachingInsight,
  CutDayPlan,
  DailyGuardrailRoute,
  CutOsActionTarget,
  CutOsSurfaceModel,
  DayConfounderMarker,
  DayStatus,
  Food,
  FavoriteFood,
  FoodLogEntry,
  InterventionEntry,
  MealTemplate,
  MealType,
  UserSettings,
} from '../types'
import { MEAL_TYPES } from '../types'
import { buildMealTotals, resolveLogEntries, sumNutrition } from '../utils/macros'
import { recordUiTelemetry } from '../utils/uiTelemetry'

interface LogScreenProps {
  date: string
  foods: Food[]
  entries: FoodLogEntry[]
  interventions: InterventionEntry[]
  dayStatus: DayStatus
  dayMarkers: DayConfounderMarker[]
  activityEntry: ActivityEntry | null
  templates: MealTemplate[]
  favoriteFoods: FavoriteFood[]
  recentCombinations: Record<MealType, RecentCombinationOption[]>
  coachingInsight: CoachingInsight
  recommendationDismissed: boolean
  settings: UserSettings
  cutDayPlan?: CutDayPlan | null
  cutOsSnapshot?: CutOsSurfaceModel | null
  onChangeDate: (date: string) => void
  onChangeDayStatus: (status: DayStatus) => void
  onToggleDayMarker: (marker: DayConfounderMarker) => void
  onSaveActivity: (draft: ActivityDraft) => ActionResult<unknown>
  onDeleteActivity: () => ActionResult<void>
  onOpenCoach: () => void
  onApplyCoachingRecommendation: () => void
  onKeepCurrentTarget: () => void
  onDismissCoaching: () => void
  onOpenQuickAdd: () => void
  onOpenCopyPrevious: () => void
  onOpenIntervention: () => void
  onEditIntervention: (interventionId: string) => void
  onDeleteIntervention: (interventionId: string) => void
  onOpenAddFood: (meal: MealType, options?: { initialMode?: 'browse' | 'scanner' | 'ocr' | 'custom' }) => void
  onAddFavoriteFood: (meal: MealType, foodId: string) => void
  onOpenTemplates: (meal: MealType) => void
  onSaveMealTemplate: (meal: MealType) => void
  onSaveRecipe: (meal: MealType) => void
  onApplyQuickTemplate: (templateId: string, meal: MealType) => void
  onApplyRecentCombination: (payload: { sourceDate: string; sourceMeal: MealType; targetMeal: MealType }) => void
  onEditEntry: (entryId: string) => void
  onAdjustEntryServings: (entryId: string, nextServings: number) => void
  onDeleteEntry: (entryId: string) => void
  onOpenSettings: () => void
  onActivateCutOsTarget?: (target: CutOsActionTarget) => void
}

const DEFAULT_COLLAPSED_STATE: Record<MealType, boolean> = {
  breakfast: true,
  lunch: true,
  dinner: true,
  snack: true,
}

function groupInterventions(entries: InterventionEntry[]): Array<{
  key: string
  name: string
  unit: string
  totalDose: number
  entries: InterventionEntry[]
}> {
  const groups = new Map<string, { name: string; unit: string; totalDose: number; entries: InterventionEntry[] }>()

  for (const entry of entries) {
    const key = `${entry.name.trim().toLowerCase()}|${entry.unit.trim().toLowerCase()}`
    const existingGroup = groups.get(key)
    if (existingGroup) {
      existingGroup.totalDose += entry.dose
      existingGroup.entries.push(entry)
      continue
    }

    groups.set(key, {
      name: entry.name,
      unit: entry.unit,
      totalDose: entry.dose,
      entries: [entry],
    })
  }

  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      ...value,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function formatDose(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, '')
}

interface ActivityCardProps {
  entry: ActivityEntry | null
  onSave: (draft: ActivityDraft) => ActionResult<unknown>
  onDelete: () => ActionResult<void>
}

function formatOptionalActivityNumber(value: number | undefined): string {
  return value === undefined ? '' : `${value}`
}

function buildActivityEntrySignature(entry: ActivityEntry | null): string {
  if (!entry) {
    return 'none'
  }

  return [
    entry.date,
    entry.steps ?? '',
    entry.cardioMinutes ?? '',
    entry.cardioType ?? '',
    entry.notes ?? '',
    entry.updatedAt,
    entry.deletedAt ?? '',
  ].join('|')
}

function ActivityCard({ entry, onSave, onDelete }: ActivityCardProps) {
  const [stepsInput, setStepsInput] = useState(formatOptionalActivityNumber(entry?.steps))
  const [cardioMinutesInput, setCardioMinutesInput] = useState(
    formatOptionalActivityNumber(entry?.cardioMinutes),
  )
  const [cardioType, setCardioType] = useState<ActivityDraft['cardioType']>(entry?.cardioType)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const lastSyncedEntrySignatureRef = useRef(buildActivityEntrySignature(entry))

  // Keep the draft inputs aligned when the active activity entry changes underneath the form.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const nextSignature = buildActivityEntrySignature(entry)
    if (lastSyncedEntrySignatureRef.current === nextSignature) {
      return
    }

    lastSyncedEntrySignatureRef.current = nextSignature
    setStepsInput(formatOptionalActivityNumber(entry?.steps))
    setCardioMinutesInput(formatOptionalActivityNumber(entry?.cardioMinutes))
    setCardioType(entry?.cardioType)
    setNotes(entry?.notes ?? '')
    setErrorMessage(null)
  }, [entry])
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSave(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const rawSteps = `${formData.get('steps') ?? ''}`.trim()
    const rawCardioMinutes = `${formData.get('cardioMinutes') ?? ''}`.trim()
    const rawCardioType = `${formData.get('cardioType') ?? ''}`.trim()
    const rawNotes = `${formData.get('notes') ?? ''}`
    const parsedSteps = rawSteps ? Number.parseInt(rawSteps, 10) : undefined
    const parsedCardioMinutes = rawCardioMinutes
      ? Number.parseInt(rawCardioMinutes, 10)
      : undefined
    const parsedCardioType =
      rawCardioType === 'walk' ||
      rawCardioType === 'incline_treadmill' ||
      rawCardioType === 'bike' ||
      rawCardioType === 'run' ||
      rawCardioType === 'other'
        ? rawCardioType
        : undefined

    if (rawSteps && (!Number.isFinite(parsedSteps) || (parsedSteps ?? 0) < 0)) {
      setErrorMessage('Enter valid daily steps before saving activity.')
      return
    }

    if (rawCardioMinutes && (!Number.isFinite(parsedCardioMinutes) || (parsedCardioMinutes ?? 0) < 0)) {
      setErrorMessage('Enter valid cardio minutes before saving activity.')
      return
    }

    const result = onSave({
      steps: parsedSteps,
      cardioMinutes: parsedCardioMinutes,
      cardioType: parsedCardioType,
      notes: rawNotes,
    })
    if (!result.ok) {
      setErrorMessage(result.error.message)
      return
    }

    setErrorMessage(null)
  }

  return (
    <section className="app-card space-y-2.5 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Activity</p>
        <p className="mt-1 font-display text-xl text-slate-900 dark:text-white sm:text-2xl">
          {entry ? 'Logged for this day' : 'Not logged yet'}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Manual steps and cardio feed weekly check-ins without device sync.
        </p>
      </div>

      <form className="space-y-2.5" onSubmit={handleSave}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Steps
            <input
              name="steps"
              className="field mt-2"
              inputMode="numeric"
              placeholder="Optional"
              value={stepsInput}
              onChange={(event) => setStepsInput(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Cardio minutes
            <input
              name="cardioMinutes"
              className="field mt-2"
              inputMode="numeric"
              placeholder="Optional"
              value={cardioMinutesInput}
              onChange={(event) => setCardioMinutesInput(event.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Cardio type
          <select
            name="cardioType"
            className="field mt-2"
            value={cardioType ?? ''}
            onChange={(event) =>
              setCardioType(
                event.target.value === '' ? undefined : (event.target.value as ActivityDraft['cardioType']),
              )
            }
          >
            <option value="">Optional</option>
            <option value="walk">Walk</option>
            <option value="incline_treadmill">Incline treadmill</option>
            <option value="bike">Bike</option>
            <option value="run">Run</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Note
          <textarea
            name="notes"
            className="field mt-2 min-h-[72px]"
            placeholder="Optional note"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="action-button min-h-[44px] flex-1">
            Save activity
          </button>
          <button
            type="button"
            className="action-button-secondary min-h-[44px] flex-1"
            disabled={!entry}
            onClick={() => {
              const result = onDelete()
              if (!result.ok) {
                setErrorMessage(result.error.message)
                return
              }

              setStepsInput('')
              setCardioMinutesInput('')
              setCardioType(undefined)
              setNotes('')
              setErrorMessage(null)
            }}
          >
            Clear activity
          </button>
        </div>
      </form>
    </section>
  )
}

interface FastLogToolbarProps {
  onOpenAddFood: (meal: MealType, options?: { initialMode?: 'browse' | 'scanner' | 'ocr' | 'custom' }) => void
  onOpenQuickAdd: () => void
  onOpenCopyPrevious: () => void
  onOpenSettings: () => void
}

function FastLogToolbar({
  onOpenAddFood,
  onOpenQuickAdd,
  onOpenCopyPrevious,
  onOpenSettings,
}: FastLogToolbarProps) {
  const isPremiumToolbar = FEATURE_FLAGS.premiumUiV1 && FEATURE_FLAGS.premiumFastLogToolbarV2
  const buttonClass =
    'flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition'
  const secondaryClass =
    'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'

  useEffect(() => {
    if (isPremiumToolbar) {
      recordUiTelemetry('ui.fast_log.v2_rendered', 'Premium fast log toolbar rendered')
    }
  }, [isPremiumToolbar])

  if (isPremiumToolbar) {
    const compactButtonClass =
      'flex min-h-[46px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-black/5 bg-white/70 px-2 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900'

    return (
      <section
        className="premium-action-surface space-y-2.5 px-3 py-3"
        aria-label="Fast logging"
        data-premium-surface="action"
      >
        <button
          type="button"
          data-testid="fast-log-primary-search"
          className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          onClick={() => onOpenAddFood('breakfast')}
        >
          <Search className="h-4 w-4" />
          Search food
        </button>
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            data-testid="fast-log-scan"
            className={compactButtonClass}
            onClick={() => onOpenAddFood('breakfast', { initialMode: 'scanner' })}
          >
            <Barcode className="h-4 w-4" />
            <span className="truncate">Scan</span>
          </button>
          <button
            type="button"
            data-testid="fast-log-quick-add"
            aria-label="Quick add"
            className={compactButtonClass}
            onClick={onOpenQuickAdd}
          >
            <Zap className="h-4 w-4" />
            <span className="truncate">Quick</span>
          </button>
          <button
            type="button"
            data-testid="fast-log-copy"
            aria-label="Copy previous"
            className={compactButtonClass}
            onClick={onOpenCopyPrevious}
          >
            <Copy className="h-4 w-4" />
            <span className="truncate">Copy</span>
          </button>
          <button
            type="button"
            data-testid="fast-log-custom"
            className={compactButtonClass}
            onClick={() => onOpenAddFood('breakfast', { initialMode: 'custom' })}
          >
            <Plus className="h-4 w-4" />
            <span className="truncate">Custom</span>
          </button>
        </div>
        <button
          type="button"
          className="inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-xl bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          onClick={onOpenSettings}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Logging settings
        </button>
      </section>
    )
  }

  return (
    <section className="app-card space-y-3 px-3 py-3" aria-label="Fast logging">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <button
          type="button"
          data-testid="fast-log-primary-search"
          className={`${buttonClass} bg-teal-700 text-white sm:col-span-2`}
          onClick={() => onOpenAddFood('breakfast')}
        >
          <Search className="h-4 w-4" />
          Search food
        </button>
        <button
          type="button"
          data-testid="fast-log-scan"
          className={`${buttonClass} ${secondaryClass}`}
          onClick={() => onOpenAddFood('breakfast', { initialMode: 'scanner' })}
        >
          <Barcode className="h-4 w-4" />
          Scan
        </button>
        <button
          type="button"
          data-testid="fast-log-quick-add"
          className={`${buttonClass} ${secondaryClass}`}
          onClick={onOpenQuickAdd}
        >
          <Zap className="h-4 w-4" />
          Quick add
        </button>
        <button
          type="button"
          data-testid="fast-log-copy"
          className={`${buttonClass} ${secondaryClass}`}
          onClick={onOpenCopyPrevious}
        >
          <Copy className="h-4 w-4" />
          Copy previous
        </button>
        <button
          type="button"
          data-testid="fast-log-custom"
          className={`${buttonClass} ${secondaryClass}`}
          onClick={() => onOpenAddFood('breakfast', { initialMode: 'custom' })}
        >
          <Plus className="h-4 w-4" />
          Custom
        </button>
      </div>
      <button
        type="button"
        className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
        onClick={onOpenSettings}
      >
        <Settings2 className="h-4 w-4" />
        Logging settings
      </button>
    </section>
  )
}

export function LogScreen({
  date,
  foods,
  entries,
  interventions,
  dayStatus,
  dayMarkers,
  activityEntry,
  templates,
  favoriteFoods,
  recentCombinations,
  coachingInsight,
  recommendationDismissed,
  settings,
  cutDayPlan = null,
  cutOsSnapshot = null,
  onChangeDate,
  onChangeDayStatus,
  onToggleDayMarker,
  onSaveActivity,
  onDeleteActivity,
  onOpenCoach,
  onApplyCoachingRecommendation,
  onKeepCurrentTarget,
  onDismissCoaching,
  onOpenQuickAdd,
  onOpenCopyPrevious,
  onOpenIntervention,
  onEditIntervention,
  onDeleteIntervention,
  onOpenAddFood,
  onAddFavoriteFood,
  onOpenTemplates,
  onSaveMealTemplate,
  onSaveRecipe,
  onApplyQuickTemplate,
  onApplyRecentCombination,
  onEditEntry,
  onAdjustEntryServings,
  onDeleteEntry,
  onOpenSettings,
  onActivateCutOsTarget,
}: LogScreenProps) {
  const stickyRef = useRef<HTMLDivElement | null>(null)
  const previousMealCountsRef = useRef<Record<MealType, number>>({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  })
  const [collapsedMeals, setCollapsedMeals] = useState<Record<MealType, boolean>>(DEFAULT_COLLAPSED_STATE)
  const [stickyHeight, setStickyHeight] = useState(0)
  const stickyOffset = 12
  const premiumUiEnabled = FEATURE_FLAGS.premiumUiV1

  useEffect(() => {
    if (premiumUiEnabled) {
      recordUiTelemetry('ui.premium.rendered', 'Premium Log UI rendered')
    }
  }, [premiumUiEnabled])

  useEffect(() => {
    if (premiumUiEnabled) {
      recordUiTelemetry('ui.summary.date_changed', 'Log summary date changed')
    }
  }, [date, premiumUiEnabled])

  useEffect(() => {
    if (!stickyRef.current) {
      return
    }

    const updateStickyHeight = () => {
      const nextHeight = Math.ceil(stickyRef.current?.getBoundingClientRect().height ?? 0)
      setStickyHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight))
    }

    updateStickyHeight()
    const resizeObserver = new ResizeObserver(() => {
      updateStickyHeight()
    })
    resizeObserver.observe(stickyRef.current)
    window.addEventListener('resize', updateStickyHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateStickyHeight)
    }
  }, [])

  const resolvedEntries = resolveLogEntries(entries, foods)
  const groupedEntries = useMemo(() => {
    return {
      breakfast: resolvedEntries.filter((entry) => entry.meal === 'breakfast'),
      lunch: resolvedEntries.filter((entry) => entry.meal === 'lunch'),
      dinner: resolvedEntries.filter((entry) => entry.meal === 'dinner'),
      snack: resolvedEntries.filter((entry) => entry.meal === 'snack'),
    }
  }, [resolvedEntries])
  const favoriteFoodIds = useMemo(
    () => new Set(favoriteFoods.filter((favorite) => !favorite.deletedAt).map((favorite) => favorite.foodId)),
    [favoriteFoods],
  )
  const favoriteFoodRecords = useMemo(
    () =>
      foods
        .filter((food) => !food.archivedAt && favoriteFoodIds.has(food.id))
        .sort((left, right) => (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? ''))
        .slice(0, 6),
    [favoriteFoodIds, foods],
  )
  const mealTotals = buildMealTotals(groupedEntries)
  const dailyTotals = sumNutrition(resolvedEntries.map((entry) => entry.nutrition))
  const interventionGroups = useMemo(() => groupInterventions(interventions), [interventions])
  const primaryMeals: MealType[] = ['breakfast']
  const secondaryMeals = MEAL_TYPES.filter((meal) => meal !== 'breakfast')
  const dailyGuardrailModel =
    FEATURE_FLAGS.dailyGuardrailsV1 && cutOsSnapshot?.dailyGuardrails
      ? cutOsSnapshot.dailyGuardrails
      : null
  const hasBlockingTrustRepair = dailyGuardrailModel?.trustRepairs.some(
    (task) => task.status === 'open' && task.blockingCoachProof,
  )
  const hasActionableGuardrail = dailyGuardrailModel?.guardrails.some(
    (guardrail) =>
      guardrail.severity === 'block' &&
      guardrail.id.startsWith('food-verdict:') === false &&
      guardrail.id.startsWith('weight-stale:') === false,
  )
  const hasFoodProofGuardrail = dailyGuardrailModel?.guardrails.some((guardrail) =>
    guardrail.id.startsWith('food-verdict:'),
  )
  const shouldShowDailyGuardrail =
    dailyGuardrailModel !== null &&
    (dailyGuardrailModel.surfaceConsistency.status === 'mismatch' ||
      hasBlockingTrustRepair === true ||
      (hasFoodProofGuardrail === true && resolvedEntries.length > 0) ||
      hasActionableGuardrail === true)

  function handleDailyGuardrailRoute(route: DailyGuardrailRoute, targetId?: string): void {
    if (route === 'coach') {
      onOpenCoach()
      return
    }

    if (route === 'settings') {
      onOpenSettings()
      return
    }

    if (route === 'log') {
      if (targetId) {
        setCollapsedMeals((currentState) => ({
          ...currentState,
          breakfast: false,
          lunch: false,
          dinner: false,
          snack: false,
        }))
        window.setTimeout(() => {
          document.querySelector(`[data-entry-id="${CSS.escape(targetId)}"]`)?.scrollIntoView({
            block: 'center',
            behavior: 'smooth',
          })
        }, 0)
        return
      }

      onOpenAddFood('breakfast')
      return
    }

    if (route === 'weight' || route === 'workouts') {
      onActivateCutOsTarget?.(route === 'weight' ? 'weigh_in' : 'train')
    }
  }

  useEffect(() => {
    const nextCounts = {
      breakfast: groupedEntries.breakfast.length,
      lunch: groupedEntries.lunch.length,
      dinner: groupedEntries.dinner.length,
      snack: groupedEntries.snack.length,
    }
    const mealsWithNewEntries = MEAL_TYPES.filter(
      (meal) => nextCounts[meal] > previousMealCountsRef.current[meal],
    )

    if (mealsWithNewEntries.length > 0) {
      setCollapsedMeals((currentState) => {
        let didChange = false
        const nextState = { ...currentState }

        for (const meal of mealsWithNewEntries) {
          if (currentState[meal]) {
            nextState[meal] = false
            didChange = true
          }
        }

        return didChange ? nextState : currentState
      })
    }

    previousMealCountsRef.current = nextCounts
  }, [groupedEntries])

  return (
    <div className="relative">
      <div
        ref={stickyRef}
        data-log-sticky="true"
        className="pointer-events-none sticky top-[calc(env(safe-area-inset-top)+0.25rem)] z-30 space-y-3 pb-3"
      >
        <div className="pointer-events-auto">
          <DateNavigator
            date={date}
            onChange={onChangeDate}
            trailingAction={
              <button
                type="button"
                className="icon-button h-10 w-10 rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl"
                onClick={onOpenSettings}
                aria-label="Settings"
              >
                <Settings2 className="h-5 w-5" />
              </button>
            }
          />
        </div>
        <div className="pointer-events-none">
          <DailySummaryBar totals={dailyTotals} settings={settings} />
        </div>
      </div>

      <div
        className="space-y-4"
        style={{
          paddingBottom: 'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 7.5rem))',
        }}
      >
        <FastLogToolbar
          onOpenAddFood={onOpenAddFood}
          onOpenQuickAdd={onOpenQuickAdd}
          onOpenCopyPrevious={onOpenCopyPrevious}
          onOpenSettings={onOpenSettings}
        />

        {shouldShowDailyGuardrail ? (
          <DailyGuardrailStrip model={dailyGuardrailModel} onActivateRoute={handleDailyGuardrailRoute} />
        ) : null}

        {cutOsSnapshot &&
        cutOsSnapshot.command.state !== 'setup_required' &&
        cutOsSnapshot.command.state !== 'collecting_proof' ? (
          <CutOsCommandCard
            model={cutOsSnapshot}
            surface="log"
            compact
            showProofs={cutOsSnapshot.diagnosis.phaseVerdict !== 'standard_cut' || cutOsSnapshot.command.state === 'blocked'}
            showSetup={false}
            onActivateTarget={
              onActivateCutOsTarget ??
              ((target) => {
                if (target === 'coach') {
                  onOpenCoach()
                  return
                }
                if (target === 'phase' || target === 'settings') {
                  onOpenSettings()
                  return
                }
                onOpenAddFood('breakfast')
              })
            }
          />
        ) : null}

        {primaryMeals.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={groupedEntries[meal]}
            templates={templates.filter((template) => template.defaultMeal === meal)}
            favoriteFoods={favoriteFoodRecords}
            recentCombinations={recentCombinations[meal] ?? []}
            totals={mealTotals[meal]}
            collapsed={collapsedMeals[meal]}
            onToggle={() =>
              setCollapsedMeals((currentState) => ({
                ...currentState,
                [meal]: !currentState[meal],
              }))
            }
            onAddFood={() => onOpenAddFood(meal)}
            onAddFavoriteFood={(foodId) => onAddFavoriteFood(meal, foodId)}
            onApplyTemplate={(templateId) => onApplyQuickTemplate(templateId, meal)}
                onApplyRecentCombination={(sourceDate) =>
                  onApplyRecentCombination({ sourceDate, sourceMeal: meal, targetMeal: meal })
                }
                onBrowseTemplates={() => onOpenTemplates(meal)}
                onSaveTemplate={() => onSaveMealTemplate(meal)}
                onSaveRecipe={() => onSaveRecipe(meal)}
                onEditEntry={onEditEntry}
                onAdjustEntryServings={onAdjustEntryServings}
                onDeleteEntry={onDeleteEntry}
                trustRepairs={dailyGuardrailModel?.trustRepairs}
          />
        ))}

        {secondaryMeals.map((meal) => (
          <MealSection
            key={meal}
            meal={meal}
            entries={groupedEntries[meal]}
            templates={templates.filter((template) => template.defaultMeal === meal)}
            favoriteFoods={favoriteFoodRecords}
            recentCombinations={recentCombinations[meal] ?? []}
            totals={mealTotals[meal]}
            collapsed={collapsedMeals[meal]}
            onToggle={() =>
              setCollapsedMeals((currentState) => ({
                ...currentState,
                [meal]: !currentState[meal],
              }))
            }
            onAddFood={() => onOpenAddFood(meal)}
            onAddFavoriteFood={(foodId) => onAddFavoriteFood(meal, foodId)}
            onApplyTemplate={(templateId) => onApplyQuickTemplate(templateId, meal)}
            onApplyRecentCombination={(sourceDate) =>
              onApplyRecentCombination({ sourceDate, sourceMeal: meal, targetMeal: meal })
            }
            onBrowseTemplates={() => onOpenTemplates(meal)}
            onSaveTemplate={() => onSaveMealTemplate(meal)}
            onEditEntry={onEditEntry}
            onAdjustEntryServings={onAdjustEntryServings}
            onDeleteEntry={onDeleteEntry}
            trustRepairs={dailyGuardrailModel?.trustRepairs}
          />
        ))}

        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{
            scrollMarginTop: `${stickyHeight + stickyOffset + 16}px`,
          }}
        >
          <button type="button" className="action-button-secondary w-full gap-2" onClick={onOpenIntervention}>
            <Beaker className="h-4 w-4" />
            Log intervention
          </button>
          <button type="button" className="action-button-secondary w-full" onClick={onOpenCoach}>
            Ask coach
          </button>
        </div>

        <div
          style={{
            scrollMarginTop: `${stickyHeight + stickyOffset + 16}px`,
          }}
        >
          <DayStatusCard
            status={dayStatus}
            markers={dayMarkers}
            onChange={onChangeDayStatus}
            onToggleMarker={onToggleDayMarker}
          />
        </div>

        <div
          style={{
            scrollMarginTop: `${stickyHeight + stickyOffset + 16}px`,
          }}
        >
          <ActivityCard
            key={`${date}-${activityEntry?.updatedAt ?? 'empty'}`}
            entry={activityEntry}
            onSave={onSaveActivity}
            onDelete={onDeleteActivity}
          />
        </div>

        {cutDayPlan ? (
          <section className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Cut day
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {cutDayPlan.macroIntentLabel}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{cutDayPlan.whyToday}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {cutDayPlan.dayType.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="mt-3 rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              Training intent: {cutDayPlan.trainingIntentLabel}
            </div>
          </section>
        ) : null}

        <section
          className="app-card space-y-4 px-4 py-4"
          style={{
            scrollMarginTop: `${stickyHeight + stickyOffset + 16}px`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                Interventions today
              </p>
              <p className="mt-1 font-display text-2xl text-slate-900 dark:text-white">
                {interventions.length ? `${interventions.length} logged` : 'None logged'}
              </p>
            </div>
            <button type="button" className="action-button-secondary" onClick={onOpenIntervention}>
              Add
            </button>
          </div>

          {interventionGroups.length ? (
            <div className="space-y-3">
              {interventionGroups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{group.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-300">
                        {formatDose(group.totalDose)} {group.unit} total
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      {group.entries.length} entr{group.entries.length === 1 ? 'y' : 'ies'}
                    </p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-800/70"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            className="flex-1 text-left"
                            onClick={() => onEditIntervention(entry.id)}
                          >
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {formatDose(entry.dose)} {entry.unit}
                              {entry.takenAt ? ` • ${entry.takenAt}` : ''}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-300">
                              {entry.category}
                              {entry.route ? ` • ${entry.route}` : ''}
                              {entry.notes ? ` • ${entry.notes}` : ''}
                            </p>
                          </button>
                          <button
                            type="button"
                            className="text-sm font-semibold text-rose-700 dark:text-rose-300"
                            onClick={() => onDeleteIntervention(entry.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-4 text-left transition hover:bg-teal-100/70 dark:border-teal-500/40 dark:bg-teal-500/10 dark:hover:bg-teal-500/20"
              onClick={onOpenIntervention}
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Log your first intervention</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Track supplements or compounds separately from calories and macros.
                </p>
              </div>
              <Beaker className="h-5 w-5 text-teal-700 dark:text-teal-300" />
            </button>
          )}
        </section>

        <CoachingCard
          insight={coachingInsight}
          settings={settings}
          recommendationDismissed={recommendationDismissed}
          onOpenCoach={onOpenCoach}
          onApplyRecommendation={onApplyCoachingRecommendation}
          onKeepCurrent={onKeepCurrentTarget}
          onDismiss={onDismissCoaching}
        />
      </div>
    </div>
  )
}
