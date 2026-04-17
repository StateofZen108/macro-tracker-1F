import { describe, expect, it } from 'vitest'
import {
  decidePwaUpdatePolicy,
  type PwaUpdateAppSnapshot,
  type PwaUpdateGuard,
  type PwaUpdateRuntimeSnapshot,
} from '../../src/pwa/updatePolicy'

function buildRuntime(overrides: Partial<PwaUpdateRuntimeSnapshot> = {}): PwaUpdateRuntimeSnapshot {
  return {
    currentBuildId: 'build-a',
    waitingWorkerPresent: true,
    waitingBuildId: 'build-b',
    ...overrides,
  }
}

function buildApp(overrides: Partial<PwaUpdateAppSnapshot> = {}): PwaUpdateAppSnapshot {
  return {
    featureEnabled: true,
    standaloneAndroid: true,
    bootHealthy: true,
    reloadSafetyBlocked: false,
    hasUserInteracted: false,
    quietMs: 2500,
    hiddenMs: null,
    ...overrides,
  }
}

function decide(input?: {
  runtime?: Partial<PwaUpdateRuntimeSnapshot>
  app?: Partial<PwaUpdateAppSnapshot>
  guard?: PwaUpdateGuard
  trigger?: 'snapshot_changed' | 'cold_start_ready' | 'resume_visible' | 'health_check' | 'manual_apply_requested'
  now?: number
}) {
  return decidePwaUpdatePolicy({
    now: input?.now ?? Date.UTC(2026, 3, 16, 12, 0, 0),
    trigger: input?.trigger ?? 'snapshot_changed',
    runtime: buildRuntime(input?.runtime),
    app: buildApp(input?.app),
    guard: input?.guard ?? {},
  })
}

describe('pwa update policy', () => {
  it('returns manual availability when automatic mode is disabled', () => {
    const decision = decide({
      app: { featureEnabled: false },
    })

    expect(decision.status).toBe('manual_available')
    expect(decision.reason).toBe('flag_off')
  })

  it('clears stale deferred state when waiting build equals current build', () => {
    const decision = decide({
      runtime: { waitingBuildId: 'build-a' },
      guard: { deferredBuildId: 'build-a' },
    })

    expect(decision.status).toBe('idle')
    expect(decision.nextGuard.deferredBuildId).toBeUndefined()
    expect(decision.diagnosticsEventType).toBe('pwa_update_waiting_cleared')
  })

  it('schedules automatic apply on a safe cold start', () => {
    const decision = decide({
      trigger: 'cold_start_ready',
    })

    expect(decision.status).toBe('deferred')
    expect(decision.action).toBe('schedule_auto_apply')
    expect(decision.scheduleMs).toBe(1000)
    expect(decision.nextGuard.deferredBuildId).toBe('build-b')
  })

  it('defers on cold start after the first user interaction', () => {
    const decision = decide({
      trigger: 'cold_start_ready',
      app: { hasUserInteracted: true },
    })

    expect(decision.status).toBe('deferred')
    expect(decision.action).toBe('none')
    expect(decision.reason).toBe('post_interaction')
  })

  it('suppresses only the same failed automatic build', () => {
    const now = Date.UTC(2026, 3, 16, 12, 0, 0)
    const decision = decide({
      now,
      guard: {
        autoAttemptedAt: new Date(now - 60_000).toISOString(),
        autoAttemptedBuildId: 'build-b',
      },
    })

    expect(decision.status).toBe('suppressed')
    expect(decision.reason).toBe('prior_failed_auto_apply')
    expect(decision.nextGuard.autoSuppressedBuildId).toBe('build-b')
  })

  it('clears old suppression when a new waiting build appears', () => {
    const now = Date.UTC(2026, 3, 16, 12, 0, 0)
    const decision = decide({
      now,
      runtime: { waitingBuildId: 'build-c' },
      guard: {
        autoSuppressedBuildId: 'build-b',
        autoSuppressedUntil: new Date(now + 60_000).toISOString(),
      },
    })

    expect(decision.status).toBe('deferred')
    expect(decision.nextGuard.autoSuppressedBuildId).toBeUndefined()
  })

  it('confirms a healthy automatic update after the health-check trigger', () => {
    const now = Date.UTC(2026, 3, 16, 12, 0, 0)
    const decision = decide({
      now,
      trigger: 'health_check',
      runtime: {
        currentBuildId: 'build-b',
        waitingWorkerPresent: false,
        waitingBuildId: null,
      },
      guard: {
        autoAttemptedBuildId: 'build-b',
      },
    })

    expect(decision.nextGuard.autoConfirmedBuildId).toBe('build-b')
    expect(decision.nextGuard.autoAttemptedBuildId).toBeUndefined()
    expect(decision.diagnosticsEventType).toBe('pwa_update_auto_apply_confirmed')
  })

  it('allows manual apply even when the waiting build is unknown', () => {
    const decision = decide({
      trigger: 'manual_apply_requested',
      runtime: {
        waitingBuildId: null,
      },
    })

    expect(decision.status).toBe('applying')
    expect(decision.action).toBe('apply_now')
    expect(decision.nextGuard.manualAttemptedAt).toBeTruthy()
  })
})
