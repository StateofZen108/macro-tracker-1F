import { useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, UserSettings } from '../types'
import { subscribeToStorage } from '../utils/storage/core'
import { loadSettings, saveSettings } from '../utils/storage/settings'

export function useSettings() {
  const settings = useSyncExternalStore(subscribeToStorage, loadSettings, loadSettings)
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function updateSettings(nextSettings: UserSettings): ActionResult<void> {
    const saveResult = saveSettings(nextSettings)
    if (!saveResult.ok) {
      setLastError(saveResult.error)
      return saveResult
    }

    setLastError(null)
    return { ok: true, data: undefined }
  }

  function clearError(): void {
    setLastError(null)
  }

  return {
    settings,
    updateSettings,
    lastError,
    clearError,
  }
}
