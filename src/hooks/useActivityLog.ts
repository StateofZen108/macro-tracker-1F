import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionResult, ActivityDraft, ActivityEntry, AppActionError } from '../types'
import { isSyncEnabled } from '../utils/sync/core'
import { subscribeToStorage } from '../utils/storage/core'
import { loadActivityLog, saveActivityLog } from '../utils/storage/activity'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sortActivityLog(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((left, right) => right.date.localeCompare(left.date))
}

function normalizeDraft(draft: ActivityDraft): ActivityDraft {
  return {
    steps:
      typeof draft.steps === 'number' && Number.isFinite(draft.steps)
        ? Math.max(0, Math.round(draft.steps))
        : undefined,
    cardioMinutes:
      typeof draft.cardioMinutes === 'number' && Number.isFinite(draft.cardioMinutes)
        ? Math.max(0, Math.round(draft.cardioMinutes))
        : undefined,
    cardioType:
      draft.cardioType === 'walk' ||
      draft.cardioType === 'incline_treadmill' ||
      draft.cardioType === 'bike' ||
      draft.cardioType === 'run' ||
      draft.cardioType === 'other'
        ? draft.cardioType
        : undefined,
    notes: draft.notes?.trim() || undefined,
  }
}

export function useActivityLog() {
  const storedActivityLog = useSyncExternalStore(subscribeToStorage, loadActivityLog, loadActivityLog)
  const activityLog = useMemo(
    () => sortActivityLog(storedActivityLog.filter((entry) => !entry.deletedAt)),
    [storedActivityLog],
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function getEntry(date: string): ActivityEntry | null {
    return loadActivityLog().find((entry) => entry.date === date && !entry.deletedAt) ?? null
  }

  function saveEntry(date: string, draft: ActivityDraft): ActionResult<ActivityEntry> {
    const normalizedDraft = normalizeDraft(draft)
    if (
      normalizedDraft.steps === undefined &&
      normalizedDraft.cardioMinutes === undefined &&
      !normalizedDraft.notes &&
      !normalizedDraft.cardioType
    ) {
      const result: ActionResult<ActivityEntry> = {
        ok: false,
        error: {
          code: 'activityEmpty',
          message: 'Log at least steps, cardio minutes, or a note before saving activity.',
        },
      }
      setLastError(result.error)
      return result
    }

    const now = new Date().toISOString()
    const nextEntry: ActivityEntry = {
      date,
      ...normalizedDraft,
      updatedAt: now,
      deletedAt: undefined,
    }

    const nextLog = loadActivityLog().filter((entry) => entry.date !== date).concat(nextEntry)
    const result = saveActivityLog(nextLog)
    if (!result.ok) {
      setLastError(result.error)
      return result as ActionResult<ActivityEntry>
    }

    setLastError(null)
    return ok(nextEntry)
  }

  function deleteEntry(date: string): ActionResult<void> {
    const currentActivityLog = loadActivityLog()
    const now = new Date().toISOString()
    const nextActivityLog = isSyncEnabled()
      ? currentActivityLog.map((entry) =>
          entry.date === date
            ? {
                ...entry,
                updatedAt: now,
                deletedAt: now,
              }
            : entry,
        )
      : currentActivityLog.filter((entry) => entry.date !== date)
    const result = saveActivityLog(nextActivityLog)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function restoreEntry(entry: ActivityEntry): ActionResult<void> {
    const result = saveActivityLog(
      loadActivityLog()
        .filter((currentEntry) => currentEntry.date !== entry.date)
        .concat({
          ...entry,
          updatedAt: new Date().toISOString(),
          deletedAt: undefined,
        }),
    )
    setLastError(result.ok ? null : result.error)
    return result
  }

  return {
    activityLog,
    getEntry,
    saveEntry,
    deleteEntry,
    restoreEntry,
    lastError,
  }
}
