/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function offsetDateKey(offsetDays: number): string {
  const date = new Date(`${todayDateKey()}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

beforeEach(async () => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('diet phase editor controller', () => {
  it('edits planned phases and soft-deletes attached future refeeds on cancel', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveDietPhases, loadDietPhases } = await import('../../src/utils/storage/dietPhases')
    const { saveDietPhaseEvents, loadDietPhaseEvents } = await import('../../src/utils/storage/dietPhaseEvents')
    const { useDietPhases } = await import('../../src/hooks/useDietPhases')

    await initializeStorage()

    expect(
      saveDietPhases([
        {
          id: 'phase-planned',
          type: 'psmf',
          status: 'planned',
          startDate: offsetDateKey(2),
          plannedEndDate: offsetDateKey(12),
          notes: 'Original block',
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)
    expect(
      saveDietPhaseEvents([
        {
          id: 'refeed-planned',
          phaseId: 'phase-planned',
          type: 'refeed_day',
          date: offsetDateKey(4),
          calorieTargetOverride: 2200,
          notes: 'Future refeed',
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)

    const { result } = renderHook(() => useDietPhases())

    let editResult
    await act(async () => {
      editResult = result.current.updatePlannedPhase('phase-planned', {
        startDate: offsetDateKey(3),
        plannedEndDate: offsetDateKey(14),
        notes: 'Updated block',
        calorieTargetOverride: undefined,
      })
    })

    expect(editResult?.ok).toBe(true)
    expect(loadDietPhases()[0]).toMatchObject({
      startDate: offsetDateKey(3),
      plannedEndDate: offsetDateKey(14),
      notes: 'Updated block',
    })

    let cancelResult
    await act(async () => {
      cancelResult = result.current.cancelPhase('phase-planned')
    })

    expect(cancelResult?.ok).toBe(true)
    expect(loadDietPhases()[0]).toMatchObject({ status: 'cancelled' })
    expect(loadDietPhaseEvents()[0].deletedAt).toBeTruthy()
  })

  it('soft-deletes only out-of-range future refeeds when completing early', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveDietPhases } = await import('../../src/utils/storage/dietPhases')
    const { saveDietPhaseEvents, loadDietPhaseEvents } = await import('../../src/utils/storage/dietPhaseEvents')
    const { useDietPhases } = await import('../../src/hooks/useDietPhases')

    await initializeStorage()

    expect(
      saveDietPhases([
        {
          id: 'phase-active',
          type: 'psmf',
          status: 'active',
          startDate: offsetDateKey(-3),
          plannedEndDate: offsetDateKey(8),
          createdAt: `${offsetDateKey(-3)}T07:00:00.000Z`,
          updatedAt: `${offsetDateKey(-3)}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)
    expect(
      saveDietPhaseEvents([
        {
          id: 'refeed-keep',
          phaseId: 'phase-active',
          type: 'refeed_day',
          date: todayDateKey(),
          calorieTargetOverride: 2300,
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
        {
          id: 'refeed-delete',
          phaseId: 'phase-active',
          type: 'refeed_day',
          date: offsetDateKey(3),
          calorieTargetOverride: 2400,
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)

    const { result } = renderHook(() => useDietPhases())

    let completeResult
    await act(async () => {
      completeResult = result.current.completePhase('phase-active', todayDateKey())
    })

    expect(completeResult?.ok).toBe(true)
    const events = loadDietPhaseEvents()
    expect(events.find((event) => event.id === 'refeed-keep')?.deletedAt).toBeUndefined()
    expect(events.find((event) => event.id === 'refeed-delete')?.deletedAt).toBeTruthy()
  })

  it('blocks phase reshape when attached refeeds would fall outside the new range', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveDietPhases } = await import('../../src/utils/storage/dietPhases')
    const { saveDietPhaseEvents } = await import('../../src/utils/storage/dietPhaseEvents')
    const { useDietPhases } = await import('../../src/hooks/useDietPhases')

    await initializeStorage()

    expect(
      saveDietPhases([
        {
          id: 'phase-reshape',
          type: 'psmf',
          status: 'planned',
          startDate: offsetDateKey(1),
          plannedEndDate: offsetDateKey(10),
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)
    expect(
      saveDietPhaseEvents([
        {
          id: 'refeed-outside',
          phaseId: 'phase-reshape',
          type: 'refeed_day',
          date: offsetDateKey(9),
          calorieTargetOverride: 2200,
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)

    const { result } = renderHook(() => useDietPhases())

    let updateResult
    await act(async () => {
      updateResult = result.current.updatePlannedPhase('phase-reshape', {
        startDate: offsetDateKey(1),
        plannedEndDate: offsetDateKey(5),
        notes: undefined,
        calorieTargetOverride: undefined,
      })
    })

    expect(updateResult?.ok).toBe(false)
    expect(updateResult?.error.message).toMatch(/outside the phase range/i)
  })

  it('locks same-day refeed date and calories after logging begins but still allows notes updates', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveDietPhases } = await import('../../src/utils/storage/dietPhases')
    const { saveDietPhaseEvents, loadDietPhaseEvents } = await import('../../src/utils/storage/dietPhaseEvents')
    const { saveFoodLog } = await import('../../src/utils/storage/logs')
    const { useDietPhases } = await import('../../src/hooks/useDietPhases')

    await initializeStorage()

    expect(
      saveDietPhases([
        {
          id: 'phase-locks',
          type: 'psmf',
          status: 'active',
          startDate: offsetDateKey(-4),
          plannedEndDate: offsetDateKey(5),
          createdAt: `${offsetDateKey(-4)}T07:00:00.000Z`,
          updatedAt: `${offsetDateKey(-4)}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)
    expect(
      saveDietPhaseEvents([
        {
          id: 'refeed-today',
          phaseId: 'phase-locks',
          type: 'refeed_day',
          date: todayDateKey(),
          calorieTargetOverride: 2400,
          notes: 'Original',
          createdAt: `${todayDateKey()}T07:00:00.000Z`,
          updatedAt: `${todayDateKey()}T07:00:00.000Z`,
        },
      ]).ok,
    ).toBe(true)
    expect(
      saveFoodLog(todayDateKey(), [
        {
          id: 'entry-1',
          foodId: 'food-1',
          meal: 'breakfast',
          servings: 1,
          createdAt: `${todayDateKey()}T08:00:00.000Z`,
          updatedAt: `${todayDateKey()}T08:00:00.000Z`,
          snapshot: {
            id: 'food-1',
            name: 'Egg whites',
            servingSize: 100,
            servingUnit: 'g',
            calories: 52,
            protein: 11,
            carbs: 1,
            fat: 0,
            source: 'custom',
            updatedAt: `${todayDateKey()}T08:00:00.000Z`,
          },
        },
      ]).ok,
    ).toBe(true)

    const { result } = renderHook(() => useDietPhases())

    let lockedResult
    await act(async () => {
      lockedResult = result.current.updateRefeed(
        'refeed-today',
        offsetDateKey(1),
        2600,
        'Should fail',
      )
    })

    expect(lockedResult?.ok).toBe(false)
    expect(lockedResult?.error.message).toMatch(/locked/i)

    let notesOnlyResult
    await act(async () => {
      notesOnlyResult = result.current.updateRefeed(
        'refeed-today',
        todayDateKey(),
        2400,
        'Updated notes only',
      )
    })

    expect(notesOnlyResult?.ok).toBe(true)
    expect(loadDietPhaseEvents()[0]).toMatchObject({
      date: todayDateKey(),
      calorieTargetOverride: 2400,
      notes: 'Updated notes only',
    })
  })
})

describe('phase selection helpers', () => {
  it('sorts historical phases by effective end date then updatedAt', async () => {
    const { sortHistoricalPhases } = await import('../../src/app/phasePlanner')

    const sorted = sortHistoricalPhases([
      {
        id: 'phase-a',
        type: 'psmf',
        status: 'completed',
        startDate: '2026-04-01',
        plannedEndDate: '2026-04-10',
        actualEndDate: '2026-04-09',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-09T10:00:00.000Z',
      },
      {
        id: 'phase-b',
        type: 'psmf',
        status: 'completed',
        startDate: '2026-04-02',
        plannedEndDate: '2026-04-10',
        actualEndDate: '2026-04-09',
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-09T12:00:00.000Z',
      },
      {
        id: 'phase-c',
        type: 'psmf',
        status: 'cancelled',
        startDate: '2026-04-05',
        plannedEndDate: '2026-04-15',
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-15T08:00:00.000Z',
      },
    ] as never)

    expect(sorted.map((phase) => phase.id)).toEqual(['phase-c', 'phase-b', 'phase-a'])
  })

  it('preserves a valid selected phase and recomputes when the selection becomes invalid', async () => {
    const { resolveSelectedPsmfPhaseId, sortSelectablePsmfPhases } = await import('../../src/app/phasePlanner')

    const phases = sortSelectablePsmfPhases([
      {
        id: 'phase-planned',
        type: 'psmf',
        status: 'planned',
        startDate: '2026-04-20',
        plannedEndDate: '2026-04-30',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'phase-active',
        type: 'psmf',
        status: 'active',
        startDate: '2026-04-10',
        plannedEndDate: '2026-04-18',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'phase-completed',
        type: 'psmf',
        status: 'completed',
        startDate: '2026-03-20',
        plannedEndDate: '2026-03-28',
        actualEndDate: '2026-03-28',
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    ] as never)

    expect(resolveSelectedPsmfPhaseId(phases, null)).toBe('phase-active')
    expect(resolveSelectedPsmfPhaseId(phases, 'phase-planned')).toBe('phase-planned')

    const withoutPlanned = phases.filter((phase) => phase.id !== 'phase-planned')
    expect(resolveSelectedPsmfPhaseId(withoutPlanned, 'phase-planned')).toBe('phase-active')
    expect(resolveSelectedPsmfPhaseId([], 'phase-active')).toBeNull()
  })
})
