/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BodyProgressSnapshot, WeightEntry } from '../../src/types'

function buildWeight(overrides: Partial<WeightEntry> & Pick<WeightEntry, 'date' | 'weight'>): WeightEntry {
  return {
    id: overrides.id ?? `w-${overrides.date}`,
    date: overrides.date,
    weight: overrides.weight,
    unit: overrides.unit ?? 'lb',
    createdAt: overrides.createdAt ?? `${overrides.date}T07:00:00.000Z`,
    updatedAt: overrides.updatedAt,
  }
}

function buildSnapshot(overrides: Partial<BodyProgressSnapshot> & Pick<BodyProgressSnapshot, 'id' | 'date'>): BodyProgressSnapshot {
  return {
    id: overrides.id,
    date: overrides.date,
    metrics: overrides.metrics ?? [],
    photos: [],
    note: overrides.note,
    createdAt: overrides.createdAt ?? `${overrides.date}T08:00:00.000Z`,
    updatedAt: overrides.updatedAt ?? `${overrides.date}T08:00:00.000Z`,
  }
}

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('biometric storage boundaries', () => {
  it('quarantines impossible legacy weights during storage load', async () => {
    window.localStorage.setItem('mt_schema_version', JSON.stringify(1))
    window.localStorage.setItem(
      'mt_weights',
      JSON.stringify([
        buildWeight({ date: '2026-04-27', weight: 200 }),
        buildWeight({ date: '2026-04-28', weight: 99999 }),
      ]),
    )

    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { loadWeights } = await import('../../src/utils/storage/weights')

    await initializeStorage()
    const weights = loadWeights()

    expect(weights).toHaveLength(2)
    expect(weights.find((entry) => entry.date === '2026-04-28')?.sanityStatus).toBe('blocked_invalid')
    expect(weights.find((entry) => entry.date === '2026-04-28')?.proofEligible).toBe(false)
  })

  it('rejects impossible body progress metrics at the storage boundary', async () => {
    const { saveBodyProgressSnapshot, listBodyProgressSnapshots } = await import('../../src/utils/storage/bodyProgress')

    const result = await saveBodyProgressSnapshot(
      buildSnapshot({
        id: 'bad-waist',
        date: '2026-04-29',
        metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 999 }],
      }),
    )

    expect(result.ok).toBe(false)
    expect(await listBodyProgressSnapshots()).toEqual([])
  })
})
