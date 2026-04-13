import { useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, UiPrefs } from '../types'
import { subscribeToStorage } from '../utils/storage/core'
import { loadUiPrefs, saveUiPrefs } from '../utils/storage/uiPrefs'

export function useUiPrefs() {
  const uiPrefs = useSyncExternalStore(subscribeToStorage, loadUiPrefs, loadUiPrefs)
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function updateUiPrefs(nextPrefs: UiPrefs): ActionResult<void> {
    const result = saveUiPrefs(nextPrefs)
    setLastError(result.ok ? null : result.error)
    return result
  }

  return {
    uiPrefs,
    updateUiPrefs,
    lastError,
  }
}
