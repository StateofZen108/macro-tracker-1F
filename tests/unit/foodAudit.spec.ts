import { describe, expect, it } from 'vitest'
import {
  buildFoodAuditEvents,
  replayFoodAuditCalories,
  snapshotFoodLogEntry,
} from '../../src/domain/foodAudit'
import type { FoodLogEntry } from '../../src/types'

function entry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: 'entry-1',
    foodId: 'food-1',
    date: '2026-04-29',
    meal: 'breakfast',
    servings: 1,
    createdAt: '2026-04-29T08:00:00.000Z',
    snapshot: {
      name: 'Greek yogurt',
      servingSize: 170,
      servingUnit: 'g',
      calories: 100,
      protein: 17,
      carbs: 6,
      fat: 0,
      source: 'custom',
      trustEvidence: {
        source: 'custom',
        sourceId: 'food-1',
        status: 'trusted',
        confidence: 1,
        servingBasis: 'verified',
        macroCompleteness: 'complete',
        providerConflict: false,
        reasons: [],
        proofEligible: true,
      },
    },
    ...overrides,
  }
}

describe('food audit ledger', () => {
  it('snapshots logged macros with serving scaling and trust status', () => {
    expect(snapshotFoodLogEntry(entry({ servings: 2 }))).toMatchObject({
      entryId: 'entry-1',
      calories: 200,
      protein: 34,
      trustStatus: 'trusted',
    })
  })

  it('creates deterministic create/edit/delete events from log diffs', () => {
    const created = buildFoodAuditEvents({
      date: '2026-04-29',
      beforeEntries: [],
      afterEntries: [entry()],
      actor: 'user',
      operationId: 'op-1',
      createdAt: '2026-04-29T08:01:00.000Z',
    })
    const edited = buildFoodAuditEvents({
      date: '2026-04-29',
      beforeEntries: [entry()],
      afterEntries: [entry({ servings: 2, updatedAt: '2026-04-29T08:02:00.000Z' })],
      actor: 'user',
      operationId: 'op-2',
      createdAt: '2026-04-29T08:02:00.000Z',
    })
    const deleted = buildFoodAuditEvents({
      date: '2026-04-29',
      beforeEntries: [entry({ servings: 2 })],
      afterEntries: [],
      actor: 'user',
      operationId: 'op-3',
      createdAt: '2026-04-29T08:03:00.000Z',
    })

    expect(created[0]?.eventType).toBe('created')
    expect(edited[0]?.eventType).toBe('edited')
    expect(deleted[0]?.eventType).toBe('deleted')
    expect(new Set([created[0]?.id, edited[0]?.id, deleted[0]?.id]).size).toBe(3)
  })

  it('replays current daily calories from audit events', () => {
    const events = [
      ...buildFoodAuditEvents({
        date: '2026-04-29',
        beforeEntries: [],
        afterEntries: [entry()],
        actor: 'user',
        operationId: 'op-1',
        createdAt: '2026-04-29T08:01:00.000Z',
      }),
      ...buildFoodAuditEvents({
        date: '2026-04-29',
        beforeEntries: [entry()],
        afterEntries: [entry({ servings: 2, updatedAt: '2026-04-29T08:02:00.000Z' })],
        actor: 'user',
        operationId: 'op-2',
        createdAt: '2026-04-29T08:02:00.000Z',
      }),
    ]

    expect(replayFoodAuditCalories(events, '2026-04-29')).toBe(200)
  })
})
