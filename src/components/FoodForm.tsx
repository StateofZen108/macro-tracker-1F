import { useEffect, useState } from 'react'
import type { ActionResult, FoodDraft, FoodSource } from '../types'

interface FoodFormProps {
  title: string
  submitLabel: string
  source: FoodSource
  initialValues?: Partial<FoodDraft>
  noticeMessage?: string
  onDirtyChange?: (isDirty: boolean) => void
  onSubmit: (draft: FoodDraft) => ActionResult<unknown> | void
  onCancel: () => void
}

interface FoodFormState {
  name: string
  brand: string
  servingSize: string
  servingUnit: string
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  barcode: string
}

function formatFieldValue(value: number | undefined, fallback = ''): string {
  return value === undefined ? fallback : `${value}`
}

function buildFormState(initialValues?: Partial<FoodDraft>): FoodFormState {
  return {
    name: initialValues?.name ?? '',
    brand: initialValues?.brand ?? '',
    servingSize: formatFieldValue(initialValues?.servingSize, '1'),
    servingUnit: initialValues?.servingUnit ?? 'serving',
    calories: formatFieldValue(initialValues?.calories),
    protein: formatFieldValue(initialValues?.protein),
    carbs: formatFieldValue(initialValues?.carbs),
    fat: formatFieldValue(initialValues?.fat),
    fiber: formatFieldValue(initialValues?.fiber),
    barcode: initialValues?.barcode ?? '',
  }
}

function parseRequiredNumber(label: string, value: string, minimum = 0): number {
  const parsedValue = Number.parseFloat(value)

  if (!Number.isFinite(parsedValue) || parsedValue < minimum) {
    throw new Error(`${label} must be ${minimum === 0 ? 'a valid number' : `at least ${minimum}`}.`)
  }

  return parsedValue
}

export function FoodForm({
  title,
  submitLabel,
  source,
  initialValues,
  noticeMessage,
  onDirtyChange,
  onSubmit,
  onCancel,
}: FoodFormProps) {
  const [formState, setFormState] = useState<FoodFormState>(() => buildFormState(initialValues))
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setFormState(buildFormState(initialValues))
    setErrorMessage(null)
    onDirtyChange?.(false)
  }, [initialValues, onDirtyChange, source])

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(formState) !== JSON.stringify(buildFormState(initialValues)))
  }, [formState, initialValues, onDirtyChange])

  function updateField<K extends keyof FoodFormState>(field: K, value: FoodFormState[K]): void {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    try {
      const nextDraft: FoodDraft = {
        name: formState.name.trim(),
        brand: formState.brand.trim() || undefined,
        servingSize: parseRequiredNumber('Serving size', formState.servingSize, 0.01),
        servingUnit: formState.servingUnit.trim(),
        calories: parseRequiredNumber('Calories', formState.calories),
        protein: parseRequiredNumber('Protein', formState.protein),
        carbs: parseRequiredNumber('Carbs', formState.carbs),
        fat: parseRequiredNumber('Fat', formState.fat),
        fiber: formState.fiber.trim() ? parseRequiredNumber('Fiber', formState.fiber) : undefined,
        barcode: formState.barcode.trim() || undefined,
        source,
      }

      if (!nextDraft.name) {
        throw new Error('Food name is required.')
      }

      if (!nextDraft.servingUnit) {
        throw new Error('Serving unit is required.')
      }

      const result = onSubmit(nextDraft)
      if (result && !result.ok) {
        setErrorMessage(result.error.message)
        return
      }

      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Please review the form values.')
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <h3 className="font-display text-lg text-slate-900 dark:text-white">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Save a food with nutrition per serving so it is ready for quick logging later.
        </p>
      </div>

      {noticeMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {noticeMessage}
        </div>
      ) : null}

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Food name
        <input
          className="field mt-2"
          value={formState.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="Chicken breast"
        />
      </label>

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Brand (optional)
        <input
          className="field mt-2"
          value={formState.brand}
          onChange={(event) => updateField('brand', event.target.value)}
          placeholder="Kirkland"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Serving size
          <input
            className="field mt-2"
            inputMode="decimal"
            value={formState.servingSize}
            onChange={(event) => updateField('servingSize', event.target.value)}
            placeholder="100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Serving unit
          <input
            className="field mt-2"
            value={formState.servingUnit}
            onChange={(event) => updateField('servingUnit', event.target.value)}
            placeholder="g"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Calories
          <input
            className="field mt-2"
            inputMode="decimal"
            value={formState.calories}
            onChange={(event) => updateField('calories', event.target.value)}
            placeholder="165"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Protein (g)
          <input
            className="field mt-2"
            inputMode="decimal"
            value={formState.protein}
            onChange={(event) => updateField('protein', event.target.value)}
            placeholder="31"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Carbs (g)
          <input
            className="field mt-2"
            inputMode="decimal"
            value={formState.carbs}
            onChange={(event) => updateField('carbs', event.target.value)}
            placeholder="0"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Fat (g)
          <input
            className="field mt-2"
            inputMode="decimal"
            value={formState.fat}
            onChange={(event) => updateField('fat', event.target.value)}
            placeholder="3.6"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Fiber (optional)
          <input
            className="field mt-2"
            inputMode="decimal"
            value={formState.fiber}
            onChange={(event) => updateField('fiber', event.target.value)}
            placeholder="0"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Barcode (optional)
          <input
            className="field mt-2"
            inputMode="numeric"
            value={formState.barcode}
            onChange={(event) => updateField('barcode', event.target.value)}
            placeholder="0123456789012"
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
          {submitLabel}
        </button>
        <button type="button" className="action-button-secondary flex-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
