import { useEffect, useMemo, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { TemplateSummaryCard } from './TemplateSummaryCard'
import { MEAL_LABELS, type ActionResult, type FoodLogEntry, type MealType, type Recipe } from '../types'

interface SaveRecipeSheetProps {
  open: boolean
  meal: MealType | null
  entries: FoodLogEntry[]
  recipes?: Recipe[]
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onSaveRecipe: (payload: {
    name: string
    entries: FoodLogEntry[]
    yieldServings: number
    yieldLabel?: string
    notes?: string
  }) => ActionResult<unknown>
}

function normalizeRecipeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildInitialName(meal: MealType | null): string {
  return meal ? `${MEAL_LABELS[meal]} recipe` : ''
}

export function SaveRecipeSheet({
  open,
  meal,
  entries,
  recipes = [],
  onClose,
  onDirtyChange,
  onSaveRecipe,
}: SaveRecipeSheetProps) {
  const initialName = useMemo(() => buildInitialName(meal), [meal])
  const [recipeName, setRecipeName] = useState(initialName)
  const [yieldServings, setYieldServings] = useState('1')
  const [yieldLabel, setYieldLabel] = useState('recipe serving')
  const [notes, setNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const collision = useMemo(
    () =>
      recipes.find(
        (recipe) =>
          !recipe.deletedAt &&
          normalizeRecipeName(recipe.name) === normalizeRecipeName(recipeName),
      ) ?? null,
    [recipeName, recipes],
  )

  const isDirty = useMemo(
    () =>
      recipeName.trim() !== initialName.trim() ||
      yieldServings.trim() !== '1' ||
      yieldLabel.trim() !== 'recipe serving' ||
      notes.trim() !== '',
    [initialName, notes, recipeName, yieldLabel, yieldServings],
  )

  useEffect(() => {
    onDirtyChange?.(open ? isDirty : false)
  }, [isDirty, onDirtyChange, open])

  return (
    <BottomSheet
      open={open}
      title="Save recipe"
      description={
        meal
          ? `Turn your ${MEAL_LABELS[meal].toLowerCase()} into a reusable recipe.`
          : 'Turn the current meal into a reusable recipe.'
      }
      onClose={onClose}
      isDirty={isDirty}
      discardMessage="Your recipe changes will be lost if you close this sheet."
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Recipe name
          <input
            className="field mt-2"
            value={recipeName}
            onChange={(event) => {
              setRecipeName(event.target.value)
              setErrorMessage(null)
            }}
            placeholder="Usual breakfast bowl"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Yield servings
            <input
              className="field mt-2"
              inputMode="decimal"
              value={yieldServings}
              onChange={(event) => {
                setYieldServings(event.target.value)
                setErrorMessage(null)
              }}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Yield label
            <input
              className="field mt-2"
              value={yieldLabel}
              onChange={(event) => {
                setYieldLabel(event.target.value)
                setErrorMessage(null)
              }}
              placeholder="recipe serving"
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes
          <textarea
            className="field mt-2 min-h-[88px]"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value)
              setErrorMessage(null)
            }}
            placeholder="Optional notes"
          />
        </label>

        {collision ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {collision.name} already exists. Rename this recipe before saving it.
          </div>
        ) : null}

        <TemplateSummaryCard
          name={recipeName.trim() || undefined}
          entries={entries}
          defaultMeal={meal}
        />

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="action-button flex-1"
            onClick={() => {
              const parsedYieldServings = Number.parseFloat(yieldServings)
              if (!Number.isFinite(parsedYieldServings) || parsedYieldServings <= 0) {
                setErrorMessage('Yield servings must be greater than zero.')
                return
              }

              if (collision) {
                setErrorMessage('Rename this recipe before saving it.')
                return
              }

              const result = onSaveRecipe({
                name: recipeName,
                entries,
                yieldServings: parsedYieldServings,
                yieldLabel: yieldLabel.trim() || undefined,
                notes: notes.trim() || undefined,
              })
              if (!result.ok) {
                setErrorMessage(result.error.message)
                return
              }

              onClose()
            }}
          >
            Save recipe
          </button>
          <button type="button" className="action-button-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
