/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PwaRuntimeState } from '../../src/pwa/runtime'

const runtimeListeners = new Set<() => void>()
let runtimeSnapshot: PwaRuntimeState
const refreshRuntimeMock = vi.fn<() => Promise<PwaRuntimeState>>()
const applyPwaUpdateMock = vi.fn<() => Promise<void>>()
const recordDiagnosticsEventMock = vi.fn<() => Promise<void>>()

function setRuntimeSnapshot(nextSnapshot: Partial<PwaRuntimeState>) {
  runtimeSnapshot = {
    currentBuildId: 'test-build',
    waitingWorkerPresent: false,
    waitingBuildId: null,
    ...runtimeSnapshot,
    ...nextSnapshot,
  }

  for (const listener of runtimeListeners) {
    listener()
  }
}

describe('usePwaShell', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    window.localStorage.clear()
    window.sessionStorage.clear()
    runtimeListeners.clear()
    runtimeSnapshot = {
      currentBuildId: 'test-build',
      waitingWorkerPresent: false,
      waitingBuildId: null,
    }
    refreshRuntimeMock.mockReset()
    refreshRuntimeMock.mockImplementation(async () => runtimeSnapshot)
    applyPwaUpdateMock.mockReset()
    applyPwaUpdateMock.mockResolvedValue(undefined)
    recordDiagnosticsEventMock.mockReset()
    recordDiagnosticsEventMock.mockResolvedValue(undefined)

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36',
    })

    vi.doMock('../../src/pwa/runtime', () => ({
      applyPwaUpdate: applyPwaUpdateMock,
      getPwaRuntimeSnapshot: () => runtimeSnapshot,
      refreshPwaRuntimeSnapshot: refreshRuntimeMock,
      subscribePwaRuntime: (listener: () => void) => {
        runtimeListeners.add(listener)
        return () => runtimeListeners.delete(listener)
      },
    }))
    vi.doMock('../../src/utils/diagnostics', () => ({
      recordDiagnosticsEvent: recordDiagnosticsEventMock,
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-applies a safe standalone update on cold start', async () => {
    vi.doMock('../../src/config/featureFlags', () => ({
      FEATURE_FLAGS: {
        safeAutoUpdatePwa: true,
      },
    }))
    const { usePwaShell } = await import('../../src/hooks/usePwaShell')

    setRuntimeSnapshot({
      waitingWorkerPresent: true,
      waitingBuildId: 'build-b',
    })

    renderHook(() =>
      usePwaShell({
        bootHealthy: true,
        reloadSafetyBlocked: false,
        lastStorageMutationAt: Date.now() - 2500,
        hasUserInteracted: false,
      }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(applyPwaUpdateMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the update deferred after the first interaction', async () => {
    vi.doMock('../../src/config/featureFlags', () => ({
      FEATURE_FLAGS: {
        safeAutoUpdatePwa: true,
      },
    }))
    const { usePwaShell } = await import('../../src/hooks/usePwaShell')

    setRuntimeSnapshot({
      waitingWorkerPresent: true,
      waitingBuildId: 'build-b',
    })

    const hook = renderHook(() =>
      usePwaShell({
        bootHealthy: true,
        reloadSafetyBlocked: false,
        lastStorageMutationAt: Date.now() - 2500,
        hasUserInteracted: true,
      }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(applyPwaUpdateMock).not.toHaveBeenCalled()
    expect(hook.result.current.updateStatus).toBe('deferred')
  })

  it('allows manual apply even when safe auto update is disabled', async () => {
    vi.doMock('../../src/config/featureFlags', () => ({
      FEATURE_FLAGS: {
        safeAutoUpdatePwa: false,
      },
    }))
    const { usePwaShell } = await import('../../src/hooks/usePwaShell')

    setRuntimeSnapshot({
      waitingWorkerPresent: true,
      waitingBuildId: 'build-b',
    })

    const hook = renderHook(() =>
      usePwaShell({
        bootHealthy: true,
        reloadSafetyBlocked: false,
        lastStorageMutationAt: Date.now(),
        hasUserInteracted: true,
      }),
    )

    expect(hook.result.current.updateStatus).toBe('manual_available')

    await act(async () => {
      await hook.result.current.applyUpdate()
    })

    expect(applyPwaUpdateMock).toHaveBeenCalledTimes(1)
    expect(hook.result.current.updateStatus).toBe('applying')
  })
})
