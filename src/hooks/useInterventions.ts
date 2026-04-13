import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, InterventionDraft, InterventionEntry } from '../types'
import { isSyncEnabled } from '../utils/sync/core'
import { subscribeToStorage } from '../utils/storage/core'
import { loadInterventions, saveInterventions } from '../utils/storage/interventions'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sortInterventions(entries: InterventionEntry[]): InterventionEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date)
    }

    const leftTime = left.takenAt ?? ''
    const rightTime = right.takenAt ?? ''
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime)
    }

    return left.createdAt.localeCompare(right.createdAt)
  })
}

function normalizeDraft(draft: InterventionDraft): InterventionDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    unit: draft.unit.trim(),
    route: draft.route ?? undefined,
    takenAt: draft.takenAt?.trim() || undefined,
    notes: draft.notes?.trim() || undefined,
  }
}

export function useInterventions() {
  const storedInterventions = useSyncExternalStore(
    subscribeToStorage,
    loadInterventions,
    loadInterventions,
  )
  const interventions = useMemo(
    () => sortInterventions(storedInterventions.filter((entry) => !entry.deletedAt)),
    [storedInterventions],
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function addIntervention(date: string, draft: InterventionDraft): ActionResult<InterventionEntry> {
    const now = new Date().toISOString()
    const normalizedDraft = normalizeDraft(draft)
    const createdEntry: InterventionEntry = {
      id: crypto.randomUUID(),
      date,
      ...normalizedDraft,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    }

    const result = saveInterventions([...loadInterventions(), createdEntry])
    if (!result.ok) {
      setLastError(result.error)
      return result as ActionResult<InterventionEntry>
    }

    setLastError(null)
    return ok(createdEntry)
  }

  function updateIntervention(interventionId: string, draft: InterventionDraft): ActionResult<void> {
    const normalizedDraft = normalizeDraft(draft)
    const now = new Date().toISOString()
    const nextInterventions = loadInterventions().map((entry) =>
      entry.id === interventionId
        ? {
            ...entry,
            ...normalizedDraft,
            updatedAt: now,
          }
        : entry,
    )

    const result = saveInterventions(nextInterventions)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function deleteIntervention(interventionId: string): ActionResult<void> {
    const now = new Date().toISOString()
    const nextInterventions = isSyncEnabled()
      ? loadInterventions().map((entry) =>
          entry.id === interventionId
            ? {
                ...entry,
                updatedAt: now,
                deletedAt: now,
              }
            : entry,
        )
      : loadInterventions().filter((entry) => entry.id !== interventionId)
    const result = saveInterventions(nextInterventions)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function restoreIntervention(entry: InterventionEntry): ActionResult<void> {
    const result = saveInterventions(
      loadInterventions()
        .filter((currentEntry) => currentEntry.id !== entry.id)
        .concat({
          ...entry,
          updatedAt: new Date().toISOString(),
          deletedAt: undefined,
        }),
    )
    setLastError(result.ok ? null : result.error)
    return result
  }

  function getInterventionsForDate(date: string): InterventionEntry[] {
    return interventions.filter((entry) => entry.date === date)
  }

  return {
    interventions,
    addIntervention,
    updateIntervention,
    deleteIntervention,
    restoreIntervention,
    getInterventionsForDate,
    lastError,
  }
}
