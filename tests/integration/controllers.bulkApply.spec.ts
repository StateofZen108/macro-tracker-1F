/** @vitest-environment jsdom */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useBulkApplyController } from '../../src/app/useBulkApplyController'
import type { FoodLogEntry, MealTemplate } from '../../src/types'

function entry(id: string, date: string, meal: FoodLogEntry['meal'], name: string): FoodLogEntry {
  return {
    id,
    date,
    meal,
    servings: 1,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
    snapshot: {
      name,
      servingSize: 1,
      servingUnit: 'entry',
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 1,
      source: 'custom',
    },
  }
}

describe('useBulkApplyController', () => {
  it('builds a preview and applies copied entries', () => {
    const previousDayEntry = entry('prev-1', '2026-04-10', 'breakfast', 'Banana')
    const currentEntries: FoodLogEntry[] = []
    const saveEntries = vi.fn(() => ({ ok: true as const, data: undefined }))
    const saveEntriesForDate = vi.fn(() => ({ ok: true as const, data: undefined }))
    const setDayStatus = vi.fn(() => ({ ok: true as const, data: undefined }))
    const queueUndoAction = vi.fn()
    const reportError = vi.fn()
    const templates: MealTemplate[] = []

    const { result } = renderHook(() =>
      useBulkApplyController({
        selectedDate: '2026-04-11',
        selectedDayStatus: 'unmarked',
        entries: currentEntries,
        templates,
        getEntriesForDate: (date) => (date === '2026-04-10' ? [previousDayEntry] : currentEntries),
        saveEntriesForDate,
        saveEntries,
        setDayStatus,
        incrementTemplateUsage: vi.fn(() => ({ ok: true as const, data: undefined })),
        deleteTemplate: vi.fn(() => ({ ok: true as const, data: undefined })),
        restoreTemplate: vi.fn(() => ({ ok: true as const, data: undefined })),
        reportError,
        queueUndoAction,
        scrollEntryIntoView: vi.fn(),
      }),
    )

    act(() => {
      result.current.handleCopyPreviousDay()
    })

    expect(result.current.bulkApplyState?.preview.incomingEntryCount).toBe(1)

    act(() => {
      result.current.applyCurrentBulkApply()
    })

    expect(saveEntries).toHaveBeenCalled()
    expect(queueUndoAction).toHaveBeenCalled()
  })
})
