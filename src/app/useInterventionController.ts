import { useMemo, useState } from 'react'
import type { ActionResult, AppActionError, InterventionDraft, InterventionEntry } from '../types'
import type { UndoAction } from './useUndoQueue'

interface UseInterventionControllerOptions {
  selectedDate: string
  interventions: InterventionEntry[]
  addIntervention: (date: string, draft: InterventionDraft) => ActionResult<InterventionEntry>
  updateIntervention: (interventionId: string, draft: InterventionDraft) => ActionResult<void>
  deleteIntervention: (interventionId: string) => ActionResult<void>
  restoreIntervention: (entry: InterventionEntry) => ActionResult<void>
  reportError: (error: AppActionError | string | null) => void
  queueUndoAction: (item: UndoAction) => void
}

export function useInterventionController({
  selectedDate,
  interventions,
  addIntervention,
  updateIntervention,
  deleteIntervention,
  restoreIntervention,
  reportError,
  queueUndoAction,
}: UseInterventionControllerOptions) {
  const [interventionSheetOpen, setInterventionSheetOpen] = useState(false)
  const [interventionSheetDirty, setInterventionSheetDirty] = useState(false)
  const [editingInterventionId, setEditingInterventionId] = useState<string | null>(null)

  const editingIntervention =
    interventions.find((entry) => entry.id === editingInterventionId) ?? null
  const recentInterventionNames = useMemo(
    () =>
      [...interventions]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((entry) => entry.name.trim())
        .filter((value, index, values) => value && values.indexOf(value) === index),
    [interventions],
  )

  function openInterventionSheet(interventionId?: string): void {
    setEditingInterventionId(interventionId ?? null)
    setInterventionSheetOpen(true)
    reportError(null)
  }

  function closeInterventionSheet(): void {
    setInterventionSheetOpen(false)
    setInterventionSheetDirty(false)
    setEditingInterventionId(null)
  }

  function handleSubmitIntervention(draft: InterventionDraft): ActionResult<unknown> {
    if (!draft.name.trim()) {
      const result: ActionResult<void> = {
        ok: false,
        error: {
          code: 'interventionName',
          message: 'Intervention name is required.',
        },
      }
      reportError(result.error)
      return result
    }

    const result =
      editingInterventionId !== null
        ? updateIntervention(editingInterventionId, draft)
        : addIntervention(selectedDate, draft)

    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    setInterventionSheetDirty(false)
    setEditingInterventionId(null)
    return result
  }

  function handleDeleteIntervention(interventionId: string): void {
    const intervention = interventions.find((entry) => entry.id === interventionId)
    if (!intervention) {
      return
    }

    const result = deleteIntervention(interventionId)
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
    queueUndoAction({
      id: crypto.randomUUID(),
      title: 'Intervention removed',
      description: `${intervention.name} ${intervention.dose}${intervention.unit}`,
      actionLabel: 'Undo',
      undo: () => restoreIntervention(intervention),
    })
    if (editingInterventionId === interventionId) {
      closeInterventionSheet()
    }
  }

  return {
    interventionSheetOpen,
    interventionSheetDirty,
    setInterventionSheetDirty,
    editingInterventionId,
    editingIntervention,
    recentInterventionNames,
    openInterventionSheet,
    closeInterventionSheet,
    handleSubmitIntervention,
    handleDeleteIntervention,
  }
}
