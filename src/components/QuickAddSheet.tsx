import { useEffect, useMemo, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { MEAL_LABELS, MEAL_TYPES, type ActionResult, type MealType } from '../types'

interface QuickAddSheetProps {
  open: boolean
  defaultMeal: MealType
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onSubmit: (payload: {
    meal: MealType
    name: string
    calories: number
    protein: number
    carbs: number
    fat: number
  }) => ActionResult<unknown>
}

interface QuickAddFormState {
  meal: MealType
  name: string
  calories: string
  protein: string
  carbs: string
  fat: string
}

function buildInitialState(defaultMeal: MealType): QuickAddFormState {
  return {
    meal: defaultMeal,
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  }
}

function parseRequiredNumber(label: string, value: string): number {
  const parsedValue = Number.parseFloat(value)
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${label} must be a valid number.`)
  }

  return parsedValue
}

export function QuickAddSheet({
  open,
  defaultMeal,
  onClose,
  onDirtyChange,
  onSubmit,
}: QuickAddSheetProps) {
  const initialState = useMemo(() => buildInitialState(defaultMeal), [defaultMeal])
  const [formState, setFormState] = useState<QuickAddFormState>(initialState)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isDirty = useMemo(
    () => JSON.stringify(formState) !== JSON.stringify(initialState),
    [formState, initialState],
  )

  useEffect(() => {
    onDirtyChange?.(open ? isDirty : false)
  }, [isDirty, onDirtyChange, open])

  function updateField<K extends keyof QuickAddFormState>(field: K, value: QuickAddFormState[K]): void {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    try {
      const result = onSubmit({
        meal: formState.meal,
        name: formState.name.trim() || 'Quick Add',
        calories: parseRequiredNumber('Calories', formState.calories),
        protein: parseRequiredNumber('Protein', formState.protein),
        carbs: parseRequiredNumber('Carbs', formState.carbs),
        fat: parseRequiredNumber('Fat', formState.fat),
      })

      if (!result.ok) {
        setErrorMessage(result.error.message)
        return
      }

      setErrorMessage(null)
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Review the quick-add values.')
    }
  }

  return (
    <BottomSheet
      open={open}
      title="Quick Add"
      description="Log calories and macros directly without creating a reusable food."
      onClose={onClose}
      isDirty={isDirty}
      discardMessage="Your quick-add entry has unsaved values. Discard them and close this sheet?"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Meal</p>
          <div className="grid grid-cols-2 gap-2">
            {MEAL_TYPES.map((meal) => (
              <button
                key={meal}
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  formState.meal === meal
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
                onClick={() => updateField('meal', meal)}
              >
                {MEAL_LABELS[meal]}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Label (optional)
          <input
            className="field mt-2"
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Quick Add"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Calories
            <input
              className="field mt-2"
              inputMode="decimal"
              value={formState.calories}
              onChange={(event) => updateField('calories', event.target.value)}
              placeholder="300"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Protein (g)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={formState.protein}
              onChange={(event) => updateField('protein', event.target.value)}
              placeholder="25"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Carbs (g)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={formState.carbs}
              onChange={(event) => updateField('carbs', event.target.value)}
              placeholder="30"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Fat (g)
            <input
              className="field mt-2"
              inputMode="decimal"
              value={formState.fat}
              onChange={(event) => updateField('fat', event.target.value)}
              placeholder="10"
            />
          </label>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="submit" className="action-button flex-1">
            Log quick add
          </button>
          <button type="button" className="action-button-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </BottomSheet>
  )
}
