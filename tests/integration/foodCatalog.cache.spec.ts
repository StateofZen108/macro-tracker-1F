import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCatalogFoodRecord,
  clearCatalogCacheForTests,
  pruneCatalogCache,
  saveCatalogHitsToCache,
  searchCatalogCache,
} from '../../src/domain/foodCatalog'

afterEach(async () => {
  await clearCatalogCacheForTests()
})

describe('food catalog cache', () => {
  it('stores search hits, marks stale entries after the TTL, and prunes old cache rows', async () => {
    const now = '2026-04-12T00:00:00.000Z'
    await saveCatalogHitsToCache(
      [
        {
          remoteKey: 'off-1',
          provider: 'open_food_facts',
          name: 'Chicken Breast',
          brand: 'Store',
          barcode: '123',
        },
      ],
      now,
    )

    const freshResults = await searchCatalogCache('chicken', '2026-04-15T00:00:00.000Z')
    expect(freshResults).toHaveLength(1)
    expect(freshResults[0].stale).toBe(false)

    const staleResults = await searchCatalogCache('chicken', '2026-04-21T00:00:00.000Z')
    expect(staleResults).toHaveLength(1)
    expect(staleResults[0].stale).toBe(true)

    await saveCatalogHitsToCache(
      [
        {
          remoteKey: 'off-old',
          provider: 'open_food_facts',
          name: 'Old Hit',
        },
      ],
      '2026-03-01T00:00:00.000Z',
    )

    await pruneCatalogCache('2026-04-12T00:00:00.000Z')
    const afterPrune = await searchCatalogCache('')
    expect(afterPrune.some((entry) => entry.remoteKey === 'off-old')).toBe(false)
    expect(afterPrune.some((entry) => entry.remoteKey === 'off-1')).toBe(true)
  })

  it('builds stable cache metadata for remote hits', () => {
    const record = buildCatalogFoodRecord(
      {
        remoteKey: 'off-2',
        provider: 'open_food_facts',
        name: 'Greek Yogurt',
      },
      '2026-04-12T00:00:00.000Z',
    )

    expect(record.id).toBe('open_food_facts:off-2')
    expect(record.staleAt).toBe('2026-04-19T00:00:00.000Z')
  })
})
