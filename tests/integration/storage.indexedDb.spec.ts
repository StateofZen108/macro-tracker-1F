/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('storage IndexedDB bootstrap', () => {
  it('hydrates migrated core food data from IndexedDB after localStorage is cleared', async () => {
    window.localStorage.setItem(
      'mt_foods',
      JSON.stringify([
        {
          id: 'custom-oats',
          name: 'Overnight Oats',
          servingSize: 50,
          servingUnit: 'g',
          calories: 190,
          protein: 7,
          carbs: 30,
          fat: 4,
          source: 'custom',
          usageCount: 0,
          createdAt: '2026-04-12T07:00:00.000Z',
          updatedAt: '2026-04-12T07:00:00.000Z',
        },
      ]),
    )
    window.localStorage.setItem('mt_settings', JSON.stringify(null))
    window.localStorage.setItem('mt_schema_version', '7')

    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadFoods } = await import('../../src/utils/storage/foods')

    await initializeStorage()
    expect(loadFoods().some((food) => food.id === 'custom-oats')).toBe(true)

    vi.resetModules()
    window.localStorage.clear()

    const { initializeStorage: initializeStorageAgain } = await import('../../src/utils/storage/schema')
    const { loadFoods: loadFoodsAgain } = await import('../../src/utils/storage/foods')

    await initializeStorageAgain()
    expect(loadFoodsAgain().some((food) => food.id === 'custom-oats')).toBe(true)
  })
})
