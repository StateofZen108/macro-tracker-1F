import { useState } from 'react'
import { buildBulkApplyPreview } from '../domain/logs/bulkPreview'
import type {
  ActionResult,
  AppActionError,
  BulkApplyMode,
  BulkApplyPreview,
  FoodLogEntry,
  MealTemplate,
  MealType,
  DayStatus,
} from '../types'
import { addDays } from '../utils/dates'
import type { UndoAction } from './useUndoQueue'

interface BulkApplyState {
  title: string
  description: string
  note?: string
  preview: BulkApplyPreview
  selectedMode: Exclude<BulkApplyMode, 'cancel'>
  apply: (mode: Exclude<BulkApplyMode, 'cancel'>) => ActionResult<unknown>
}

interface UseBulkApplyControllerOptions {
  selectedDate: string
  selectedDayStatus: DayStatus
  entries: FoodLogEntry[]
  templates: MealTemplate[]
  getEntriesForDate: (date: string) => FoodLogEntry[]
  saveEntriesForDate: (date: string, entries: FoodLogEntry[]) => ActionResult<void>
  saveEntries: (
    nextEntries: FoodLogEntry[],
    usageSourceEntries?: FoodLogEntry[],
  ) => ActionResult<void>
  setDayStatus: (date: string, status: DayStatus) => ActionResult<unknown>
  incrementTemplateUsage: (templateId: string) => ActionResult<void>
  deleteTemplate: (templateId: string) => ActionResult<void>
  restoreTemplate: (template: MealTemplate) => ActionResult<void>
  reportError: (error: AppActionError | string | null) => void
  queueUndoAction: (item: UndoAction) => void
  scrollEntryIntoView: (entryId: string, meal: MealType) => void
}

function cloneEntriesForDate(
  sourceEntries: FoodLogEntry[],
  selectedDate: string,
  targetMeal?: MealType,
): FoodLogEntry[] {
  const baseTime = Date.now()

  return sourceEntries.map((entry, index) => {
    const timestamp = new Date(baseTime + index).toISOString()
    return {
      ...entry,
      id: crypto.randomUUID(),
      date: selectedDate,
      meal: targetMeal ?? entry.meal,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
}

function buildTemplateEntries(template: MealTemplate, selectedDate: string, targetMeal: MealType): FoodLogEntry[] {
  const baseTime = Date.now()

  return template.entries.map((entry, index) => {
    const timestamp = new Date(baseTime + index).toISOString()
    return {
      id: crypto.randomUUID(),
      foodId: entry.foodId,
      snapshot: entry.snapshot,
      date: selectedDate,
      meal: targetMeal,
      servings: entry.servings,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
}

export function useBulkApplyController({
  selectedDate,
  selectedDayStatus,
  entries,
  templates,
  getEntriesForDate,
  saveEntriesForDate,
  saveEntries,
  setDayStatus,
  incrementTemplateUsage,
  deleteTemplate,
  restoreTemplate,
  reportError,
  queueUndoAction,
  scrollEntryIntoView,
}: UseBulkApplyControllerOptions) {
  const [bulkApplyState, setBulkApplyState] = useState<BulkApplyState | null>(null)

  function closeBulkApply(): void {
    setBulkApplyState(null)
  }

  function setBulkApplyMode(mode: Exclude<BulkApplyMode, 'cancel'>): void {
    setBulkApplyState((currentState) =>
      currentState
        ? {
            ...currentState,
            selectedMode: mode,
          }
        : currentState,
    )
  }

  function executeBulkApply(
    incomingEntries: FoodLogEntry[],
    mode: Exclude<BulkApplyMode, 'cancel'>,
    targetMeal: MealType | undefined,
    undoTitle: string,
    undoDescription: string,
    onAfterApply?: () => ActionResult<void>,
  ): ActionResult<void> {
    const previousEntries = getEntriesForDate(selectedDate)
    const previousStatus = selectedDayStatus
    const nextEntries =
      mode === 'append'
        ? [...previousEntries, ...incomingEntries]
        : targetMeal
          ? [...previousEntries.filter((entry) => entry.meal !== targetMeal), ...incomingEntries]
          : incomingEntries

    const saveResult = saveEntries(nextEntries, incomingEntries)
    if (!saveResult.ok) {
      reportError(saveResult.error)
      return saveResult
    }

    if (selectedDayStatus === 'fasting') {
      const statusResult = setDayStatus(selectedDate, 'partial')
      if (!statusResult.ok) {
        void saveEntriesForDate(selectedDate, previousEntries)
        reportError(statusResult.error)
        return statusResult as ActionResult<void>
      }
    }

    if (onAfterApply) {
      const afterResult = onAfterApply()
      if (!afterResult.ok) {
        reportError(afterResult.error)
        return afterResult
      }
    }

    const firstEntry = incomingEntries[0]
    if (firstEntry) {
      scrollEntryIntoView(firstEntry.id, firstEntry.meal)
    }

    reportError(null)
    queueUndoAction({
      id: crypto.randomUUID(),
      title: undoTitle,
      description: undoDescription,
      actionLabel: 'Undo',
      undo: () => {
        const restoreLogResult = saveEntriesForDate(selectedDate, previousEntries)
        if (!restoreLogResult.ok) {
          return restoreLogResult
        }

        return setDayStatus(selectedDate, previousStatus)
      },
    })

    return { ok: true, data: undefined }
  }

  function previewBulkApply(config: {
    title: string
    description: string
    note?: string
    incomingEntries: FoodLogEntry[]
    targetMeal?: MealType
    undoTitle: string
    undoDescription: string
    onAfterApply?: () => ActionResult<void>
  }): ActionResult<{ count: number }> {
    if (!config.incomingEntries.length) {
      return {
        ok: false,
        error: {
          code: 'noEntries',
          message: 'Nothing was available to apply.',
        },
      }
    }

    const targetEntries = config.targetMeal
      ? entries.filter((entry) => entry.meal === config.targetMeal)
      : entries
    const preview = buildBulkApplyPreview(
      selectedDate,
      config.incomingEntries,
      targetEntries,
      config.targetMeal,
    )
    setBulkApplyState({
      title: config.title,
      description: config.description,
      note: config.note,
      preview,
      selectedMode: preview.modeRecommendation === 'replaceTarget' ? 'replaceTarget' : 'append',
      apply: (mode) =>
        executeBulkApply(
          config.incomingEntries,
          mode,
          config.targetMeal,
          config.undoTitle,
          config.undoDescription,
          config.onAfterApply,
        ),
    })

    reportError(null)
    return {
      ok: true,
      data: {
        count: config.incomingEntries.length,
      },
    }
  }

  function applyCurrentBulkApply(): ActionResult<void> {
    if (!bulkApplyState) {
      return { ok: true, data: undefined }
    }

    return bulkApplyState.apply(bulkApplyState.selectedMode) as ActionResult<void>
  }

  function handleCopyPreviousDay(): ActionResult<{ count: number }> {
    const sourceDate = addDays(selectedDate, -1)
    const sourceEntries = getEntriesForDate(sourceDate)
    if (!sourceEntries.length) {
      const result = {
        ok: false as const,
        error: {
          code: 'noEntries',
          message: `No logged meals were found on ${sourceDate}.`,
        },
      }
      reportError(result.error)
      return result
    }

    return previewBulkApply({
      title: 'Review copied day',
      description: `Copy ${sourceDate} into ${selectedDate}.`,
      note:
        selectedDayStatus === 'fasting'
          ? 'Applying intake will convert this fasting day to partial.'
          : undefined,
      incomingEntries: cloneEntriesForDate(sourceEntries, selectedDate),
      undoTitle: 'Copied previous day',
      undoDescription: `${sourceEntries.length} entr${sourceEntries.length === 1 ? 'y' : 'ies'} added`,
    })
  }

  function handleCopyMeal(payload: {
    sourceDate: string
    sourceMeal: MealType
    targetMeal: MealType
  }): ActionResult<{ count: number }> {
    const sourceEntries = getEntriesForDate(payload.sourceDate).filter(
      (entry) => entry.meal === payload.sourceMeal,
    )
    if (!sourceEntries.length) {
      const result = {
        ok: false as const,
        error: {
          code: 'noEntries',
          message: `No ${payload.sourceMeal} entries were found on ${payload.sourceDate}.`,
        },
      }
      reportError(result.error)
      return result
    }

    return previewBulkApply({
      title: 'Review copied meal',
      description: `Copy ${payload.sourceMeal} from ${payload.sourceDate} into ${payload.targetMeal}.`,
      note:
        selectedDayStatus === 'fasting'
          ? 'Applying intake will convert this fasting day to partial.'
          : undefined,
      incomingEntries: cloneEntriesForDate(sourceEntries, selectedDate, payload.targetMeal),
      targetMeal: payload.targetMeal,
      undoTitle: 'Copied meal',
      undoDescription: `${sourceEntries.length} entr${sourceEntries.length === 1 ? 'y' : 'ies'} applied to ${payload.targetMeal}`,
    })
  }

  function handleApplyTemplate(templateId: string, meal: MealType): ActionResult<unknown> {
    const template = templates.find((currentTemplate) => currentTemplate.id === templateId)
    if (!template) {
      const result: ActionResult<unknown> = {
        ok: false,
        error: {
          code: 'missingTemplate',
          message: 'That saved meal is no longer available.',
        },
      }
      reportError(result.error)
      return result
    }

    const clonedEntries = buildTemplateEntries(template, selectedDate, meal)
    return previewBulkApply({
      title: 'Review saved meal',
      description: `Apply ${template.name} to ${meal}.`,
      note:
        selectedDayStatus === 'fasting'
          ? 'Applying intake will convert this fasting day to partial.'
          : template.notes,
      incomingEntries: clonedEntries,
      targetMeal: meal,
      undoTitle: 'Saved meal applied',
      undoDescription: template.name,
      onAfterApply: () => incrementTemplateUsage(template.id),
    })
  }

  function handleDeleteTemplate(templateId: string): ActionResult<void> {
    const template = templates.find((currentTemplate) => currentTemplate.id === templateId)
    const result = deleteTemplate(templateId)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    if (template) {
      queueUndoAction({
        id: crypto.randomUUID(),
        title: 'Saved meal deleted',
        description: template.name,
        actionLabel: 'Undo',
        undo: () => restoreTemplate(template),
      })
    }

    return { ok: true, data: undefined }
  }

  return {
    bulkApplyState,
    closeBulkApply,
    setBulkApplyMode,
    applyCurrentBulkApply,
    handleCopyPreviousDay,
    handleCopyMeal,
    handleApplyTemplate,
    handleDeleteTemplate,
  }
}
