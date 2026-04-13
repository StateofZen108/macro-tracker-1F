import { useEffect, useMemo, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { BulkModeSelector, type BulkActionMode } from './BulkModeSelector'
import { CollisionPreviewCard, type CollisionPreview } from './CollisionPreviewCard'
import { addDays, formatDisplayDate } from '../utils/dates'
import { MEAL_LABELS, MEAL_TYPES, type ActionResult, type MealType } from '../types'

interface CopyPreviousSheetProps {
  open: boolean
  currentDate: string
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onCopyPreviousDay: (payload?: {
    sourceDate?: string
    mode?: BulkActionMode
  }) => ActionResult<{ count: number }>
  onCopyMeal: (payload: {
    sourceDate: string
    sourceMeal: MealType
    targetMeal: MealType
    mode?: BulkActionMode
  }) => ActionResult<{ count: number }>
  getPreviousDayPreview?: (payload: {
    sourceDate: string
    currentDate: string
    mode: BulkActionMode
  }) => CollisionPreview | null
  getMealPreview?: (payload: {
    sourceDate: string
    currentDate: string
    sourceMeal: MealType
    targetMeal: MealType
    mode: BulkActionMode
  }) => CollisionPreview | null
}

interface CopyFormState {
  sourceDate: string
  sourceMeal: MealType
  targetMeal: MealType
  previousDayMode: BulkActionMode
  mealMode: BulkActionMode
}

function buildInitialState(currentDate: string): CopyFormState {
  return {
    sourceDate: addDays(currentDate, -1),
    sourceMeal: 'breakfast',
    targetMeal: 'breakfast',
    previousDayMode: 'append',
    mealMode: 'append',
  }
}

function isDirtyState(currentState: CopyFormState, initialState: CopyFormState): boolean {
  return (
    currentState.sourceDate !== initialState.sourceDate ||
    currentState.sourceMeal !== initialState.sourceMeal ||
    currentState.targetMeal !== initialState.targetMeal ||
    currentState.previousDayMode !== initialState.previousDayMode ||
    currentState.mealMode !== initialState.mealMode
  )
}

function CopyPreviousSheetContent({
  open,
  currentDate,
  onClose,
  onDirtyChange,
  onCopyPreviousDay,
  onCopyMeal,
  getPreviousDayPreview,
  getMealPreview,
}: CopyPreviousSheetProps) {
  const initialState = useMemo(() => buildInitialState(currentDate), [currentDate])
  const [formState, setFormState] = useState<CopyFormState>(initialState)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'day' | 'meal'>('day')

  const isDirty = useMemo(() => isDirtyState(formState, initialState), [formState, initialState])

  const previousDayPreview = useMemo(
    () =>
      getPreviousDayPreview?.({
        sourceDate: addDays(currentDate, -1),
        currentDate,
        mode: formState.previousDayMode,
      }) ?? null,
    [currentDate, formState.previousDayMode, getPreviousDayPreview],
  )

  const mealPreview = useMemo(
    () =>
      getMealPreview?.({
        sourceDate: formState.sourceDate,
        currentDate,
        sourceMeal: formState.sourceMeal,
        targetMeal: formState.targetMeal,
        mode: formState.mealMode,
      }) ?? null,
    [currentDate, formState.mealMode, formState.sourceDate, formState.sourceMeal, formState.targetMeal, getMealPreview],
  )

  useEffect(() => {
    onDirtyChange?.(open ? isDirty : false)
  }, [isDirty, onDirtyChange, open])

  function updateField<K extends keyof CopyFormState>(field: K, value: CopyFormState[K]): void {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }))
    setErrorMessage(null)
  }

  return (
    <BottomSheet
      open={open}
      title="Copy previous"
      description="Preview how copied items land before you apply them."
      onClose={onClose}
      isDirty={isDirty}
      discardMessage="Your copy settings will be lost if you close this sheet."
    >
      <div className="space-y-4">
        <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
              activeSection === 'day'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
            onClick={() => setActiveSection('day')}
          >
            Whole day
          </button>
          <button
            type="button"
            className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
              activeSection === 'meal'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
            onClick={() => setActiveSection('meal')}
          >
            Single meal
          </button>
        </div>

        {activeSection === 'day' ? (
          <section className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                Previous day
              </p>
              <p className="font-display text-xl text-slate-900 dark:text-white">
                Copy {formatDisplayDate(addDays(currentDate, -1))}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Move yesterday forward into {formatDisplayDate(currentDate)} without guessing what will be replaced.
              </p>
            </div>

            <BulkModeSelector
              value={formState.previousDayMode}
              onChange={(mode) => updateField('previousDayMode', mode)}
              title="How should yesterday land?"
              appendDescription="Keep today's entries and add yesterday's meals under them."
              replaceDescription="Replace the current day meal-by-meal with yesterday's entries."
            />

            <CollisionPreviewCard
              mode={formState.previousDayMode}
              preview={previousDayPreview}
              title="Day collision preview"
              appendFallback="Appending keeps today's logged items and layers yesterday on top of them."
              replaceFallback="Replacing swaps the current day out for yesterday's meals."
            />

            <button
              type="button"
              className="action-button w-full"
              onClick={() => {
                const result = onCopyPreviousDay({
                  sourceDate: addDays(currentDate, -1),
                  mode: formState.previousDayMode,
                })
                if (!result.ok) {
                  setErrorMessage(result.error.message)
                  return
                }

                setErrorMessage(null)
                if (result.data.count > 0) {
                  onClose()
                }
              }}
            >
              {formState.previousDayMode === 'append' ? 'Append previous day' : 'Replace with previous day'}
            </button>
          </section>
        ) : (
          <section className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                Single meal
              </p>
              <p className="font-display text-xl text-slate-900 dark:text-white">Copy one meal only</p>
            </div>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Source date
              <input
                type="date"
                className="field mt-2"
                value={formState.sourceDate}
                max={currentDate}
                onChange={(event) => updateField('sourceDate', event.target.value)}
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Source meal</p>
              <div className="grid grid-cols-2 gap-2">
                {MEAL_TYPES.map((meal) => (
                  <button
                    key={meal}
                    type="button"
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      formState.sourceMeal === meal
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() => updateField('sourceMeal', meal)}
                  >
                    {MEAL_LABELS[meal]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Target meal</p>
              <div className="grid grid-cols-2 gap-2">
                {MEAL_TYPES.map((meal) => (
                  <button
                    key={meal}
                    type="button"
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      formState.targetMeal === meal
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() => updateField('targetMeal', meal)}
                  >
                    {MEAL_LABELS[meal]}
                  </button>
                ))}
              </div>
            </div>

            <BulkModeSelector
              value={formState.mealMode}
              onChange={(mode) => updateField('mealMode', mode)}
              title="How should this meal land?"
              appendDescription="Keep the destination meal and add the copied items under it."
              replaceDescription="Clear the destination meal first, then copy this meal in."
            />

            <CollisionPreviewCard
              mode={formState.mealMode}
              preview={mealPreview}
              title="Meal collision preview"
              appendFallback="Appending keeps the destination meal and adds the selected source items after it."
              replaceFallback="Replacing clears the destination meal before the source items are copied in."
            />

            <button
              type="button"
              className="action-button w-full"
              onClick={() => {
                const result = onCopyMeal({
                  sourceDate: formState.sourceDate,
                  sourceMeal: formState.sourceMeal,
                  targetMeal: formState.targetMeal,
                  mode: formState.mealMode,
                })
                if (!result.ok) {
                  setErrorMessage(result.error.message)
                  return
                }

                setErrorMessage(null)
                if (result.data.count > 0) {
                  onClose()
                }
              }}
            >
              {formState.mealMode === 'append' ? 'Append selected meal' : 'Replace target meal'}
            </button>
          </section>
        )}

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}

export function CopyPreviousSheet(props: CopyPreviousSheetProps) {
  const resetKey = `${props.currentDate}-${props.open ? 'open' : 'closed'}`
  return <CopyPreviousSheetContent key={resetKey} {...props} />
}
