import { useEffect, useMemo, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { TemplateSummaryCard } from './TemplateSummaryCard'
import {
  MEAL_LABELS,
  MEAL_TYPES,
  type ActionResult,
  type FoodLogEntry,
  type MealTemplate,
  type MealType,
} from '../types'

interface SaveTemplateSheetProps {
  open: boolean
  meal: MealType | null
  entries: FoodLogEntry[]
  template?: MealTemplate | null
  templates?: MealTemplate[]
  mode?: 'create' | 'edit'
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onSaveTemplate: (name: string, meal: MealType, entries: FoodLogEntry[]) => ActionResult<unknown>
  onUpdateTemplate?: (payload: {
    templateId: string
    name: string
    meal: MealType
    entries: FoodLogEntry[]
  }) => ActionResult<unknown>
  onOverwriteTemplate?: (payload: {
    templateId: string
    name: string
    meal: MealType
    entries: FoodLogEntry[]
  }) => ActionResult<unknown>
}

type SaveStrategy = 'saveNew' | 'overwriteExisting'

function normalizeTemplateName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildInitialName(meal: MealType | null, template?: MealTemplate | null): string {
  if (template?.name) {
    return template.name
  }

  return meal ? `${MEAL_LABELS[meal]} saved meal` : ''
}

function SaveTemplateSheetContent({
  open,
  meal,
  entries,
  template,
  templates = [],
  mode,
  onClose,
  onDirtyChange,
  onSaveTemplate,
  onUpdateTemplate,
  onOverwriteTemplate,
}: SaveTemplateSheetProps) {
  const sheetMode = mode ?? (template && onUpdateTemplate ? 'edit' : 'create')
  const initialMeal = template?.defaultMeal ?? meal ?? 'breakfast'
  const initialName = useMemo(() => buildInitialName(meal, template), [meal, template])
  const [templateName, setTemplateName] = useState(initialName)
  const [selectedMeal, setSelectedMeal] = useState<MealType>(initialMeal)
  const [saveStrategy, setSaveStrategy] = useState<SaveStrategy>('saveNew')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const collisionTemplate = useMemo(
    () =>
      templates.find(
        (currentTemplate) =>
          currentTemplate.id !== template?.id &&
          normalizeTemplateName(currentTemplate.name) === normalizeTemplateName(templateName),
      ) ?? null,
    [template?.id, templateName, templates],
  )

  const isDirty = useMemo(
    () =>
      templateName.trim() !== initialName.trim() ||
      selectedMeal !== initialMeal ||
      saveStrategy !== 'saveNew',
    [initialMeal, initialName, saveStrategy, selectedMeal, templateName],
  )

  useEffect(() => {
    onDirtyChange?.(open ? isDirty : false)
  }, [isDirty, onDirtyChange, open])

  const canOverwriteCollision = Boolean(collisionTemplate && onOverwriteTemplate)
  const isEditMode = sheetMode === 'edit' && template && onUpdateTemplate

  return (
    <BottomSheet
      open={open}
      title={isEditMode ? 'Edit saved meal' : 'Save saved meal'}
      description={
        isEditMode
          ? 'Rename the saved meal or replace its foods carefully.'
          : `Turn your ${MEAL_LABELS[selectedMeal].toLowerCase()} into a reusable saved meal.`
      }
      onClose={onClose}
      isDirty={isDirty}
      discardMessage="Your saved meal changes will be lost if you close this sheet."
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Saved meal name
          <input
            className="field mt-2"
            value={templateName}
            onChange={(event) => {
              setTemplateName(event.target.value)
              setErrorMessage(null)
            }}
            placeholder="Usual breakfast"
          />
        </label>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Default meal</p>
          <div className="grid grid-cols-2 gap-2">
            {MEAL_TYPES.map((candidateMeal) => (
              <button
                key={candidateMeal}
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  selectedMeal === candidateMeal
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
                onClick={() => {
                  setSelectedMeal(candidateMeal)
                  setErrorMessage(null)
                }}
              >
                {MEAL_LABELS[candidateMeal]}
              </button>
            ))}
          </div>
        </div>

        {collisionTemplate ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-500/40 dark:bg-amber-500/10">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              {collisionTemplate.name} already exists.
            </p>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              Rename this saved meal or explicitly replace the existing saved version.
            </p>

            {canOverwriteCollision && !isEditMode ? (
              <div className="mt-3 flex rounded-2xl bg-white/80 p-1 dark:bg-slate-950/60">
                <button
                  type="button"
                  className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    saveStrategy === 'saveNew'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => setSaveStrategy('saveNew')}
                >
                  Keep both
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    saveStrategy === 'overwriteExisting'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => setSaveStrategy('overwriteExisting')}
                >
                  Replace existing
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <TemplateSummaryCard
          name={templateName.trim() || undefined}
          entries={entries}
          defaultMeal={selectedMeal}
          usageCount={template?.usageCount}
          updatedAt={template?.updatedAt}
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
              if (collisionTemplate && !canOverwriteCollision && !isEditMode) {
                setErrorMessage('Rename this saved meal before saving it.')
                return
              }

              const result =
                isEditMode && template
                  ? onUpdateTemplate({
                      templateId: template.id,
                      name: templateName,
                      meal: selectedMeal,
                      entries,
                    })
                  : collisionTemplate && saveStrategy === 'overwriteExisting' && onOverwriteTemplate
                    ? onOverwriteTemplate({
                        templateId: collisionTemplate.id,
                        name: templateName,
                        meal: selectedMeal,
                        entries,
                      })
                    : onSaveTemplate(templateName, selectedMeal, entries)

              if (!result.ok) {
                setErrorMessage(result.error.message)
                return
              }

              setErrorMessage(null)
              onClose()
            }}
          >
            {isEditMode
              ? 'Save changes'
              : collisionTemplate && saveStrategy === 'overwriteExisting'
                ? 'Replace template'
                : 'Save saved meal'}
          </button>
          <button type="button" className="action-button-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

export function SaveTemplateSheet(props: SaveTemplateSheetProps) {
  const resetKey = `${props.template?.id ?? 'new'}-${props.meal ?? 'none'}-${props.open ? 'open' : 'closed'}`
  return <SaveTemplateSheetContent key={resetKey} {...props} />
}
