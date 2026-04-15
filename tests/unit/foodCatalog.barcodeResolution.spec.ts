import { describe, expect, it, vi } from 'vitest'
import { resolveBarcodeLookup } from '../../src/domain/foodCatalog/barcodeResolution'
import type { BarcodeLookupResult, Food } from '../../src/types'

function buildFood(overrides: Partial<Food> = {}): Food {
  return {
    id: overrides.id ?? 'food-1',
    name: overrides.name ?? 'Protein Yogurt',
    brand: overrides.brand ?? 'Store',
    servingSize: overrides.servingSize ?? 170,
    servingUnit: overrides.servingUnit ?? 'g',
    calories: overrides.calories ?? 100,
    protein: overrides.protein ?? 17,
    carbs: overrides.carbs ?? 6,
    fat: overrides.fat ?? 0,
    fiber: overrides.fiber,
    sugars: overrides.sugars,
    salt: overrides.salt,
    sodium: overrides.sodium,
    nutrients: overrides.nutrients,
    labelNutrition: overrides.labelNutrition,
    source: overrides.source ?? 'api',
    provider: overrides.provider,
    importConfidence: overrides.importConfidence,
    sourceQuality: overrides.sourceQuality,
    sourceQualityNote: overrides.sourceQualityNote,
    importTrust: overrides.importTrust,
    searchAliases: overrides.searchAliases,
    remoteReferences: overrides.remoteReferences,
    usageCount: overrides.usageCount ?? 0,
    createdAt: overrides.createdAt ?? '2026-04-01T00:00:00.000Z',
    barcode: overrides.barcode,
    archivedAt: overrides.archivedAt,
    lastUsedAt: overrides.lastUsedAt,
    lastServings: overrides.lastServings,
    updatedAt: overrides.updatedAt,
  }
}

function buildLookupResult(): BarcodeLookupResult {
  return {
    candidate: {
      provider: 'fatsecret',
      remoteKey: 'fs-123',
      barcode: '0123456789012',
      name: 'Protein Yogurt',
      brand: 'Remote',
      servingSize: 170,
      servingUnit: 'g',
      calories: 100,
      protein: 17,
      carbs: 6,
      fat: 0,
      source: 'api',
      verification: 'verified',
      nutritionBasis: 'serving',
      importConfidence: 'direct_match',
      sourceQuality: 'high',
      importTrust: {
        level: 'exact_autolog',
        servingBasis: 'serving',
        servingBasisSource: 'provider_serving',
        blockingIssues: [],
      },
    },
    missingFields: [],
  }
}

describe('resolveBarcodeLookup', () => {
  it('prefers the strongest exact local barcode match', async () => {
    const remoteLookup = vi.fn(async () => ({ ok: true as const, data: buildLookupResult() }))
    const result = await resolveBarcodeLookup({
      barcode: '0123456789012',
      foods: [
        buildFood({
          id: 'food-weaker',
          barcode: '0123456789012',
          usageCount: 50,
          importTrust: {
            level: 'exact_review',
            servingBasis: 'serving',
            servingBasisSource: 'manual_review',
            blockingIssues: [],
            verifiedAt: '2026-04-05T00:00:00.000Z',
          },
        }),
        buildFood({
          id: 'food-stronger',
          barcode: '0123456789012',
          usageCount: 2,
          importTrust: {
            level: 'exact_autolog',
            servingBasis: 'serving',
            servingBasisSource: 'provider_serving',
            blockingIssues: [],
            verifiedAt: '2026-04-02T00:00:00.000Z',
          },
        }),
      ],
      lookupRemote: remoteLookup,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.source).toBe('local_barcode')
      expect(result.data.food?.id).toBe('food-stronger')
    }
    expect(remoteLookup).not.toHaveBeenCalled()
  })

  it('breaks exact barcode ties by stable id after higher-order fields tie', async () => {
    const remoteLookup = vi.fn(async () => ({ ok: true as const, data: buildLookupResult() }))
    const result = await resolveBarcodeLookup({
      barcode: '0123456789012',
      foods: [
        buildFood({
          id: 'food-b',
          barcode: '0123456789012',
          usageCount: 4,
          importTrust: {
            level: 'exact_review',
            servingBasis: 'serving',
            servingBasisSource: 'manual_review',
            blockingIssues: [],
            verifiedAt: '2026-04-04T00:00:00.000Z',
          },
        }),
        buildFood({
          id: 'food-a',
          barcode: '0123456789012',
          usageCount: 4,
          importTrust: {
            level: 'exact_review',
            servingBasis: 'serving',
            servingBasisSource: 'manual_review',
            blockingIssues: [],
            verifiedAt: '2026-04-04T00:00:00.000Z',
          },
        }),
      ],
      lookupRemote: remoteLookup,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.source).toBe('local_barcode')
      expect(result.data.food?.id).toBe('food-a')
    }
    expect(remoteLookup).not.toHaveBeenCalled()
  })

  it('prefers fatsecret-linked remote references over weaker providers', async () => {
    const remoteLookup = vi.fn(async () => ({ ok: true as const, data: buildLookupResult() }))
    const result = await resolveBarcodeLookup({
      barcode: '0987654321098',
      foods: [
        buildFood({
          id: 'off-food',
          remoteReferences: [
            {
              provider: 'open_food_facts',
              remoteKey: 'off-123',
              barcode: '0987654321098',
            },
          ],
        }),
        buildFood({
          id: 'fatsecret-food',
          remoteReferences: [
            {
              provider: 'fatsecret',
              remoteKey: 'fs-123',
              barcode: '0987654321098',
            },
          ],
        }),
      ],
      lookupRemote: remoteLookup,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.source).toBe('local_remote_reference')
      expect(result.data.food?.id).toBe('fatsecret-food')
    }
    expect(remoteLookup).not.toHaveBeenCalled()
  })

  it('falls through to the remote lookup when no local match exists', async () => {
    const remoteLookup = vi.fn(async () => ({ ok: true as const, data: buildLookupResult() }))
    const result = await resolveBarcodeLookup({
      barcode: '0123456789012',
      foods: [buildFood({ barcode: '1111111111111' })],
      lookupRemote: remoteLookup,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.source).toBe('remote')
      expect(result.data.lookupResult?.candidate.remoteKey).toBe('fs-123')
    }
    expect(remoteLookup).toHaveBeenCalledOnce()
  })
})
