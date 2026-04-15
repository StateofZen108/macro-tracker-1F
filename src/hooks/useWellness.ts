import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, WellnessEntry } from '../types'
import { subscribeToStorage } from '../utils/storage/core'
import { loadWellnessEntries, saveWellnessEntries } from '../utils/storage/wellness'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function useWellness() {
  const storedEntries = useSyncExternalStore(
    subscribeToStorage,
    loadWellnessEntries,
    loadWellnessEntries,
  )
  const wellnessEntries = useMemo(
    () => storedEntries.filter((entry) => !entry.deletedAt),
    [storedEntries],
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function mergeImportedEntries(entries: WellnessEntry[]): ActionResult<WellnessEntry[]> {
    const merged = new Map<string, WellnessEntry>()
    for (const entry of storedEntries) {
      merged.set(`${entry.provider}:${entry.date}`, entry)
    }
    for (const entry of entries) {
      const key = `${entry.provider}:${entry.date}`
      const existing = merged.get(key)
      if (!existing || existing.updatedAt < entry.updatedAt) {
        merged.set(key, entry)
      }
    }
    const nextEntries = [...merged.values()]
    const result = saveWellnessEntries(nextEntries)
    setLastError(result.ok ? null : result.error)
    return result.ok ? ok(nextEntries) : (result as ActionResult<WellnessEntry[]>)
  }

  return {
    wellnessEntries,
    mergeImportedEntries,
    lastError,
  }
}
