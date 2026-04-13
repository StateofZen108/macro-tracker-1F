// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  enqueueSyncMutation,
  initializeSyncPersistence,
  loadSyncQueue,
  loadSyncState,
  resetSyncRuntimeForAccountSwitch,
  setSyncUser,
} from '../../src/utils/sync/core'

describe('sync core store', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('macrotracker-app')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
    await initializeSyncPersistence()
    resetSyncRuntimeForAccountSwitch()
    setSyncUser(undefined)
  })

  it('returns a stable snapshot reference when the sync state has not changed', () => {
    const firstSnapshot = loadSyncState()
    const secondSnapshot = loadSyncState()

    expect(secondSnapshot).toBe(firstSnapshot)
  })

  it('coalesces queued mutations by scope and record id', () => {
    setSyncUser('user-1', 'sync@example.com')

    enqueueSyncMutation('foods', 'food-1', 'upsert', {
      id: 'food-1',
      name: 'Banana',
    })
    enqueueSyncMutation('foods', 'food-1', 'delete', {
      id: 'food-1',
      archivedAt: '2026-04-12T10:00:00.000Z',
    })

    const queue = loadSyncQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({
      scope: 'foods',
      recordId: 'food-1',
      operation: 'delete',
      payload: {
        id: 'food-1',
        archivedAt: '2026-04-12T10:00:00.000Z',
      },
    })
  })
})
