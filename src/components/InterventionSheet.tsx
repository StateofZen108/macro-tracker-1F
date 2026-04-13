import { useEffect, useMemo, useState } from 'react'
import type { ActionResult, InterventionDraft, InterventionEntry, InterventionRoute } from '../types'
import { BottomSheet } from './BottomSheet'

interface InterventionSheetProps {
  open: boolean
  entry?: InterventionEntry | null
  recentNames: string[]
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onSubmit: (draft: InterventionDraft) => ActionResult<unknown>
  onDelete?: (() => void) | null
}

interface InterventionFormState {
  name: string
  category: InterventionDraft['category']
  dose: string
  unit: string
  route: InterventionRoute | ''
  takenAt: string
  notes: string
}

function buildInitialState(entry?: InterventionEntry | null): InterventionFormState {
  return {
    name: entry?.name ?? '',
    category: entry?.category ?? 'supplement',
    dose: entry ? `${entry.dose}` : '',
    unit: entry?.unit ?? '',
    route: entry?.route ?? '',
    takenAt: entry?.takenAt ?? '',
    notes: entry?.notes ?? '',
  }
}

function parseDose(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Dose must be a valid positive number.')
  }

  return parsed
}

export function InterventionSheet({
  open,
  entry,
  recentNames,
  onClose,
  onDirtyChange,
  onSubmit,
  onDelete,
}: InterventionSheetProps) {
  const initialState = useMemo(() => buildInitialState(entry), [entry])
  const [formState, setFormState] = useState<InterventionFormState>(initialState)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isDirty = useMemo(
    () => JSON.stringify(formState) !== JSON.stringify(initialState),
    [formState, initialState],
  )

  useEffect(() => {
    onDirtyChange?.(open ? isDirty : false)
  }, [isDirty, onDirtyChange, open])

  function updateField<K extends keyof InterventionFormState>(
    field: K,
    value: InterventionFormState[K],
  ): void {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }))
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    try {
      const result = onSubmit({
        name: formState.name.trim(),
        category: formState.category,
        dose: parseDose(formState.dose),
        unit: formState.unit.trim(),
        route: formState.route || undefined,
        takenAt: formState.takenAt || undefined,
        notes: formState.notes.trim() || undefined,
      })

      if (!result.ok) {
        setErrorMessage(result.error.message)
        return
      }

      setErrorMessage(null)
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Review the intervention details.')
    }
  }

  return (
    <BottomSheet
      open={open}
      title={entry ? 'Edit intervention' : 'Log intervention'}
      description="Track compounds or supplements separately from food so coaching can treat them as context."
      onClose={onClose}
      isDirty={isDirty}
      discardMessage="Your intervention changes are unsaved. Discard them and close this sheet?"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {recentNames.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Recent names</p>
            <div className="flex flex-wrap gap-2">
              {recentNames.slice(0, 6).map((name) => (
                <button
                  key={name}
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => updateField('name', name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Name
          <input
            className="field mt-2"
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Caffeine"
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Category</p>
          <div className="grid grid-cols-2 gap-2">
            {(['supplement', 'medication', 'stimulant', 'peptide', 'other'] as const).map((category) => (
              <button
                key={category}
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  formState.category === category
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
                onClick={() => updateField('category', category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Dose
            <input
              className="field mt-2"
              inputMode="decimal"
              value={formState.dose}
              onChange={(event) => updateField('dose', event.target.value)}
              placeholder="200"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Unit
            <input
              className="field mt-2"
              value={formState.unit}
              onChange={(event) => updateField('unit', event.target.value)}
              placeholder="mg"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Route
            <select
              className="field mt-2"
              value={formState.route}
              onChange={(event) => updateField('route', event.target.value as InterventionRoute | '')}
            >
              <option value="">Optional</option>
              <option value="oral">oral</option>
              <option value="subcutaneous">subcutaneous</option>
              <option value="intramuscular">intramuscular</option>
              <option value="topical">topical</option>
              <option value="other">other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Time taken
            <input
              className="field mt-2"
              type="time"
              value={formState.takenAt}
              onChange={(event) => updateField('takenAt', event.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes
          <textarea
            className="field mt-2 min-h-[110px]"
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder="Optional notes"
          />
        </label>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <button type="submit" className="action-button">
            {entry ? 'Save intervention' : 'Log intervention'}
          </button>
          <button type="button" className="action-button-secondary" onClick={onClose}>
            Cancel
          </button>
          {entry && onDelete ? (
            <button
              type="button"
              className="action-button-secondary text-rose-700 dark:text-rose-300"
              onClick={onDelete}
            >
              Delete intervention
            </button>
          ) : null}
        </div>
      </form>
    </BottomSheet>
  )
}
