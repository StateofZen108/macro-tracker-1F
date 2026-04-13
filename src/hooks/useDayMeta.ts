import { useMemo, useState, useSyncExternalStore } from 'react'
import type {
  ActionResult,
  AppActionError,
  DayConfounderMarker,
  DayMeta,
  DayStatus,
} from '../types'
import { subscribeToStorage } from '../utils/storage/core'
import { loadDayMeta, saveDayMeta } from '../utils/storage/dayMeta'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sortDayMeta(entries: DayMeta[]): DayMeta[] {
  return [...entries].sort((left, right) => left.date.localeCompare(right.date))
}

export function useDayMeta() {
  const storedDayMeta = useSyncExternalStore(subscribeToStorage, loadDayMeta, loadDayMeta)
  const [lastError, setLastError] = useState<AppActionError | null>(null)
  const dayMeta = useMemo(() => sortDayMeta(storedDayMeta), [storedDayMeta])

  function getDayMeta(date: string): DayMeta | undefined {
    return loadDayMeta().find((entry) => entry.date === date)
  }

  function getDayStatus(date: string): DayStatus {
    return getDayMeta(date)?.status ?? 'unmarked'
  }

  function setDayStatus(date: string, status: DayStatus): ActionResult<DayMeta | null> {
    const now = new Date().toISOString()
    const currentEntry = getDayMeta(date)
    const nextDayMeta = loadDayMeta().filter((entry) => entry.date !== date)

    if (status !== 'unmarked' || (currentEntry?.markers?.length ?? 0) > 0) {
      nextDayMeta.push({
        date,
        status,
        markers: currentEntry?.markers,
        updatedAt: now,
      })
    }

    const result = saveDayMeta(nextDayMeta)
    if (!result.ok) {
      setLastError(result.error)
      return result as ActionResult<DayMeta | null>
    }

    setLastError(null)
    return ok(
      status === 'unmarked'
        ? null
        : {
            date,
            status,
            updatedAt: now,
          },
    )
  }

  function toggleDayMarker(
    date: string,
    marker: DayConfounderMarker,
  ): ActionResult<DayMeta> {
    const now = new Date().toISOString()
    const currentEntry = getDayMeta(date)
    const currentMarkers = new Set(currentEntry?.markers ?? [])
    if (currentMarkers.has(marker)) {
      currentMarkers.delete(marker)
    } else {
      currentMarkers.add(marker)
    }

    const nextMarkers = [...currentMarkers]
    const nextDayMeta = loadDayMeta().filter((entry) => entry.date !== date)
    if (currentEntry?.status !== 'unmarked' || nextMarkers.length > 0) {
      nextDayMeta.push({
        date,
        status: currentEntry?.status ?? 'unmarked',
        markers: nextMarkers.length ? nextMarkers : undefined,
        updatedAt: now,
      })
    }

    const result = saveDayMeta(nextDayMeta)
    if (!result.ok) {
      setLastError(result.error)
      return result as ActionResult<DayMeta>
    }

    const nextEntry: DayMeta = {
      date,
      status: currentEntry?.status ?? 'unmarked',
      markers: nextMarkers.length ? nextMarkers : undefined,
      updatedAt: now,
    }
    setLastError(null)
    return ok(nextEntry)
  }

  return {
    dayMeta,
    getDayMeta,
    getDayStatus,
    setDayStatus,
    toggleDayMarker,
    lastError,
  }
}
