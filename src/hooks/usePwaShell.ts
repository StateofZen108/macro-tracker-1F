import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import {
  applyPwaUpdate,
  getPwaRuntimeSnapshot,
  refreshPwaRuntimeSnapshot,
  subscribePwaRuntime,
  type PwaRuntimeState,
} from '../pwa/runtime'
import {
  decidePwaUpdatePolicy,
  type PwaUpdateDecision,
  type PwaUpdateGuard,
  type PwaUpdateTrigger,
  type PwaUpdateUiStatus,
} from '../pwa/updatePolicy'

const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000
const SUCCESSFUL_LAUNCH_KEY = 'mt_pwa_successful_launches'
const INSTALL_DISMISSED_AT_KEY = 'mt_pwa_install_dismissed_at'
const SESSION_SUCCESSFUL_LAUNCH_KEY = 'mt_pwa_successful_launch_recorded'
const UPDATE_GUARD_STORAGE_KEY = 'mt_pwa_auto_update_guard_v1'
const APPLY_FAILURE_TIMEOUT_MS = 10_000
const HEALTH_CONFIRMATION_MS = 5_000
const launchCountListeners = new Set<() => void>()

let launchCountSnapshot: number | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

export interface PwaShellInput {
  bootHealthy: boolean
  reloadSafetyBlocked: boolean
  lastStorageMutationAt: number
  hasUserInteracted: boolean
}

export interface PwaShellState {
  isInstalled: boolean
  canInstall: boolean
  showInstallPrompt: boolean
  dismissInstallPrompt: () => void
  install: () => Promise<void>
  updateStatus: PwaUpdateUiStatus
  updateMessage: string | null
  applyUpdate: () => Promise<void>
}

function canUseWindow(): boolean {
  return typeof window !== 'undefined'
}

function canUseStorage(): boolean {
  return canUseWindow() && typeof window.localStorage !== 'undefined'
}

function readNumber(key: string): number {
  if (!canUseStorage()) {
    return 0
  }

  const rawValue = window.localStorage.getItem(key)
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

function writeNumber(key: string, value: number): void {
  if (!canUseStorage()) {
    return
  }

  window.localStorage.setItem(key, `${value}`)
}

function emitLaunchCountChange(): void {
  for (const listener of launchCountListeners) {
    listener()
  }
}

function getLaunchCountSnapshot(): number {
  if (launchCountSnapshot === null) {
    launchCountSnapshot = readNumber(SUCCESSFUL_LAUNCH_KEY)
  }

  return launchCountSnapshot
}

function subscribeLaunchCount(listener: () => void): () => void {
  launchCountListeners.add(listener)
  return () => {
    launchCountListeners.delete(listener)
  }
}

function readTimestamp(key: string): string | null {
  if (!canUseStorage()) {
    return null
  }

  const rawValue = window.localStorage.getItem(key)
  return rawValue?.trim() ? rawValue : null
}

function writeTimestamp(key: string, value: string | null): void {
  if (!canUseStorage()) {
    return
  }

  if (!value) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, value)
}

function readInstallDismissedBlockState(): boolean {
  const dismissedUntil = readTimestamp(INSTALL_DISMISSED_AT_KEY)
  return Boolean(dismissedUntil && dismissedUntil > new Date().toISOString())
}

function isAndroidChromiumUserAgent(userAgent: string): boolean {
  const normalizedUserAgent = userAgent.toLowerCase()
  return normalizedUserAgent.includes('android') && normalizedUserAgent.includes('chrome')
}

function isStandaloneRuntime(): boolean {
  if (!canUseWindow()) {
    return false
  }

  return window.matchMedia('(display-mode: standalone)').matches
}

function readUpdateGuard(): PwaUpdateGuard {
  if (!canUseStorage()) {
    return {}
  }

  const rawValue = window.localStorage.getItem(UPDATE_GUARD_STORAGE_KEY)
  if (!rawValue) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawValue) as PwaUpdateGuard
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeUpdateGuard(nextGuard: PwaUpdateGuard): boolean {
  if (!canUseStorage()) {
    return false
  }

  try {
    const normalizedGuard = Object.fromEntries(
      Object.entries(nextGuard).filter(([, value]) => value !== undefined),
    )
    if (Object.keys(normalizedGuard).length === 0) {
      window.localStorage.removeItem(UPDATE_GUARD_STORAGE_KEY)
      return true
    }

    window.localStorage.setItem(UPDATE_GUARD_STORAGE_KEY, JSON.stringify(normalizedGuard))
    return true
  } catch {
    return false
  }
}

function guardsEqual(left: PwaUpdateGuard, right: PwaUpdateGuard): boolean {
  const leftEntries = Object.entries(left).filter(([, value]) => value !== undefined)
  const rightEntries = Object.entries(right).filter(([, value]) => value !== undefined)
  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([key, value]) => right[key as keyof PwaUpdateGuard] === value)
}

function messageForStatus(status: PwaUpdateUiStatus): string | null {
  switch (status) {
    case 'idle':
      return null
    case 'manual_available':
      return 'A fresher build is ready. Reload into the updated version now.'
    case 'deferred':
      return 'Update downloaded. It will apply automatically next time the app is idle.'
    case 'suppressed':
      return 'An update is ready, but automatic apply is paused until the app is stable again.'
    case 'applying':
      return 'Updating to the latest version...'
  }
}

export function usePwaShell(input: PwaShellInput): PwaShellState {
  const runtime = useSyncExternalStore(
    subscribePwaRuntime,
    getPwaRuntimeSnapshot,
    getPwaRuntimeSnapshot,
  )
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneRuntime())
  const successfulLaunches = useSyncExternalStore(
    subscribeLaunchCount,
    getLaunchCountSnapshot,
    getLaunchCountSnapshot,
  )
  const [installPromptBlocked, setInstallPromptBlocked] = useState(() => readInstallDismissedBlockState())
  const [updateStatus, setUpdateStatus] = useState<PwaUpdateUiStatus>('idle')
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [guard, setGuard] = useState<PwaUpdateGuard>(() => readUpdateGuard())
  const autoApplyTimerRef = useRef<number | null>(null)
  const autoApplyTriggerRef = useRef<PwaUpdateTrigger | null>(null)
  const healthCheckTimerRef = useRef<number | null>(null)
  const applyWatchdogTimerRef = useRef<number | null>(null)
  const lastHiddenAtRef = useRef<number | null>(null)
  const lastDiagnosticSignatureRef = useRef<string | null>(null)

  const isAndroidChromium = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false
    }

    return isAndroidChromiumUserAgent(navigator.userAgent)
  }, [])

  const standaloneAndroid = isInstalled && isAndroidChromium

  const emitDiagnostics = useCallback(
    (eventType: NonNullable<PwaUpdateDecision['diagnosticsEventType']>, payload: Record<string, unknown>) => {
      const signature = JSON.stringify({ eventType, payload })
      if (lastDiagnosticSignatureRef.current === signature) {
        return
      }

      lastDiagnosticSignatureRef.current = signature
      void recordDiagnosticsEvent({
        eventType,
        severity: eventType === 'pwa_update_apply_failed' ? 'error' : 'info',
        scope: 'diagnostics',
        message: eventType,
        payload,
      })
    },
    [],
  )

  const persistGuard = useCallback(
    (nextGuard: PwaUpdateGuard, failureMode: 'auto' | 'manual' | null = null, runtimeSnapshot?: PwaRuntimeState) => {
      if (guardsEqual(guard, nextGuard)) {
        return
      }

      setGuard(nextGuard)
      if (writeUpdateGuard(nextGuard)) {
        return
      }

      emitDiagnostics('pwa_update_apply_failed', {
        currentBuildId: (runtimeSnapshot ?? runtime).currentBuildId,
        waitingBuildId: (runtimeSnapshot ?? runtime).waitingBuildId,
        mode: failureMode ?? 'manual',
        message: 'Unable to persist PWA update guard state.',
      })
    },
    [emitDiagnostics, guard, runtime],
  )

  const clearAutoApplyTimer = useCallback(
    (reason?: string) => {
      if (autoApplyTimerRef.current === null) {
        return
      }

      window.clearTimeout(autoApplyTimerRef.current)
      autoApplyTimerRef.current = null
      autoApplyTriggerRef.current = null
      if (reason) {
        emitDiagnostics('pwa_update_auto_apply_cancelled', { reason })
      }
    },
    [emitDiagnostics],
  )

  const clearHealthCheckTimer = useCallback(() => {
    if (healthCheckTimerRef.current === null) {
      return
    }

    window.clearTimeout(healthCheckTimerRef.current)
    healthCheckTimerRef.current = null
  }, [])

  const handleApplyFailure = useCallback(
    async (mode: 'auto' | 'manual', runtimeSnapshot: PwaRuntimeState, message: string) => {
      if (applyWatchdogTimerRef.current !== null) {
        window.clearTimeout(applyWatchdogTimerRef.current)
        applyWatchdogTimerRef.current = null
      }

      const now = Date.now()
      const nextGuard: PwaUpdateGuard =
        mode === 'auto' && runtimeSnapshot.waitingBuildId
          ? {
              ...guard,
              autoSuppressedBuildId: runtimeSnapshot.waitingBuildId,
              autoSuppressedUntil: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
              deferredBuildId: runtimeSnapshot.waitingBuildId,
            }
          : guard

      persistGuard(nextGuard, mode, runtimeSnapshot)
      setUpdateStatus(mode === 'auto' ? 'suppressed' : runtimeSnapshot.waitingWorkerPresent ? 'manual_available' : 'idle')
      setUpdateMessage(messageForStatus(mode === 'auto' ? 'suppressed' : runtimeSnapshot.waitingWorkerPresent ? 'manual_available' : 'idle'))
      emitDiagnostics('pwa_update_apply_failed', {
        currentBuildId: runtimeSnapshot.currentBuildId,
        waitingBuildId: runtimeSnapshot.waitingBuildId,
        mode,
        message,
      })
      if (mode === 'auto' && runtimeSnapshot.waitingBuildId) {
        emitDiagnostics('pwa_update_auto_apply_suppressed', {
          currentBuildId: runtimeSnapshot.currentBuildId,
          waitingBuildId: runtimeSnapshot.waitingBuildId,
          reason: 'prior_failed_auto_apply',
        })
      }
    },
    [emitDiagnostics, guard, persistGuard],
  )

  const beginApply = useCallback(
    async (mode: 'auto' | 'manual', runtimeSnapshot: PwaRuntimeState, nextGuard: PwaUpdateGuard) => {
      clearAutoApplyTimer()
      clearHealthCheckTimer()
      persistGuard(nextGuard, mode, runtimeSnapshot)
      setUpdateStatus('applying')
      setUpdateMessage(messageForStatus('applying'))

      if (mode === 'auto') {
        emitDiagnostics('pwa_update_auto_apply_started', {
          currentBuildId: runtimeSnapshot.currentBuildId,
          waitingBuildId: runtimeSnapshot.waitingBuildId,
          trigger: autoApplyTriggerRef.current === 'resume_visible' ? 'resume_visible' : 'cold_start_ready',
        })
      }

      applyWatchdogTimerRef.current = window.setTimeout(() => {
        void handleApplyFailure(mode, runtimeSnapshot, 'PWA update did not activate within 10 seconds.')
      }, APPLY_FAILURE_TIMEOUT_MS)

      try {
        await applyPwaUpdate()
      } catch (error) {
        await handleApplyFailure(
          mode,
          runtimeSnapshot,
          error instanceof Error ? error.message : 'Unable to apply the waiting PWA update.',
        )
      }
    },
    [clearAutoApplyTimer, clearHealthCheckTimer, emitDiagnostics, handleApplyFailure, persistGuard],
  )

  const runDecision = useCallback(
    async (
      trigger: PwaUpdateTrigger,
      options?: {
        hiddenMs?: number | null
        runtimeSnapshot?: PwaRuntimeState
      },
    ) => {
      if (applyWatchdogTimerRef.current !== null) {
        if (trigger === 'manual_apply_requested') {
          return
        }

        if (trigger !== 'health_check') {
          return
        }
      }

      const runtimeSnapshot = options?.runtimeSnapshot ?? runtime
      const now = Date.now()
      const quietMs = Math.max(0, now - input.lastStorageMutationAt)
      const hiddenMs = options?.hiddenMs ?? null

      const decision = decidePwaUpdatePolicy({
        now,
        trigger,
        runtime: runtimeSnapshot,
        app: {
          featureEnabled: FEATURE_FLAGS.safeAutoUpdatePwa,
          standaloneAndroid,
          bootHealthy: input.bootHealthy,
          reloadSafetyBlocked: input.reloadSafetyBlocked,
          hasUserInteracted: input.hasUserInteracted,
          quietMs,
          hiddenMs,
        },
        guard,
      })

      persistGuard(
        decision.nextGuard,
        trigger === 'manual_apply_requested' ? 'manual' : trigger === 'health_check' ? null : 'auto',
        runtimeSnapshot,
      )
      setUpdateStatus(decision.status)
      setUpdateMessage(messageForStatus(decision.status))

      if (decision.diagnosticsEventType) {
        const basePayload = {
          currentBuildId: runtimeSnapshot.currentBuildId,
          waitingBuildId: runtimeSnapshot.waitingBuildId,
        }

        switch (decision.diagnosticsEventType) {
          case 'pwa_update_waiting_detected':
            emitDiagnostics(decision.diagnosticsEventType, {
              ...basePayload,
              standaloneAndroid,
              featureEnabled: FEATURE_FLAGS.safeAutoUpdatePwa,
            })
            break
          case 'pwa_update_waiting_cleared':
            emitDiagnostics(decision.diagnosticsEventType, {
              ...basePayload,
              reason:
                runtimeSnapshot.waitingBuildId === runtimeSnapshot.currentBuildId
                  ? 'same_build_waiting_worker'
                  : 'other_client_activated_update',
            })
            break
          case 'pwa_update_auto_apply_deferred':
            emitDiagnostics(decision.diagnosticsEventType, {
              ...basePayload,
              reason: decision.reason,
            })
            break
          case 'pwa_update_auto_apply_suppressed':
            emitDiagnostics(decision.diagnosticsEventType, {
              ...basePayload,
              reason: 'prior_failed_auto_apply',
            })
            break
          case 'pwa_update_auto_apply_confirmed':
            emitDiagnostics(decision.diagnosticsEventType, {
              currentBuildId: runtimeSnapshot.currentBuildId,
            })
            break
          case 'pwa_update_manual_apply_started':
            emitDiagnostics(decision.diagnosticsEventType, basePayload)
            break
          default:
            break
        }
      }

      switch (decision.action) {
        case 'schedule_auto_apply': {
          clearAutoApplyTimer()
          autoApplyTriggerRef.current = trigger
          autoApplyTimerRef.current = window.setTimeout(async () => {
            autoApplyTimerRef.current = null
            const refreshedRuntime = await refreshPwaRuntimeSnapshot()
            const refreshedDecision = decidePwaUpdatePolicy({
              now: Date.now(),
              trigger,
              runtime: refreshedRuntime,
              app: {
                featureEnabled: FEATURE_FLAGS.safeAutoUpdatePwa,
                standaloneAndroid,
                bootHealthy: input.bootHealthy,
                reloadSafetyBlocked: input.reloadSafetyBlocked,
                hasUserInteracted: input.hasUserInteracted,
                quietMs: Math.max(0, Date.now() - input.lastStorageMutationAt),
                hiddenMs,
              },
              guard: readUpdateGuard(),
            })

            persistGuard(refreshedDecision.nextGuard, 'auto', refreshedRuntime)
            setUpdateStatus(refreshedDecision.status)
            setUpdateMessage(messageForStatus(refreshedDecision.status))

            if (refreshedDecision.action === 'schedule_auto_apply') {
              await beginApply('auto', refreshedRuntime, {
                ...refreshedDecision.nextGuard,
                autoAttemptedAt: new Date().toISOString(),
                autoAttemptedBuildId: refreshedRuntime.waitingBuildId ?? undefined,
              })
            }
          }, decision.scheduleMs ?? 1000)
          break
        }
        case 'confirm_health': {
          clearHealthCheckTimer()
          healthCheckTimerRef.current = window.setTimeout(() => {
            healthCheckTimerRef.current = null
            void runDecision('health_check')
          }, decision.scheduleMs ?? HEALTH_CONFIRMATION_MS)
          break
        }
        case 'apply_now':
          await beginApply('manual', runtimeSnapshot, decision.nextGuard)
          break
        case 'clear_stale_guard':
        case 'none':
          break
      }
    },
    [
      beginApply,
      clearAutoApplyTimer,
      clearHealthCheckTimer,
      emitDiagnostics,
      guard,
      input.bootHealthy,
      input.hasUserInteracted,
      input.lastStorageMutationAt,
      input.reloadSafetyBlocked,
      persistGuard,
      runtime,
      standaloneAndroid,
    ],
  )

  useEffect(() => {
    if (!canUseWindow()) {
      return undefined
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const handleDisplayModeChange = () => {
      setIsInstalled(isStandaloneRuntime())
    }
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setInstallEvent(null)
      writeTimestamp(INSTALL_DISMISSED_AT_KEY, null)
      setInstallPromptBlocked(false)
    }

    handleDisplayModeChange()
    mediaQuery.addEventListener('change', handleDisplayModeChange)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!isAndroidChromium || !canUseWindow()) {
      return undefined
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const installPromptEvent = event as BeforeInstallPromptEvent
      installPromptEvent.preventDefault()
      setInstallEvent(installPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [isAndroidChromium])

  useEffect(() => {
    if (!input.bootHealthy) {
      return
    }

    if (canUseWindow() && window.sessionStorage.getItem(SESSION_SUCCESSFUL_LAUNCH_KEY) === 'true') {
      return
    }

    const nextLaunchCount = readNumber(SUCCESSFUL_LAUNCH_KEY) + 1
    writeNumber(SUCCESSFUL_LAUNCH_KEY, nextLaunchCount)
    if (canUseWindow()) {
      window.sessionStorage.setItem(SESSION_SUCCESSFUL_LAUNCH_KEY, 'true')
    }
    launchCountSnapshot = nextLaunchCount
    emitLaunchCountChange()
  }, [input.bootHealthy])

  useEffect(() => {
    void runDecision('snapshot_changed')
  }, [
    runDecision,
    runtime.currentBuildId,
    runtime.waitingBuildId,
    runtime.waitingWorkerPresent,
    standaloneAndroid,
    input.bootHealthy,
    input.reloadSafetyBlocked,
    input.hasUserInteracted,
    input.lastStorageMutationAt,
  ])

  useEffect(() => {
    if (!input.bootHealthy) {
      return
    }

    void runDecision('cold_start_ready')
  }, [input.bootHealthy, runDecision])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now()
        return
      }

      const hiddenMs = lastHiddenAtRef.current === null ? null : Date.now() - lastHiddenAtRef.current
      lastHiddenAtRef.current = null
      void refreshPwaRuntimeSnapshot().then((runtimeSnapshot) => {
        void runDecision('resume_visible', {
          hiddenMs,
          runtimeSnapshot,
        })
      })
    }

    const handlePageShow = () => {
      void refreshPwaRuntimeSnapshot().then((runtimeSnapshot) => {
        void runDecision('resume_visible', {
          hiddenMs: null,
          runtimeSnapshot,
        })
      })
    }

    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [runDecision])

  useEffect(() => {
    if (updateStatus !== 'applying' || runtime.waitingWorkerPresent) {
      return
    }

    if (applyWatchdogTimerRef.current !== null) {
      window.clearTimeout(applyWatchdogTimerRef.current)
      applyWatchdogTimerRef.current = null
    }
  }, [runtime.waitingWorkerPresent, updateStatus])

  useEffect(() => {
    return () => {
      clearAutoApplyTimer()
      clearHealthCheckTimer()
      if (applyWatchdogTimerRef.current !== null) {
        window.clearTimeout(applyWatchdogTimerRef.current)
      }
    }
  }, [clearAutoApplyTimer, clearHealthCheckTimer])

  const dismissInstallPrompt = useCallback(() => {
    const nextDismissedUntil = new Date(Date.now() + INSTALL_DISMISS_MS).toISOString()
    writeTimestamp(INSTALL_DISMISSED_AT_KEY, nextDismissedUntil)
    setInstallPromptBlocked(true)
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) {
      return
    }

    const promptEvent = installEvent
    await promptEvent.prompt()
    const userChoice = await promptEvent.userChoice
    if (userChoice.outcome === 'accepted') {
      setInstallEvent(null)
      writeTimestamp(INSTALL_DISMISSED_AT_KEY, null)
      setInstallPromptBlocked(false)
      return
    }

    dismissInstallPrompt()
  }, [dismissInstallPrompt, installEvent])

  const applyUpdate = useCallback(async () => {
    const runtimeSnapshot = await refreshPwaRuntimeSnapshot()
    await runDecision('manual_apply_requested', { runtimeSnapshot })
  }, [runDecision])

  const canInstall = isAndroidChromium && !isInstalled && installEvent !== null
  const showInstallPrompt = canInstall && successfulLaunches >= 2 && !installPromptBlocked

  return {
    isInstalled,
    canInstall,
    showInstallPrompt,
    dismissInstallPrompt,
    install,
    updateStatus,
    updateMessage,
    applyUpdate,
  }
}
