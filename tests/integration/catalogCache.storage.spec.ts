/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

beforeEach(() => {
  window.localStorage.clear()
})

describe('catalog cache storage', () => {
  it('keys cached hits by provider plus remote key', async () => {
    const { loadCatalogCache, upsertRemoteCatalogHits } = await import('../../src/utils/storage/catalogCache')

    const result = await upsertRemoteCatalogHits([
      {
        remoteKey: 'shared-key',
        provider: 'open_food_facts',
        name: 'OFF Yogurt',
      },
      {
        remoteKey: 'shared-key',
        provider: 'usda_fdc',
        name: 'USDA Yogurt',
      },
    ])

    expect(result.ok).toBe(true)
    expect(loadCatalogCache()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'catalog-open_food_facts:shared-key',
          provider: 'open_food_facts',
          remoteKey: 'shared-key',
        }),
        expect.objectContaining({
          id: 'catalog-usda_fdc:shared-key',
          provider: 'usda_fdc',
          remoteKey: 'shared-key',
        }),
      ]),
    )
  })
})
