import { useLayoutEffect, useState } from 'react'
import type { AppActionError, NetworkStatus, TabId } from '../types'
import { getTodayDateKey } from '../utils/dates'

export interface ConfirmState {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
}

export interface ExternalSheetState {
  open: boolean
  dirty: boolean
  requestClose: () => void
}

interface RequestTabChangeOptions {
  foodSheet: { open: boolean; dirty: boolean; discard: () => void }
  editEntry: { open: boolean; dirty: boolean; discard: () => void }
  quickAdd: { open: boolean; dirty: boolean; discard: () => void }
  copyPrevious: { open: boolean; dirty: boolean; discard: () => void }
  intervention: { open: boolean; dirty: boolean; discard: () => void }
  saveTemplate: { open: boolean; dirty: boolean; discard: () => void }
  saveRecipe: { open: boolean; dirty: boolean; discard: () => void }
  bulkApply: { open: boolean; close: () => void }
  settingsEditorState: ExternalSheetState | null
  closeLogSheets: () => void
}

function buildAppError(message: string): AppActionError {
  return {
    code: 'app',
    message,
  }
}

export function useAppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('log')
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey())
  const [globalError, setGlobalError] = useState<AppActionError | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  )
  const [settingsEditorState, setSettingsEditorState] = useState<ExternalSheetState | null>(null)

  useLayoutEffect(() => {
    const handleOnline = () => setNetworkStatus('online')
    const handleOffline = () => setNetworkStatus('offline')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function clearGlobalError(): void {
    setGlobalError(null)
  }

  function reportError(error: AppActionError | string | null): void {
    if (!error) {
      setGlobalError(null)
      return
    }

    setGlobalError(typeof error === 'string' ? buildAppError(error) : error)
  }

  function requestTabChange(nextTab: TabId, options: RequestTabChangeOptions): void {
    if (nextTab === activeTab) {
      return
    }

    if (options.foodSheet.open && options.foodSheet.dirty) {
      setConfirmState({
        title: 'Discard add-food changes?',
        description: 'Your current food selection and any scanner or form progress will be lost.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.foodSheet.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.editEntry.open && options.editEntry.dirty) {
      setConfirmState({
        title: 'Discard entry changes?',
        description: 'Your serving edits will be lost if you leave this screen now.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.editEntry.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.quickAdd.open && options.quickAdd.dirty) {
      setConfirmState({
        title: 'Discard quick-add entry?',
        description: 'The quick-add values have not been logged yet.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.quickAdd.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.copyPrevious.open && options.copyPrevious.dirty) {
      setConfirmState({
        title: 'Discard copy settings?',
        description: 'The selected source date and meals will be lost.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.copyPrevious.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.bulkApply.open) {
      options.bulkApply.close()
    }

    if (options.intervention.open && options.intervention.dirty) {
      setConfirmState({
        title: 'Discard intervention changes?',
        description: 'Your intervention draft has not been saved yet.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.intervention.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.saveTemplate.open && options.saveTemplate.dirty) {
      setConfirmState({
        title: 'Discard template draft?',
        description: 'The template name has not been saved yet.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.saveTemplate.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.saveRecipe.open && options.saveRecipe.dirty) {
      setConfirmState({
        title: 'Discard recipe draft?',
        description: 'The recipe name and servings have not been saved yet.',
        confirmLabel: 'Discard and switch',
        onConfirm: () => {
          options.saveRecipe.discard()
          setActiveTab(nextTab)
          setConfirmState(null)
        },
      })
      return
    }

    if (options.settingsEditorState?.open) {
      if (options.settingsEditorState.dirty) {
        setConfirmState({
          title: 'Discard food edits?',
          description: 'The unsaved food form in Settings will be lost.',
          confirmLabel: 'Discard and switch',
          onConfirm: () => {
            options.settingsEditorState?.requestClose()
            setActiveTab(nextTab)
            setConfirmState(null)
          },
        })
        return
      }

      options.settingsEditorState.requestClose()
    }

    if (nextTab !== 'log') {
      options.closeLogSheets()
    }

    setActiveTab(nextTab)
  }

  return {
    activeTab,
    setActiveTab,
    selectedDate,
    setSelectedDate,
    globalError,
    clearGlobalError,
    reportError,
    confirmState,
    setConfirmState,
    networkStatus,
    settingsEditorState,
    setSettingsEditorState,
    requestTabChange,
  }
}
