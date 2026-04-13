import { Archive, PencilLine, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { BulkModeSelector, type BulkActionMode } from './BulkModeSelector'
import { CollisionPreviewCard, type CollisionPreview } from './CollisionPreviewCard'
import { TemplateSummaryCard } from './TemplateSummaryCard'
import { MEAL_LABELS, type ActionResult, type MealTemplate, type MealType } from '../types'

interface TemplateSheetProps {
  open: boolean
  meal: MealType | null
  templates: MealTemplate[]
  archivedTemplateIds?: string[]
  onClose: () => void
  onApplyTemplate: (templateId: string, meal: MealType) => ActionResult<unknown>
  onApplyTemplateSelection?: (payload: {
    templateId: string
    meal: MealType
    mode: BulkActionMode
  }) => ActionResult<unknown>
  getApplyPreview?: (payload: {
    template: MealTemplate
    meal: MealType | null
    mode: BulkActionMode
  }) => CollisionPreview | null
  onDeleteTemplate: (templateId: string) => ActionResult<unknown>
  onRenameTemplate?: (templateId: string, name: string) => ActionResult<unknown>
  onEditTemplate?: (template: MealTemplate) => void
  onArchiveTemplate?: (templateId: string) => ActionResult<unknown>
  onRestoreTemplate?: (templateId: string) => ActionResult<unknown>
  isTemplateArchived?: (template: MealTemplate) => boolean
}

function filterTemplatesForMeal(templates: MealTemplate[], meal: MealType | null): MealTemplate[] {
  if (!meal) {
    return templates
  }

  const matchingTemplates = templates.filter((template) => template.defaultMeal === meal)
  if (matchingTemplates.length) {
    return matchingTemplates
  }

  return templates
}

function TemplateSheetContent({
  open,
  meal,
  templates,
  archivedTemplateIds,
  onClose,
  onApplyTemplate,
  onApplyTemplateSelection,
  getApplyPreview,
  onDeleteTemplate,
  onRenameTemplate,
  onEditTemplate,
  onArchiveTemplate,
  onRestoreTemplate,
  isTemplateArchived,
}: TemplateSheetProps) {
  const archivedIdSet = useMemo(() => new Set(archivedTemplateIds ?? []), [archivedTemplateIds])
  const hasArchiveSurface = Boolean(
    (archivedTemplateIds && archivedTemplateIds.length) || onArchiveTemplate || onRestoreTemplate || isTemplateArchived,
  )
  const [applyMode, setApplyMode] = useState<BulkActionMode>('append')
  const [activeView, setActiveView] = useState<'active' | 'archived'>('active')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resolveArchived = useMemo(
    () => (template: MealTemplate) => isTemplateArchived?.(template) ?? archivedIdSet.has(template.id),
    [archivedIdSet, isTemplateArchived],
  )

  const scopedTemplates = useMemo(() => filterTemplatesForMeal(templates, meal), [meal, templates])
  const hasArchivedTemplates = useMemo(
    () => scopedTemplates.some((template) => resolveArchived(template)),
    [resolveArchived, scopedTemplates],
  )
  const currentView = activeView === 'archived' && !hasArchivedTemplates ? 'active' : activeView
  const visibleTemplates = useMemo(
    () =>
      scopedTemplates.filter((template) =>
        currentView === 'archived' ? resolveArchived(template) : !resolveArchived(template),
      ),
    [currentView, resolveArchived, scopedTemplates],
  )
  const selectedTemplate =
    visibleTemplates.find((template) => template.id === selectedTemplateId) ?? visibleTemplates[0] ?? null
  const selectedPreview = useMemo(
    () =>
      selectedTemplate
        ? getApplyPreview?.({
            template: selectedTemplate,
            meal,
            mode: applyMode,
          }) ?? null
        : null,
    [applyMode, getApplyPreview, meal, selectedTemplate],
  )

  function beginRename(template: MealTemplate): void {
    setSelectedTemplateId(template.id)
    setRenameTemplateId(template.id)
    setRenameDraft(template.name)
    setConfirmDeleteTemplateId(null)
    setErrorMessage(null)
  }

  return (
    <BottomSheet
      open={open}
      title="Saved meals"
      description={
        meal ? `Preview and apply saved meals to ${MEAL_LABELS[meal]}.` : 'Preview and manage your saved meals.'
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        {meal ? (
          <BulkModeSelector
            value={applyMode}
            onChange={(mode) => {
              setApplyMode(mode)
              setErrorMessage(null)
            }}
            title={`How should this land in ${MEAL_LABELS[meal]}?`}
            appendDescription={`Keep the current ${MEAL_LABELS[meal].toLowerCase()} and add the template after it.`}
            replaceDescription={`Clear ${MEAL_LABELS[meal].toLowerCase()} first, then apply the template.`}
          />
        ) : null}

        {hasArchiveSurface ? (
          <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                currentView === 'active'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
              onClick={() => setActiveView('active')}
            >
              Active
            </button>
            <button
              type="button"
              className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                currentView === 'archived'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
              onClick={() => setActiveView('archived')}
            >
              Archived
            </button>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        {visibleTemplates.length ? (
          <div className="space-y-3">
            {visibleTemplates.map((template) => {
              const isSelected = selectedTemplate?.id === template.id
              const isArchived = resolveArchived(template)

              return (
                <article
                  key={template.id}
                  className={`rounded-[28px] border p-4 transition ${
                    isSelected
                      ? 'border-teal-400 bg-teal-50/70 shadow-glow dark:border-teal-500/40 dark:bg-teal-500/10'
                      : 'border-black/5 bg-white/70 dark:border-white/10 dark:bg-slate-900/70'
                  }`}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => {
                      setSelectedTemplateId(template.id)
                      setRenameTemplateId(null)
                      setConfirmDeleteTemplateId(null)
                      setErrorMessage(null)
                    }}
                  >
                    <TemplateSummaryCard
                      name={template.name}
                      entries={template.entries}
                      defaultMeal={template.defaultMeal}
                      usageCount={template.usageCount}
                      updatedAt={template.updatedAt}
                      compact={!isSelected}
                      className="border-0 bg-transparent px-0 py-0 shadow-none"
                    />
                  </button>

                  {isSelected ? (
                    <div className="mt-4 space-y-3">
                      {meal ? (
                        <CollisionPreviewCard
                          mode={applyMode}
                          preview={selectedPreview}
                          title="Saved meal collision preview"
                          appendFallback={`Appending keeps the current ${MEAL_LABELS[meal].toLowerCase()} and adds this saved meal after it.`}
                          replaceFallback={`Replacing clears ${MEAL_LABELS[meal].toLowerCase()} before applying this saved meal.`}
                        />
                      ) : null}

                      {renameTemplateId === template.id ? (
                        <div className="rounded-[24px] border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-slate-950/60">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Saved meal name
                            <input
                              className="field mt-2"
                              value={renameDraft}
                              onChange={(event) => setRenameDraft(event.target.value)}
                              placeholder="Usual breakfast"
                            />
                          </label>
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              className="action-button flex-1"
                              onClick={() => {
                                if (!onRenameTemplate) {
                                  return
                                }

                                const result = onRenameTemplate(template.id, renameDraft)
                                if (!result.ok) {
                                  setErrorMessage(result.error.message)
                                  return
                                }

                                setErrorMessage(null)
                                setRenameTemplateId(null)
                              }}
                            >
                              Save name
                            </button>
                            <button
                              type="button"
                              className="action-button-secondary flex-1"
                              onClick={() => {
                                setRenameTemplateId(null)
                                setRenameDraft('')
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {confirmDeleteTemplateId === template.id ? (
                        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 dark:border-rose-500/40 dark:bg-rose-500/10">
                          <p className="font-semibold text-rose-800 dark:text-rose-200">
                            Delete {template.name} permanently?
                          </p>
                          <p className="mt-1 text-sm text-rose-700 dark:text-rose-200">
                            This removes the saved meal from your list right away.
                          </p>
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              className="action-button-secondary flex-1"
                              onClick={() => setConfirmDeleteTemplateId(null)}
                            >
                              Keep saved meal
                            </button>
                            <button
                              type="button"
                              className="action-button flex-1"
                              onClick={() => {
                                const result = onDeleteTemplate(template.id)
                                if (!result.ok) {
                                  setErrorMessage(result.error.message)
                                  return
                                }

                                setErrorMessage(null)
                                setConfirmDeleteTemplateId(null)
                              }}
                            >
                              Delete permanently
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        {meal ? (
                          <button
                            type="button"
                            className="action-button w-full"
                          aria-label={`${applyMode === 'append' ? 'Apply' : 'Replace with'} ${template.name} saved meal`}
                            onClick={() => {
                              const result = onApplyTemplateSelection
                                ? onApplyTemplateSelection({
                                    templateId: template.id,
                                    meal,
                                    mode: applyMode,
                                  })
                                : onApplyTemplate(template.id, meal)
                              if (!result.ok) {
                                setErrorMessage(result.error.message)
                                return
                              }

                              if (result.data !== 'deferred') {
                                onClose()
                              }
                            }}
                          >
                            {applyMode === 'append' ? 'Append saved meal' : 'Replace with saved meal'}
                          </button>
                        ) : null}

                        {onEditTemplate ? (
                          <button
                            type="button"
                            className="action-button-secondary inline-flex items-center justify-center gap-2"
                            aria-label={`Edit ${template.name} saved meal foods`}
                            onClick={() => onEditTemplate(template)}
                          >
                            <PencilLine className="h-4 w-4" />
                            Edit foods
                          </button>
                        ) : null}

                        {onRenameTemplate ? (
                          <button
                            type="button"
                            className="action-button-secondary inline-flex items-center justify-center gap-2"
                            aria-label={`Rename ${template.name} saved meal`}
                            onClick={() => beginRename(template)}
                          >
                            <PencilLine className="h-4 w-4" />
                            Rename
                          </button>
                        ) : null}

                        {!isArchived && onArchiveTemplate ? (
                          <button
                            type="button"
                            className="action-button-secondary inline-flex items-center justify-center gap-2"
                            aria-label={`Archive ${template.name} saved meal`}
                            onClick={() => {
                              const result = onArchiveTemplate(template.id)
                              if (!result.ok) {
                                setErrorMessage(result.error.message)
                                return
                              }

                              setErrorMessage(null)
                            }}
                          >
                            <Archive className="h-4 w-4" />
                            Archive
                          </button>
                        ) : null}

                        {isArchived && onRestoreTemplate ? (
                          <button
                            type="button"
                            className="action-button-secondary inline-flex items-center justify-center gap-2"
                            aria-label={`Restore ${template.name} saved meal`}
                            onClick={() => {
                              const result = onRestoreTemplate(template.id)
                              if (!result.ok) {
                                setErrorMessage(result.error.message)
                                return
                              }

                              setErrorMessage(null)
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </button>
                        ) : null}

                        <button
                          type="button"
                          className="action-button-secondary inline-flex items-center justify-center gap-2 text-rose-700 dark:text-rose-300"
                          aria-label={`Delete ${template.name} saved meal`}
                          onClick={() => {
                            setConfirmDeleteTemplateId(template.id)
                            setRenameTemplateId(null)
                            setErrorMessage(null)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-6 text-sm text-slate-600 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-slate-300">
            {currentView === 'archived'
              ? 'No archived saved meals are available in this view yet.'
              : 'Save a logged meal as a saved meal to reuse it here.'}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

export function TemplateSheet(props: TemplateSheetProps) {
  const resetKey = `${props.meal ?? 'none'}-${props.open ? 'open' : 'closed'}`
  return <TemplateSheetContent key={resetKey} {...props} />
}
