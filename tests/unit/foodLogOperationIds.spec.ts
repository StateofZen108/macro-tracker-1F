// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoodLogEntry } from '../../src/types'

async function resetStorage(): Promise<void> {
  window.localStorage.clear()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('macrotracker-app')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

function buildEntry(id: string, operationId: string): FoodLogEntry {
  return {
    id,
    operationId,
    foodId: `food-${id}`,
    date: '2026-04-29',
    meal: 'breakfast',
    servings: 1,
    createdAt: `2026-04-29T08:0${id}.000Z`,
    snapshot: {
      name: `Food ${id}`,
      servingSize: 1,
      servingUnit: 'serving',
      calories: 100,
      protein: 10,
      carbs: 10,
      fat: 2,
      source: 'custom',
    },
  }
}

beforeEach(async () => {
  vi.resetModules()
  await resetStorage()
})

describe('food log operation ids', () => {
  it('rejects duplicate operation ids at the storage boundary', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadFoodLog, saveFoodLog } = await import('../../src/utils/storage/logs')
    await initializeStorage()

    const result = saveFoodLog('2026-04-29', [
      buildEntry('1', 'food-log:duplicate'),
      buildEntry('2', 'food-log:duplicate'),
    ])

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'duplicateFoodLogOperation' },
    })
    expect(loadFoodLog('2026-04-29')).toHaveLength(0)
  })

  it('persists distinct operation ids', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadFoodLog, saveFoodLog } = await import('../../src/utils/storage/logs')
    await initializeStorage()

    const result = saveFoodLog('2026-04-29', [
      buildEntry('1', 'food-log:first'),
      buildEntry('2', 'food-log:second'),
    ])

    expect(result.ok).toBe(true)
    expect(loadFoodLog('2026-04-29').map((entry) => entry.operationId)).toEqual([
      'food-log:first',
      'food-log:second',
    ])
  })
})
