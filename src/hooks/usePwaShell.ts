import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { applyPwaUpdate, getPwaRuntimeSnapshot, subscribePwaRuntime } from '../pwa/runtime'

const INSTALL_DISMISS_MS = 14 * 24 * 60 * 60 * 1000
const SUCCESSFUL_LAUNCH_KEY = 'mt_pwa_successful_launches'
const INSTALL_DISMISSED_AT_KEY = 'mt_pwa_install_dismissed_at'
const SESSION_SUCCESSFUL_LAUNCH_KEY = 'mt_pwa_successful_launch_recorded'
const launchCountListeners = new Set<() => void>()

let launchCountSnapshot: number | null = null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

export interface PwaShellState {
  isInstalled: boolean
  canInstall: boolean
  showInstallPrompt: boolean
  dismissInstallPrompt: () => void
  install: () => Promise<void>
  updateReady: boolean
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

export function usePwaShell(bootSuccessful: boolean): PwaShellState {
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

  const isAndroidChromium = useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false
    }

    return isAndroidChromiumUserAgent(navigator.userAgent)
  }, [])

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
    if (!bootSuccessful) {
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
  }, [bootSuccessful])

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
    await applyPwaUpdate()
  }, [])

  const canInstall = isAndroidChromium && !isInstalled && installEvent !== null
  const showInstallPrompt = canInstall && successfulLaunches >= 2 && !installPromptBlocked

  return {
    isInstalled,
    canInstall,
    showInstallPrompt,
    dismissInstallPrompt,
    install,
    updateReady: runtime.updateReady,
    applyUpdate,
  }
}
