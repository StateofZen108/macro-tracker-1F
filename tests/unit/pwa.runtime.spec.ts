/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type ControllerChangeHandler = () => void

function createWaitingWorker(buildId: string | null, replyDelayMs = 0) {
  return {
    postMessage: vi.fn((_payload: unknown, ports?: MessagePort[]) => {
      if (!ports || buildId === null) {
        return
      }

      window.setTimeout(() => {
        ports[0]?.postMessage({
          type: 'MT_BUILD_ID',
          buildId,
        })
      }, replyDelayMs)
    }),
  } satisfies Partial<ServiceWorker>
}

describe('pwa runtime', () => {
  let controllerChangeHandler: ControllerChangeHandler | null = null
  let waitingWorker: Partial<ServiceWorker> | null = null

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    controllerChangeHandler = null
    waitingWorker = null

    vi.doMock('../../src/pwa/register', () => ({
      registerSW: vi.fn(() => vi.fn().mockResolvedValue(undefined)),
    }))

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({
          waiting: waitingWorker,
        })),
        addEventListener: vi.fn((event: string, handler: ControllerChangeHandler) => {
          if (event === 'controllerchange') {
            controllerChangeHandler = handler
          }
        }),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the waiting worker build id over MessageChannel', async () => {
    waitingWorker = createWaitingWorker('build-b')
    const runtime = await import('../../src/pwa/runtime')

    const refreshPromise = runtime.refreshPwaRuntimeSnapshot()
    await vi.runAllTimersAsync()
    const snapshot = await refreshPromise

    expect(snapshot.waitingWorkerPresent).toBe(true)
    expect(snapshot.waitingBuildId).toBe('build-b')
  })

  it('treats a non-responsive waiting worker as unknown build id', async () => {
    waitingWorker = createWaitingWorker(null)
    const runtime = await import('../../src/pwa/runtime')

    const refreshPromise = runtime.refreshPwaRuntimeSnapshot()
    await vi.advanceTimersByTimeAsync(1000)
    const snapshot = await refreshPromise

    expect(snapshot.waitingWorkerPresent).toBe(true)
    expect(snapshot.waitingBuildId).toBeNull()
  })

  it('clears waiting state on controllerchange', async () => {
    waitingWorker = createWaitingWorker('build-b')
    const runtime = await import('../../src/pwa/runtime')
    runtime.initializePwaRuntime()
    await vi.runAllTimersAsync()

    expect(runtime.getPwaRuntimeSnapshot().waitingWorkerPresent).toBe(true)
    controllerChangeHandler?.()

    expect(runtime.getPwaRuntimeSnapshot().waitingWorkerPresent).toBe(false)
    expect(runtime.getPwaRuntimeSnapshot().waitingBuildId).toBeNull()
  })
})
