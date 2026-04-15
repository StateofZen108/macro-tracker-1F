import { useMemo, useState, useSyncExternalStore } from 'react'
import type {
  ActionResult,
  AppActionError,
  DietPhase,
  DietPhaseEvent,
} from '../types'
import { subscribeToStorage } from '../utils/storage/core'
import { loadDietPhaseEvents, saveDietPhaseEvents } from '../utils/storage/dietPhaseEvents'
import { loadDietPhases, saveDietPhases } from '../utils/storage/dietPhases'
import { loadFoodLog } from '../utils/storage/logs'
import { isSyncEnabled } from '../utils/sync/core'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(message: string, code = 'dietPhase'): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function previousDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function overlaps(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  return leftStart <= rightEnd && rightStart <= leftEnd
}

function buildDietPhaseId(type: DietPhase['type']): string {
  return `${type}:${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`
}

function buildDietPhaseEventId(): string {
  return `refeed:${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now()}`
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function hasLoggedFoodOnDate(date: string): boolean {
  return loadFoodLog(date).length > 0
}

function sortEventsByDate(events: DietPhaseEvent[]): DietPhaseEvent[] {
  return [...events].sort((left, right) => {
    const dateComparison = left.date.localeCompare(right.date)
    if (dateComparison !== 0) {
      return dateComparison
    }
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

function trimNotes(notes: string | undefined): string | undefined {
  const trimmed = notes?.trim()
  return trimmed ? trimmed : undefined
}

function softDeleteEvents(
  events: DietPhaseEvent[],
  predicate: (event: DietPhaseEvent) => boolean,
  deletedAt: string,
): DietPhaseEvent[] {
  return events.map((event) =>
    predicate(event)
      ? {
          ...event,
          deletedAt,
          updatedAt: deletedAt,
        }
      : event,
  )
}

export function useDietPhases() {
  const storedPhases = useSyncExternalStore(subscribeToStorage, loadDietPhases, loadDietPhases)
  const storedEvents = useSyncExternalStore(
    subscribeToStorage,
    loadDietPhaseEvents,
    loadDietPhaseEvents,
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  const dietPhases = useMemo(() => storedPhases, [storedPhases])
  const dietPhaseEvents = useMemo(
    () => storedEvents.filter((event) => !event.deletedAt),
    [storedEvents],
  )

  function replacePhases(nextPhases: DietPhase[]): ActionResult<void> {
    const result = saveDietPhases(nextPhases)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function replaceEvents(nextEvents: DietPhaseEvent[]): ActionResult<void> {
    const result = saveDietPhaseEvents(nextEvents)
    setLastError(result.ok ? null : result.error)
    return result
  }

  function listPhaseRefeeds(phaseId: string): DietPhaseEvent[] {
    return sortEventsByDate(
      storedEvents.filter((event) => event.phaseId === phaseId && !event.deletedAt),
    )
  }

  function findPhase(phaseId: string): DietPhase | undefined {
    return storedPhases.find((entry) => entry.id === phaseId)
  }

  function hasOutOfRangeRefeeds(phaseId: string, startDate: string, plannedEndDate: string): boolean {
    return listPhaseRefeeds(phaseId).some(
      (event) => event.date < startDate || event.date > plannedEndDate,
    )
  }

  function startPsmfPhase(startDate: string, plannedEndDate: string, notes?: string): ActionResult<DietPhase> {
    if (!startDate.trim()) {
      return fail('PSMF start date is required.')
    }
    if (!plannedEndDate.trim()) {
      return fail('PSMF end date is required.')
    }
    if (plannedEndDate < startDate) {
      return fail('PSMF end date must be on or after the start date.')
    }

    const conflicting = storedPhases.find(
      (phase) =>
        phase.status !== 'cancelled' &&
        overlaps(startDate, plannedEndDate, phase.startDate, phase.plannedEndDate),
    )
    if (conflicting) {
      return fail('This change would overlap another phase.')
    }

    const now = new Date().toISOString()
    const nextPhase: DietPhase = {
      id: buildDietPhaseId('psmf'),
      type: 'psmf',
      status: startDate <= now.slice(0, 10) ? 'active' : 'planned',
      startDate,
      plannedEndDate,
      notes: trimNotes(notes),
      createdAt: now,
      updatedAt: now,
    }

    const result = replacePhases(storedPhases.concat(nextPhase))
    if (!result.ok) {
      return result as ActionResult<DietPhase>
    }

    return ok(nextPhase)
  }

  function updatePlannedPhase(
    phaseId: string,
    patch: Pick<DietPhase, 'startDate' | 'plannedEndDate' | 'calorieTargetOverride' | 'notes'>,
  ): ActionResult<DietPhase> {
    const phase = findPhase(phaseId)
    if (!phase) {
      return fail('Phase not found.')
    }
    if (phase.status !== 'planned') {
      return fail('Only planned phases can be edited here.')
    }
    if (!patch.startDate.trim()) {
      return fail(phase.type === 'diet_break' ? 'Diet break start date is required.' : 'PSMF start date is required.')
    }
    if (!patch.plannedEndDate.trim()) {
      return fail(phase.type === 'diet_break' ? 'Diet break end date is required.' : 'PSMF end date is required.')
    }
    if (patch.plannedEndDate < patch.startDate) {
      return fail(
        phase.type === 'diet_break'
          ? 'Diet break end date must be on or after the start date.'
          : 'PSMF end date must be on or after the start date.',
      )
    }
    if (
      phase.type === 'diet_break' &&
      (!Number.isFinite(patch.calorieTargetOverride) || (patch.calorieTargetOverride ?? 0) <= 0)
    ) {
      return fail('Diet break calories must be a positive number.')
    }

    const conflicting = storedPhases.find(
      (entry) =>
        entry.id !== phaseId &&
        entry.status !== 'cancelled' &&
        overlaps(patch.startDate, patch.plannedEndDate, entry.startDate, entry.plannedEndDate),
    )
    if (conflicting) {
      return fail('This change would overlap another phase.')
    }
    if (phase.type === 'psmf' && hasOutOfRangeRefeeds(phaseId, patch.startDate, patch.plannedEndDate)) {
      return fail('This change would move an existing refeed outside the phase range.')
    }

    const nextPhase: DietPhase = {
      ...phase,
      startDate: patch.startDate,
      plannedEndDate: patch.plannedEndDate,
      calorieTargetOverride:
        phase.type === 'diet_break' ? Math.round(patch.calorieTargetOverride ?? 0) : undefined,
      notes: trimNotes(patch.notes),
      updatedAt: new Date().toISOString(),
    }

    const result = replacePhases(storedPhases.map((entry) => (entry.id === phaseId ? nextPhase : entry)))
    if (!result.ok) {
      return result as ActionResult<DietPhase>
    }
    return ok(nextPhase)
  }

  function extendPhase(phaseId: string, plannedEndDate: string): ActionResult<DietPhase> {
    const phase = findPhase(phaseId)
    if (!phase) {
      return fail('Phase not found.')
    }
    if (!plannedEndDate.trim()) {
      return fail('PSMF end date is required.')
    }
    if (plannedEndDate < phase.startDate) {
      return fail('PSMF end date must be on or after the start date.')
    }
    if (phase.status === 'expired' && plannedEndDate < todayDateKey()) {
      return fail('Expired phases must be extended to today or later.')
    }

    const conflicting = storedPhases.find(
      (entry) =>
        entry.id !== phaseId &&
        entry.status !== 'cancelled' &&
        overlaps(phase.startDate, plannedEndDate, entry.startDate, entry.plannedEndDate),
    )
    if (conflicting) {
      return fail('This change would overlap another phase.')
    }
    if (phase.type === 'psmf' && hasOutOfRangeRefeeds(phaseId, phase.startDate, plannedEndDate)) {
      return fail('This change would move an existing refeed outside the phase range.')
    }

    const nextPhase: DietPhase = {
      ...phase,
      status: phase.status === 'expired' ? 'active' : phase.status,
      plannedEndDate,
      updatedAt: new Date().toISOString(),
    }
    const result = replacePhases(
      storedPhases.map((entry) => (entry.id === phaseId ? nextPhase : entry)),
    )
    if (!result.ok) {
      return result as ActionResult<DietPhase>
    }

    return ok(nextPhase)
  }

  function completePhase(phaseId: string, actualEndDate: string): ActionResult<DietPhase> {
    const phase = findPhase(phaseId)
    if (!phase) {
      return fail('Phase not found.')
    }
    if (!actualEndDate.trim()) {
      return fail('Phase completion date is required.')
    }
    if (actualEndDate < phase.startDate) {
      return fail('Phase completion date must be on or after the start date.')
    }

    const now = new Date().toISOString()
    const nextEvents =
      phase.type === 'psmf'
        ? softDeleteEvents(
            storedEvents,
            (event) =>
              event.phaseId === phaseId &&
              !event.deletedAt &&
              event.date > actualEndDate,
            now,
          )
        : storedEvents

    const nextPhase: DietPhase = {
      ...phase,
      status: 'completed',
      actualEndDate,
      updatedAt: now,
    }
    const phaseResult = replacePhases(
      storedPhases.map((entry) => (entry.id === phaseId ? nextPhase : entry)),
    )
    if (!phaseResult.ok) {
      return phaseResult as ActionResult<DietPhase>
    }
    const eventResult = replaceEvents(nextEvents)
    if (!eventResult.ok) {
      return eventResult as ActionResult<DietPhase>
    }

    return ok(nextPhase)
  }

  function startDietBreak(
    startDate: string,
    plannedEndDate: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhase> {
    if (!startDate.trim()) {
      return fail('Diet break start date is required.')
    }
    if (!plannedEndDate.trim()) {
      return fail('Diet break end date is required.')
    }
    if (plannedEndDate < startDate) {
      return fail('Diet break end date must be on or after the start date.')
    }
    if (!Number.isFinite(calorieTargetOverride) || calorieTargetOverride <= 0) {
      return fail('Diet break calories must be a positive number.')
    }

    const conflicting = storedPhases.find(
      (phase) =>
        phase.status !== 'cancelled' &&
        overlaps(startDate, plannedEndDate, phase.startDate, phase.plannedEndDate),
    )
    const activePsmf = storedPhases.find((phase) => phase.type === 'psmf' && phase.status === 'active')
    if (conflicting && conflicting.id !== activePsmf?.id) {
      return fail('This change would overlap another phase.')
    }

    const now = new Date().toISOString()
    const nextPhases = storedPhases.map((phase) =>
      phase.id === activePsmf?.id
        ? {
            ...phase,
            status: 'completed' as const,
            actualEndDate: previousDate(startDate),
            plannedEndDate: previousDate(startDate),
            updatedAt: now,
          }
        : phase,
    )

    const nextPhase: DietPhase = {
      id: buildDietPhaseId('diet_break'),
      type: 'diet_break',
      status: startDate <= now.slice(0, 10) ? 'active' : 'planned',
      startDate,
      plannedEndDate,
      calorieTargetOverride: Math.round(calorieTargetOverride),
      notes: trimNotes(notes),
      createdAt: now,
      updatedAt: now,
    }

    const invalidatedEvents = softDeleteEvents(
      storedEvents,
      (event) =>
        event.phaseId === activePsmf?.id &&
        !event.deletedAt &&
        event.date > previousDate(startDate),
      now,
    )
    const phaseResult = replacePhases(nextPhases.concat(nextPhase))
    if (!phaseResult.ok) {
      return phaseResult as ActionResult<DietPhase>
    }
    const eventResult = replaceEvents(invalidatedEvents)
    if (!eventResult.ok) {
      return eventResult as ActionResult<DietPhase>
    }

    return ok(nextPhase)
  }

  function scheduleRefeed(
    phaseId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhaseEvent> {
    const phase = storedPhases.find((entry) => entry.id === phaseId && entry.type === 'psmf')
    if (!phase) {
      return fail('PSMF phase not found.')
    }
    if (phase.status !== 'active' && phase.status !== 'planned') {
      return fail('PSMF phase not available for refeed scheduling.')
    }
    if (!date.trim()) {
      return fail('Refeed date is required.')
    }
    if (!Number.isFinite(calorieTargetOverride)) {
      return fail('Refeed calories must be higher than your current calorie target.')
    }
    if (date < phase.startDate || date > phase.plannedEndDate) {
      return fail('Refeed must fall inside the active PSMF phase.')
    }
    if (
      storedPhases.some(
        (entry) =>
          entry.type === 'diet_break' &&
          entry.status !== 'cancelled' &&
          date >= entry.startDate &&
          date <= entry.plannedEndDate,
      )
    ) {
      return fail('This refeed conflicts with an active diet break.')
    }

    const now = new Date().toISOString()
    const nextEvent: DietPhaseEvent = {
      id: buildDietPhaseEventId(),
      phaseId,
      type: 'refeed_day',
      date,
      calorieTargetOverride: Math.round(calorieTargetOverride),
      notes: trimNotes(notes),
      createdAt: now,
      updatedAt: now,
    }
    const result = replaceEvents(storedEvents.filter((event) => event.date !== date).concat(nextEvent))
    if (!result.ok) {
      return result as ActionResult<DietPhaseEvent>
    }

    return ok(nextEvent)
  }

  function updateRefeed(
    eventId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ): ActionResult<DietPhaseEvent> {
    const existingEvent = storedEvents.find((entry) => entry.id === eventId)
    if (!existingEvent) {
      return fail('Refeed not found.')
    }

    const phase = storedPhases.find((entry) => entry.id === existingEvent.phaseId && entry.type === 'psmf')
    if (!phase) {
      return fail('Active PSMF phase not found.')
    }

    const today = todayDateKey()
    const existingDateIsLocked =
      existingEvent.date < today || (existingEvent.date === today && hasLoggedFoodOnDate(existingEvent.date))
    if (
      existingDateIsLocked &&
      (date !== existingEvent.date || Math.round(calorieTargetOverride) !== existingEvent.calorieTargetOverride)
    ) {
      return fail('Past refeed details are locked after logging begins for that day.')
    }

    if (!date.trim()) {
      return fail('Refeed date is required.')
    }
    if (!Number.isFinite(calorieTargetOverride)) {
      return fail('Refeed calories must be higher than your current calorie target.')
    }
    if (date < phase.startDate || date > phase.plannedEndDate) {
      return fail('Refeed must fall inside the active PSMF phase.')
    }
    if (
      storedPhases.some(
        (entry) =>
          entry.type === 'diet_break' &&
          entry.status !== 'cancelled' &&
          date >= entry.startDate &&
          date <= entry.plannedEndDate,
      )
    ) {
      return fail('This refeed conflicts with an active diet break.')
    }

    const conflictingEvent = storedEvents.find(
      (entry) => entry.id !== eventId && !entry.deletedAt && entry.date === date,
    )
    if (conflictingEvent) {
      return fail('Only one refeed may be scheduled on a single day.')
    }

    const nextEvent: DietPhaseEvent = {
      ...existingEvent,
      date,
      calorieTargetOverride: Math.round(calorieTargetOverride),
      notes: trimNotes(notes),
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
    }
    const result = replaceEvents(
      storedEvents.map((entry) => (entry.id === eventId ? nextEvent : entry)),
    )
    if (!result.ok) {
      return result as ActionResult<DietPhaseEvent>
    }

    return ok(nextEvent)
  }

  function deleteRefeed(eventId: string): ActionResult<void> {
    const event = storedEvents.find((entry) => entry.id === eventId)
    if (!event) {
      return fail('Refeed not found.')
    }

    const today = todayDateKey()
    if (event.date < today || (event.date === today && hasLoggedFoodOnDate(event.date))) {
      return fail('Past refeed details are locked after logging begins for that day.')
    }

    const now = new Date().toISOString()
    const nextEvents = isSyncEnabled()
      ? storedEvents.map((entry) =>
          entry.id === eventId
            ? {
                ...entry,
                deletedAt: now,
                updatedAt: now,
              }
            : entry,
        )
      : storedEvents.filter((entry) => entry.id !== eventId)

    return replaceEvents(nextEvents)
  }

  function cancelPhase(phaseId: string): ActionResult<DietPhase> {
    const phase = findPhase(phaseId)
    if (!phase) {
      return fail('Phase not found.')
    }
    if (phase.status !== 'planned') {
      return fail('Only planned phases can be cancelled.')
    }

    const now = new Date().toISOString()
    const nextPhase: DietPhase = {
      ...phase,
      status: 'cancelled',
      updatedAt: now,
    }
    const nextEvents =
      phase.type === 'psmf'
        ? softDeleteEvents(
            storedEvents,
            (event) => event.phaseId === phaseId && !event.deletedAt,
            now,
          )
        : storedEvents

    const phaseResult = replacePhases(storedPhases.map((entry) => (entry.id === phaseId ? nextPhase : entry)))
    if (!phaseResult.ok) {
      return phaseResult as ActionResult<DietPhase>
    }
    const eventResult = replaceEvents(nextEvents)
    if (!eventResult.ok) {
      return eventResult as ActionResult<DietPhase>
    }

    return ok(nextPhase)
  }

  function updatePhaseNotes(phaseId: string, notes: string | undefined): ActionResult<DietPhase> {
    const phase = findPhase(phaseId)
    if (!phase) {
      return fail('Phase not found.')
    }
    const nextNotes = trimNotes(notes)
    if ((phase.notes ?? undefined) === nextNotes) {
      return ok(phase)
    }

    const nextPhase: DietPhase = {
      ...phase,
      notes: nextNotes,
      updatedAt: new Date().toISOString(),
    }
    const result = replacePhases(storedPhases.map((entry) => (entry.id === phaseId ? nextPhase : entry)))
    if (!result.ok) {
      return result as ActionResult<DietPhase>
    }
    return ok(nextPhase)
  }

  return {
    dietPhases,
    dietPhaseEvents,
    listPhaseRefeeds,
    startPsmfPhase,
    updatePlannedPhase,
    extendPhase,
    completePhase,
    startDietBreak,
    scheduleRefeed,
    updateRefeed,
    deleteRefeed,
    cancelPhase,
    updatePhaseNotes,
    lastError,
  }
}
