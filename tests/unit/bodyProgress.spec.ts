import { describe, expect, it } from 'vitest'
import type { BodyProgressSnapshot } from '../../src/types'
import {
  deleteBodyProgressSnapshot,
  listBodyProgressSnapshots,
  saveBodyProgressSnapshot,
} from '../../src/utils/storage/bodyProgress'

function buildSnapshot(
  overrides: Partial<BodyProgressSnapshot> & Pick<BodyProgressSnapshot, 'id' | 'date'>,
): BodyProgressSnapshot {
  return {
    id: overrides.id,
    date: overrides.date,
    metrics: overrides.metrics ?? [],
    photos: overrides.photos ?? [],
    note: overrides.note,
    createdAt: overrides.createdAt ?? `${overrides.date}T08:00:00.000Z`,
    updatedAt: overrides.updatedAt ?? `${overrides.date}T08:00:00.000Z`,
  }
}

describe('body progress storage', () => {
  it('persists snapshots and sorts newest dates first', async () => {
    await saveBodyProgressSnapshot(
      buildSnapshot({
        id: 'older',
        date: '2026-04-14',
        metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 80 }],
      }),
    )
    await saveBodyProgressSnapshot(
      buildSnapshot({
        id: 'newer',
        date: '2026-04-16',
        metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 79 }],
      }),
    )

    const snapshots = await listBodyProgressSnapshots()

    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(['newer', 'older'])
  })

  it('updates an existing snapshot in place', async () => {
    await saveBodyProgressSnapshot(
      buildSnapshot({
        id: 'same-date',
        date: '2026-04-16',
        metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 80 }],
      }),
    )

    await saveBodyProgressSnapshot(
      buildSnapshot({
        id: 'same-date',
        date: '2026-04-16',
        metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 78.5 }],
        note: 'Sharper than last week',
        updatedAt: '2026-04-16T09:00:00.000Z',
      }),
    )

    const snapshots = await listBodyProgressSnapshots()

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.metrics[0]?.value).toBe(78.5)
    expect(snapshots[0]?.note).toBe('Sharper than last week')
  })

  it('deletes a stored snapshot', async () => {
    await saveBodyProgressSnapshot(
      buildSnapshot({
        id: 'delete-me',
        date: '2026-04-16',
      }),
    )

    const result = await deleteBodyProgressSnapshot('delete-me')
    const snapshots = await listBodyProgressSnapshots()

    expect(result.ok).toBe(true)
    expect(snapshots).toEqual([])
  })
})
