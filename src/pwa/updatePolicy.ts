import type { DiagnosticsEventType } from '../types'

export type PwaUpdateUiStatus =
  | 'idle'
  | 'manual_available'
  | 'deferred'
  | 'suppressed'
  | 'applying'

export interface PwaUpdateRuntimeSnapshot {
  currentBuildId: string
  waitingWorkerPresent: boolean
  waitingBuildId: string | null
}

export interface PwaUpdateAppSnapshot {
  featureEnabled: boolean
  standaloneAndroid: boolean
  bootHealthy: boolean
  reloadSafetyBlocked: boolean
  hasUserInteracted: boolean
  quietMs: number
  hiddenMs: number | null
}

export interface PwaUpdateGuard {
  autoAttemptedAt?: string
  autoAttemptedBuildId?: string
  autoConfirmedAt?: string
  autoConfirmedBuildId?: string
  autoSuppressedUntil?: string
  autoSuppressedBuildId?: string
  deferredBuildId?: string
  manualAttemptedAt?: string
  manualAttemptedBuildId?: string
}

export type PwaUpdateTrigger =
  | 'snapshot_changed'
  | 'cold_start_ready'
  | 'resume_visible'
  | 'health_check'
  | 'manual_apply_requested'

export interface PwaUpdateDecision {
  status: PwaUpdateUiStatus
  action: 'none' | 'schedule_auto_apply' | 'apply_now' | 'confirm_health' | 'clear_stale_guard'
  scheduleMs?: number
  nextGuard: PwaUpdateGuard
  reason?:
    | 'flag_off'
    | 'not_standalone_android'
    | 'waiting_build_unknown'
    | 'post_interaction'
    | 'reload_blocked'
    | 'quiescence_pending'
    | 'hidden_duration_pending'
    | 'prior_failed_auto_apply'
  diagnosticsEventType?: DiagnosticsEventType
}

function clearAutomaticState(guard: PwaUpdateGuard): PwaUpdateGuard {
  return {
    ...guard,
    autoSuppressedUntil: undefined,
    autoSuppressedBuildId: undefined,
    deferredBuildId: undefined,
  }
}

function isSuppressed(now: number, waitingBuildId: string | null, guard: PwaUpdateGuard): boolean {
  if (!waitingBuildId || !guard.autoSuppressedBuildId || !guard.autoSuppressedUntil) {
    return false
  }

  return guard.autoSuppressedBuildId === waitingBuildId && Date.parse(guard.autoSuppressedUntil) > now
}

function normalizeGuard(
  now: number,
  runtime: PwaUpdateRuntimeSnapshot,
  guard: PwaUpdateGuard,
): PwaUpdateGuard {
  let nextGuard = { ...guard }

  if (!runtime.waitingWorkerPresent) {
    nextGuard = clearAutomaticState(nextGuard)
    return nextGuard
  }

  if (runtime.waitingBuildId === null) {
    nextGuard.deferredBuildId = undefined
    return nextGuard
  }

  if (runtime.waitingBuildId === runtime.currentBuildId) {
    nextGuard = clearAutomaticState(nextGuard)
    return nextGuard
  }

  if (nextGuard.deferredBuildId && nextGuard.deferredBuildId !== runtime.waitingBuildId) {
    nextGuard.deferredBuildId = undefined
  }

  if (nextGuard.autoSuppressedBuildId && nextGuard.autoSuppressedBuildId !== runtime.waitingBuildId) {
    nextGuard.autoSuppressedBuildId = undefined
    nextGuard.autoSuppressedUntil = undefined
  }

  if (
    nextGuard.autoAttemptedBuildId &&
    nextGuard.autoAttemptedBuildId === runtime.waitingBuildId &&
    nextGuard.autoConfirmedBuildId !== nextGuard.autoAttemptedBuildId &&
    nextGuard.autoAttemptedAt &&
    now - Date.parse(nextGuard.autoAttemptedAt) <= 15 * 60 * 1000
  ) {
    nextGuard.autoSuppressedBuildId = runtime.waitingBuildId
    nextGuard.autoSuppressedUntil = new Date(now + 24 * 60 * 60 * 1000).toISOString()
  }

  return nextGuard
}

function hasActionableWaitingUpdate(runtime: PwaUpdateRuntimeSnapshot): boolean {
  return (
    runtime.waitingWorkerPresent &&
    runtime.waitingBuildId !== null &&
    runtime.waitingBuildId !== runtime.currentBuildId
  )
}

function canAutoActivate(
  now: number,
  runtime: PwaUpdateRuntimeSnapshot,
  app: PwaUpdateAppSnapshot,
  guard: PwaUpdateGuard,
): {
  allowed: boolean
  reason?: PwaUpdateDecision['reason']
} {
  if (!app.featureEnabled) {
    return { allowed: false, reason: 'flag_off' }
  }

  if (!app.standaloneAndroid) {
    return { allowed: false, reason: 'not_standalone_android' }
  }

  if (runtime.waitingBuildId === null) {
    return { allowed: false, reason: 'waiting_build_unknown' }
  }

  if (isSuppressed(now, runtime.waitingBuildId, guard)) {
    return { allowed: false, reason: 'prior_failed_auto_apply' }
  }

  if (app.reloadSafetyBlocked) {
    return { allowed: false, reason: 'reload_blocked' }
  }

  if (app.quietMs < 2000) {
    return { allowed: false, reason: 'quiescence_pending' }
  }

  return { allowed: true }
}

function resolvePassiveStatus(
  now: number,
  runtime: PwaUpdateRuntimeSnapshot,
  app: PwaUpdateAppSnapshot,
  guard: PwaUpdateGuard,
  reason?: PwaUpdateDecision['reason'],
): PwaUpdateUiStatus {
  if (!runtime.waitingWorkerPresent || runtime.waitingBuildId === runtime.currentBuildId) {
    return 'idle'
  }

  if (!runtime.waitingBuildId || !app.featureEnabled || !app.standaloneAndroid) {
    return 'manual_available'
  }

  if (reason === 'prior_failed_auto_apply' || isSuppressed(now, runtime.waitingBuildId, guard)) {
    return 'suppressed'
  }

  return 'deferred'
}

export function decidePwaUpdatePolicy(input: {
  now: number
  trigger: PwaUpdateTrigger
  runtime: PwaUpdateRuntimeSnapshot
  app: PwaUpdateAppSnapshot
  guard: PwaUpdateGuard
}): PwaUpdateDecision {
  const { now, trigger, runtime, app } = input
  let nextGuard = normalizeGuard(now, runtime, input.guard)

  if (trigger === 'health_check') {
    if (nextGuard.autoAttemptedBuildId && nextGuard.autoAttemptedBuildId === runtime.currentBuildId && app.bootHealthy) {
      nextGuard = {
        ...nextGuard,
        autoConfirmedAt: new Date(now).toISOString(),
        autoConfirmedBuildId: runtime.currentBuildId,
        autoAttemptedAt: undefined,
        autoAttemptedBuildId: undefined,
        autoSuppressedUntil: undefined,
        autoSuppressedBuildId: undefined,
        deferredBuildId: undefined,
      }
      return {
        status: resolvePassiveStatus(now, runtime, app, nextGuard),
        action: 'none',
        nextGuard,
        diagnosticsEventType: 'pwa_update_auto_apply_confirmed',
      }
    }

    return {
      status: resolvePassiveStatus(now, runtime, app, nextGuard),
      action: 'none',
      nextGuard,
    }
  }

  if (
    nextGuard.autoAttemptedBuildId &&
    nextGuard.autoAttemptedBuildId === runtime.currentBuildId &&
    app.bootHealthy
  ) {
    return {
      status: resolvePassiveStatus(now, runtime, app, nextGuard),
      action: 'confirm_health',
      scheduleMs: 5000,
      nextGuard,
    }
  }

  if (!runtime.waitingWorkerPresent) {
    return {
      status: 'idle',
      action: 'clear_stale_guard',
      nextGuard,
      diagnosticsEventType:
        input.guard.deferredBuildId || input.guard.autoSuppressedBuildId ? 'pwa_update_waiting_cleared' : undefined,
    }
  }

  if (runtime.waitingBuildId === runtime.currentBuildId) {
    return {
      status: 'idle',
      action: 'clear_stale_guard',
      nextGuard,
      diagnosticsEventType: 'pwa_update_waiting_cleared',
    }
  }

  if (trigger === 'manual_apply_requested') {
    return {
      status: 'applying',
      action: 'apply_now',
      nextGuard: {
        ...nextGuard,
        manualAttemptedAt: new Date(now).toISOString(),
        manualAttemptedBuildId: runtime.waitingBuildId ?? undefined,
      },
      diagnosticsEventType: 'pwa_update_manual_apply_started',
    }
  }

  if (!hasActionableWaitingUpdate(runtime)) {
    return {
      status: runtime.waitingWorkerPresent ? 'manual_available' : 'idle',
      action: 'none',
      nextGuard,
      diagnosticsEventType: runtime.waitingWorkerPresent ? 'pwa_update_waiting_detected' : undefined,
    }
  }

  const automaticEligibility = canAutoActivate(now, runtime, app, nextGuard)
  if (!automaticEligibility.allowed) {
    if (automaticEligibility.reason === 'flag_off' || automaticEligibility.reason === 'not_standalone_android' || automaticEligibility.reason === 'waiting_build_unknown') {
      return {
        status: 'manual_available',
        action: 'none',
        nextGuard,
        reason: automaticEligibility.reason,
        diagnosticsEventType: 'pwa_update_waiting_detected',
      }
    }

    if (automaticEligibility.reason === 'prior_failed_auto_apply') {
      return {
        status: 'suppressed',
        action: 'none',
        nextGuard,
        reason: automaticEligibility.reason,
        diagnosticsEventType: 'pwa_update_auto_apply_suppressed',
      }
    }
  }

  if (
    trigger === 'cold_start_ready' &&
    automaticEligibility.allowed &&
    !app.hasUserInteracted
  ) {
    nextGuard.deferredBuildId = runtime.waitingBuildId ?? undefined
    return {
      status: 'deferred',
      action: 'schedule_auto_apply',
      scheduleMs: 1000,
      nextGuard,
    }
  }

  if (
    trigger === 'resume_visible' &&
    automaticEligibility.allowed &&
    nextGuard.deferredBuildId === runtime.waitingBuildId &&
    ((app.hiddenMs === null && !app.hasUserInteracted) ||
      (app.hiddenMs !== null && app.hiddenMs >= 10000))
  ) {
    nextGuard.deferredBuildId = runtime.waitingBuildId ?? undefined
    return {
      status: 'deferred',
      action: 'schedule_auto_apply',
      scheduleMs: 1000,
      nextGuard,
    }
  }

  nextGuard.deferredBuildId = runtime.waitingBuildId ?? undefined

  let reason: PwaUpdateDecision['reason'] = automaticEligibility.reason
  if (trigger === 'cold_start_ready' && app.hasUserInteracted) {
    reason = 'post_interaction'
  } else if (trigger === 'resume_visible') {
    if (app.hiddenMs === null && app.hasUserInteracted) {
      reason = 'post_interaction'
    } else if (app.hiddenMs !== null && app.hiddenMs < 10000) {
      reason = 'hidden_duration_pending'
    }
  }

  return {
    status: resolvePassiveStatus(now, runtime, app, nextGuard, reason),
    action: 'none',
    nextGuard,
    reason,
    diagnosticsEventType: 'pwa_update_auto_apply_deferred',
  }
}
