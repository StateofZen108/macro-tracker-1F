/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BootstrapStatusSummary, SyncPullResponse } from '../../src/types'
import { DEFAULT_SETTINGS } from '../../src/utils/storage/settings'
import {
  buildSyncCountsFromDataset,
  datasetToSyncRecordDrafts,
  partitionSettingsForSync,
  type SyncedLocalDataset,
} from '../../src/utils/sync/shared'

const ZERO_TIMESTAMP = new Date(0).toISOString()

function buildDataset(overrides: Partial<SyncedLocalDataset> = {}): SyncedLocalDataset {
  const defaultSettings = partitionSettingsForSync(DEFAULT_SETTINGS, {
    settingsTargets: ZERO_TIMESTAMP,
    settingsPreferences: ZERO_TIMESTAMP,
    settingsCoachingRuntime: ZERO_TIMESTAMP,
  })

  return {
    foods: [],
    foodLogEntries: [],
    weights: [],
    dayMeta: [],
    activity: [],
    wellness: [],
    recoveryCheckIns: [],
    dietPhases: [],
    dietPhaseEvents: [],
    interventions: [],
    mealTemplates: [],
    recipes: [],
    favoriteFoods: [],
    weeklyCheckIns: [],
    coachDecisions: [],
    settingsTargets: defaultSettings.settingsTargets,
    settingsPreferences: defaultSettings.settingsPreferences,
    settingsCoachingRuntime: defaultSettings.settingsCoachingRuntime,
    ...overrides,
  }
}

function buildFood(id: string, name: string) {
  return {
    id,
    name,
    servingSize: 100,
    servingUnit: 'g',
    calories: 200,
    protein: 10,
    carbs: 20,
    fat: 5,
    source: 'custom' as const,
    usageCount: 0,
    createdAt: '2026-04-15T10:00:00.000Z',
  }
}

function buildPullResponse(dataset: SyncedLocalDataset, highWatermark = 10): SyncPullResponse {
  return {
    records: datasetToSyncRecordDrafts(dataset).map((record, index) => ({
      scope: record.scope,
      recordId: record.recordId,
      payload: record.payload,
      deletedAt: record.deletedAt,
      serverVersion: index + 1,
      serverUpdatedAt: `2026-04-15T10:${`${index}`.padStart(2, '0')}:00.000Z`,
    })),
    highWatermark,
  }
}

function buildBootstrapStatus(
  bootstrapCompleted: boolean,
  cloudDataset: SyncedLocalDataset,
): BootstrapStatusSummary {
  const emptyCounts = buildSyncCountsFromDataset(buildDataset())
  const cloudCounts = buildSyncCountsFromDataset(cloudDataset)

  return {
    localCounts: emptyCounts,
    cloudCounts,
    localEmpty: true,
    cloudEmpty: Object.values(cloudCounts).every((count) => count === 0),
    bootstrapCompleted,
  }
}

function buildSession(token = 'token-1') {
  return {
    access_token: token,
    user: {
      id: 'user-1',
      email: 'sync@example.com',
    },
  } as const
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

async function setupUseSync(options?: {
  initialSession?: ReturnType<typeof buildSession> | null
  bootstrapStatus?: BootstrapStatusSummary
  fullPull?: SyncPullResponse
  incrementalPull?: SyncPullResponse
  fetchBootstrapStatusImpl?: () => Promise<BootstrapStatusSummary>
  preserveExistingSyncState?: boolean
  beforeRender?: (context: {
    saveFoods: typeof import('../../src/utils/storage/foods').saveFoods
    saveSettings: typeof import('../../src/utils/storage/settings').saveSettings
    syncCore: typeof import('../../src/utils/sync/core')
  }) => Promise<void> | void
}) {
  const authSubscribers = new Set<
    (event: string, session: ReturnType<typeof buildSession> | null) => void
  >()
  const supabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: options?.initialSession ?? null },
        error: null,
      }),
      onAuthStateChange: vi.fn((callback: (event: string, session: ReturnType<typeof buildSession> | null) => void) => {
        authSubscribers.add(callback)
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(() => {
                authSubscribers.delete(callback)
              }),
            },
          },
        }
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }

  const apiMocks = {
    fetchBootstrapStatus: options?.fetchBootstrapStatusImpl
      ? vi.fn(options.fetchBootstrapStatusImpl)
      : vi
          .fn()
          .mockResolvedValue(options?.bootstrapStatus ?? buildBootstrapStatus(true, buildDataset())),
    pullSyncRecords: vi.fn(async (_accessToken: string, afterVersion: number) => {
      if (afterVersion === 0) {
        return options?.fullPull ?? buildPullResponse(buildDataset(), 0)
      }

      return options?.incrementalPull ?? { records: [], highWatermark: afterVersion }
    }),
    pushSyncMutations: vi.fn().mockResolvedValue({
      applied: [],
      deadLetters: [],
      highWatermark: 0,
    }),
    submitBootstrapResolution: vi.fn(),
  }

  vi.doMock('../../src/utils/supabase', () => ({
    buildMagicLinkRedirectUrl: () => null,
    clearAuthCallbackQuery: vi.fn(),
    getSessionAccessToken: (session: ReturnType<typeof buildSession> | null) =>
      session?.access_token ?? null,
    getSupabaseBrowserClient: () => supabase,
    hasAuthCallbackQuery: () => false,
    isSupabaseConfigured: () => true,
  }))
  vi.doMock('../../src/utils/sync/api', () => apiMocks)
  vi.doMock('../../src/utils/diagnostics', () => ({
    recordDiagnosticsEvent: vi.fn().mockResolvedValue(undefined),
  }))

  const { initializeStorage } = await import('../../src/utils/storage/schema')
  const { saveFoods } = await import('../../src/utils/storage/foods')
  const { saveSettings } = await import('../../src/utils/storage/settings')
  const syncCore = await import('../../src/utils/sync/core')

  await initializeStorage()
  await syncCore.initializeSyncPersistence()
  if (!options?.preserveExistingSyncState) {
    syncCore.resetSyncRuntimeForAccountSwitch()
    syncCore.setSyncUser(undefined)
  }
  expect(saveFoods([]).ok).toBe(true)
  expect(saveSettings(DEFAULT_SETTINGS).ok).toBe(true)
  await options?.beforeRender?.({
    saveFoods,
    saveSettings,
    syncCore,
  })

  const { useSync } = await import('../../src/hooks/useSync')

  return {
    apiMocks,
    emitAuthEvent: async (event: string, session: ReturnType<typeof buildSession> | null) => {
      await act(async () => {
        for (const subscriber of [...authSubscribers]) {
          subscriber(event, session)
        }
      })
    },
    result: renderHook(() => useSync()),
    saveFoods,
    saveSettings,
    syncCore,
    supabase,
  }
}

beforeEach(async () => {
  vi.resetModules()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

afterEach(async () => {
  cleanup()
  await act(async () => {
    await Promise.resolve()
  })
  await new Promise((resolve) => window.setTimeout(resolve, 0))
})

describe('useSync reconcile flow', () => {
  it('auto-hydrates an empty device from a bootstrapped cloud account', async () => {
    const session = buildSession()
    const cloudDataset = buildDataset({
      foods: [buildFood('cloud-food', 'Cloud food')],
    })
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(true, cloudDataset),
      fullPull: buildPullResponse(cloudDataset, 8),
    })
    const { loadFoods } = await import('../../src/utils/storage/foods')

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('upToDate')
    })

    expect(loadFoods().map((food) => food.id)).toEqual(['cloud-food'])
    expect(setup.result.result.current.syncState.bootstrapResolvedForUserId).toBe(session.user.id)
    expect(setup.result.result.current.bootstrapResolutionView).toBeNull()
  })

  it('marks an empty device resolved without showing bootstrap UI when the cloud is effectively empty', async () => {
    const session = buildSession()
    const emptyCloudDataset = buildDataset()
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(true, emptyCloudDataset),
      fullPull: buildPullResponse(emptyCloudDataset, 0),
    })

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('upToDate')
    })

    expect(setup.result.result.current.syncState.bootstrapResolvedForUserId).toBe(session.user.id)
    expect(setup.result.result.current.bootstrapResolutionView).toBeNull()
  })

  it('requires explicit resolution when local data exists and the cloud is empty', async () => {
    const session = buildSession()
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(true, buildDataset()),
      fullPull: buildPullResponse(buildDataset(), 0),
      beforeRender: ({ saveSettings }) => {
        expect(
          saveSettings({
            ...DEFAULT_SETTINGS,
            dailyStepTarget: 8000,
          }).ok,
        ).toBe(true)
      },
    })

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('bootstrapRequired')
    })

    expect(setup.result.result.current.bootstrapResolutionView).toMatchObject({
      reason: 'post_sign_in_conflict',
      cloudEffectivelyEmpty: true,
      defaultResolution: 'replaceCloudWithThisDevice',
    })
  })

  it('requires explicit resolution when both local and cloud data exist', async () => {
    const session = buildSession()
    const cloudDataset = buildDataset({
      foods: [buildFood('cloud-food', 'Cloud food')],
    })
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(true, cloudDataset),
      fullPull: buildPullResponse(cloudDataset, 8),
      beforeRender: ({ saveSettings }) => {
        expect(
          saveSettings({
            ...DEFAULT_SETTINGS,
            dailyStepTarget: 8000,
          }).ok,
        ).toBe(true)
      },
    })

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('bootstrapRequired')
    })

    expect(setup.result.result.current.bootstrapResolutionView).toMatchObject({
      reason: 'post_sign_in_conflict',
      cloudEffectivelyEmpty: false,
      defaultResolution: null,
    })
  })

  it('keeps first-device bootstrap required when the cloud account is not bootstrapped', async () => {
    const session = buildSession()
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(false, buildDataset()),
      fullPull: buildPullResponse(buildDataset(), 0),
    })

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('bootstrapRequired')
    })

    expect(setup.result.result.current.bootstrapResolutionView).toMatchObject({
      reason: 'first_device_resolution',
    })
  })

  it('forces a full pull from version 0 when a resolved device has lost its local base state', async () => {
    const session = buildSession()
    const cloudDataset = buildDataset({
      foods: [buildFood('cloud-food', 'Cloud food')],
    })
    const setup = await setupUseSync({
      initialSession: session,
      fullPull: buildPullResponse(cloudDataset, 15),
      incrementalPull: { records: [], highWatermark: 99 },
      beforeRender: ({ syncCore }) => {
        syncCore.writeSyncState({
          ...syncCore.loadSyncState(),
          currentUserId: session.user.id,
          bootstrapResolvedForUserId: session.user.id,
          highWatermark: 99,
        })
      },
    })

    await waitFor(() => {
      expect(setup.apiMocks.pullSyncRecords).toHaveBeenCalledWith(session.access_token, 0)
    })

    expect(
      setup.apiMocks.pullSyncRecords.mock.calls.some(([, afterVersion]) => afterVersion === 99),
    ).toBe(false)
  })

  it('rehydrates again on the same session after a previously resolved device loses local data', async () => {
    const session = buildSession()
    const cloudDataset = buildDataset({
      foods: [buildFood('cloud-food', 'Cloud food')],
    })
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(true, cloudDataset),
      fullPull: buildPullResponse(cloudDataset, 8),
    })
    const { loadFoods } = await import('../../src/utils/storage/foods')

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('upToDate')
    })

    expect(
      setup.apiMocks.pullSyncRecords.mock.calls.filter(([, afterVersion]) => afterVersion === 0),
    ).toHaveLength(1)

    await act(async () => {
      expect(setup.saveFoods([]).ok).toBe(true)
      expect(setup.saveSettings(DEFAULT_SETTINGS).ok).toBe(true)
    })

    expect(loadFoods()).toHaveLength(0)

    await act(async () => {
      await setup.result.result.current.syncNow()
    })

    await waitFor(() => {
      expect(
        setup.apiMocks.pullSyncRecords.mock.calls.filter(([, afterVersion]) => afterVersion === 0),
      ).toHaveLength(2)
    })

    expect(loadFoods().map((food) => food.id)).toEqual(['cloud-food'])
  })

  it('moves queued mutations to dead letter before hydrating an empty device', async () => {
    const session = buildSession()
    const cloudDataset = buildDataset({
      foods: [buildFood('cloud-food', 'Cloud food')],
    })
    const setup = await setupUseSync({
      initialSession: session,
      bootstrapStatus: buildBootstrapStatus(true, cloudDataset),
      fullPull: buildPullResponse(cloudDataset, 9),
      beforeRender: ({ syncCore }) => {
        syncCore.setSyncUser(session.user.id, session.user.email)
        syncCore.enqueueSyncMutation('foods', 'food-queued', 'upsert', {
          id: 'food-queued',
          name: 'Queued food',
        })
      },
    })

    await waitFor(() => {
      expect(setup.syncCore.loadSyncDeadLetters()).toHaveLength(1)
    })

    expect(setup.syncCore.loadSyncDeadLetters()[0].code).toBe('missingLocalBaseState')
    expect(setup.result.result.current.syncState.blockingMessage).toMatch(/missing on this device/i)
  })

  it('dedupes startup reconcile with a same-session SIGNED_IN event and ignores later duplicate SIGNED_IN callbacks', async () => {
    const session = buildSession()
    const deferredBootstrap = createDeferred<BootstrapStatusSummary>()
    const setup = await setupUseSync({
      initialSession: session,
      fetchBootstrapStatusImpl: () => deferredBootstrap.promise,
      fullPull: buildPullResponse(buildDataset(), 0),
    })

    await waitFor(() => {
      expect(setup.apiMocks.fetchBootstrapStatus).toHaveBeenCalledTimes(1)
    })

    await setup.emitAuthEvent('SIGNED_IN', session)
    expect(setup.apiMocks.fetchBootstrapStatus).toHaveBeenCalledTimes(1)

    deferredBootstrap.resolve(buildBootstrapStatus(false, buildDataset()))

    await waitFor(() => {
      expect(setup.result.result.current.syncState.status).toBe('bootstrapRequired')
    })

    await setup.emitAuthEvent('SIGNED_IN', session)
    expect(setup.apiMocks.fetchBootstrapStatus).toHaveBeenCalledTimes(1)
  })

  it('does not reconcile on INITIAL_SESSION, TOKEN_REFRESHED, USER_UPDATED, or PASSWORD_RECOVERY events', async () => {
    const session = buildSession()
    const setup = await setupUseSync({
      initialSession: null,
    })

    for (const event of ['INITIAL_SESSION', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY']) {
      await setup.emitAuthEvent(event, session)
    }

    expect(setup.apiMocks.fetchBootstrapStatus).not.toHaveBeenCalled()
    expect(setup.result.result.current.session?.user.id).toBe(session.user.id)
  })
})
