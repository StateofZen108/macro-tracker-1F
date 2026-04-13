import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { BootstrapResolution, BootstrapStatusSummary, SyncMutation, SyncStatus } from '../types'
import {
  applyPulledSyncRecords,
  buildBootstrapSummary,
  captureLocalSyncedDataset,
  createLocalSyncRollbackSnapshot,
  mergeLocalAndCloudDatasets,
  replaceLocalSyncedDataset,
  restoreLocalSyncRollbackSnapshot,
} from '../utils/sync/localState'
import { clearSyncDeadLetters, getDeviceId, loadSyncQueue, loadSyncState, markBootstrapCompletedForUser, markQueuedMutationAttempts, moveMutationsToDeadLetter, removeQueuedMutations, resetSyncRuntimeForAccountSwitch, setSyncRuntimeStatus, setSyncUser, subscribeToSyncStore, applySyncWatermark } from '../utils/sync/core'
import { buildSyncCountsFromDataset, datasetToSyncRecordDrafts, recordsToDataset } from '../utils/sync/shared'
import { buildMagicLinkRedirectUrl, clearAuthCallbackQuery, getSessionAccessToken, getSupabaseBrowserClient, hasAuthCallbackQuery, isSupabaseConfigured } from '../utils/supabase'
import { fetchBootstrapStatus, pullSyncRecords, pushSyncMutations, submitBootstrapResolution } from '../utils/sync/api'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { loadSettings } from '../utils/storage/settings'
import type { SyncCounts } from '../types'

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000]

function chunkMutations(mutations: SyncMutation[]): SyncMutation[] {
  const batch: SyncMutation[] = []
  let totalBytes = 0
  for (const mutation of mutations) {
    const encoded = JSON.stringify(mutation)
    const byteLength = new TextEncoder().encode(encoded).length
    if (batch.length > 0 && (batch.length >= 100 || totalBytes + byteLength > 256 * 1024)) {
      break
    }

    batch.push(mutation)
    totalBytes += byteLength
  }

  return batch
}

function deriveOnlineStatus(pendingCount: number): SyncStatus {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return pendingCount > 0 ? 'offlineChangesPending' : 'upToDate'
  }

  return pendingCount > 0 ? 'offlineChangesPending' : 'upToDate'
}

export function useSync() {
  const configured = isSupabaseConfigured()
  const syncStore = useSyncExternalStore(subscribeToSyncStore, loadSyncState, loadSyncState)
  const [session, setSession] = useState<Session | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [bootstrapSummary, setBootstrapSummary] = useState<BootstrapStatusSummary | null>(null)
  const [mergePreview, setMergePreview] = useState<SyncCounts | null>(null)
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const syncInFlightRef = useRef(false)
  const retryTimeoutRef = useRef<number | null>(null)

  const supabase = useMemo(() => getSupabaseBrowserClient(), [])

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  const refreshBootstrapSummary = useCallback(
    async (activeSession: Session | null) => {
      if (!activeSession) {
        return
      }

      const accessToken = getSessionAccessToken(activeSession)
      if (!accessToken) {
        return
      }

      const serverSummary = await fetchBootstrapStatus(accessToken)
      const localSummary = buildBootstrapSummary(serverSummary.cloudCounts, serverSummary.bootstrapCompleted)
      setBootstrapSummary(localSummary)

      if (serverSummary.bootstrapCompleted || syncStore.bootstrapCompletedForUserId === activeSession.user.id) {
        markBootstrapCompletedForUser(activeSession.user.id)
        setSyncRuntimeStatus(deriveOnlineStatus(loadSyncQueue().length), {
          consecutiveFailures: 0,
          lastSyncError: undefined,
          blockingMessage: undefined,
        })
      } else {
        setSyncRuntimeStatus('bootstrapRequired')
      }
    },
    [syncStore.bootstrapCompletedForUserId],
  )

  const syncNow = useCallback(async () => {
    if (!configured || !supabase || !session || syncInFlightRef.current) {
      return
    }

    if (syncStore.bootstrapCompletedForUserId !== session.user.id) {
      await refreshBootstrapSummary(session)
      return
    }

    const accessToken = getSessionAccessToken(session)
    if (!accessToken) {
      setSyncRuntimeStatus('reauthRequired', {
        lastSyncError: 'Your session expired. Sign in again to resume sync.',
      })
      return
    }

    clearRetryTimeout()
    syncInFlightRef.current = true
    setSyncRuntimeStatus('syncing')

    try {
      let queue = loadSyncQueue()
      while (queue.length > 0) {
        const batch = chunkMutations(queue)
        const batchIds = batch.map((mutation) => mutation.mutationId)
        markQueuedMutationAttempts(batchIds)
        const pushResponse = await pushSyncMutations(accessToken, getDeviceId(), batch)

        removeQueuedMutations(pushResponse.applied.map((item) => item.mutationId))
        for (const deadLetter of pushResponse.deadLetters) {
          moveMutationsToDeadLetter([deadLetter.mutationId], deadLetter.code, deadLetter.message)
        }
        applySyncWatermark(
          pushResponse.highWatermark,
          pushResponse.applied.map((item) => ({
            scope: item.scope,
            recordId: item.recordId,
            serverVersion: item.serverVersion,
          })),
        )

        queue = loadSyncQueue()
      }

      const pullResponse = await pullSyncRecords(accessToken, loadSyncState().highWatermark)
      if (pullResponse.records.length > 0) {
        const applyResult = applyPulledSyncRecords(pullResponse.records)
        if (!applyResult.ok) {
          throw new Error(applyResult.error.message)
        }

        applySyncWatermark(
          pullResponse.highWatermark,
          pullResponse.records.map((record) => ({
            scope: record.scope,
            recordId: record.recordId,
            serverVersion: record.serverVersion,
          })),
        )
      }

      setSyncRuntimeStatus(deriveOnlineStatus(loadSyncQueue().length), {
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: undefined,
        blockingMessage: undefined,
        consecutiveFailures: 0,
      })
      setAuthError(null)
    } catch (error) {
      const nextFailures = syncStore.consecutiveFailures + 1
      const message = error instanceof Error ? error.message : 'Unable to sync your data right now.'
      const reauthRequired = /auth|session|token|unauthor/i.test(message)
      void recordDiagnosticsEvent({
        eventType: 'sync_push_failed',
        severity: 'error',
        scope: 'diagnostics',
        message,
        payload: {
          consecutiveFailures: nextFailures,
          reauthRequired,
        },
      })
      setSyncRuntimeStatus(reauthRequired ? 'reauthRequired' : 'error', {
        lastSyncError: message,
        consecutiveFailures: nextFailures,
      })
      setAuthError(message)

      if (!reauthRequired && nextFailures <= RETRY_DELAYS_MS.length) {
        const retryDelay = RETRY_DELAYS_MS[nextFailures - 1]
        retryTimeoutRef.current = window.setTimeout(() => {
          void syncNow()
        }, retryDelay)
      }
    } finally {
      syncInFlightRef.current = false
    }
  }, [
    clearRetryTimeout,
    configured,
    refreshBootstrapSummary,
    session,
    supabase,
    syncStore.bootstrapCompletedForUserId,
    syncStore.consecutiveFailures,
  ])

  const sendMagicLink = useCallback(
    async (email: string) => {
      if (!configured || !supabase) {
        return
      }

      setAuthError(null)
      setSyncRuntimeStatus('authenticating')
      const redirectTo = buildMagicLinkRedirectUrl() ?? undefined
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      })

      if (error) {
        setAuthError(error.message)
        setSyncRuntimeStatus('error', { lastSyncError: error.message })
        return
      }

      setAuthNotice(`Magic link sent to ${email.trim()}.`)
      setSyncUser(undefined, email.trim())
      setSyncRuntimeStatus('authenticating')
    },
    [configured, supabase],
  )

  const signOut = useCallback(async () => {
    clearRetryTimeout()
    if (supabase) {
      await supabase.auth.signOut()
    }
    setSession(null)
    setBootstrapSummary(null)
    setMergePreview(null)
    setSyncUser(undefined)
    setSyncRuntimeStatus('signedOut', {
      lastSyncError: undefined,
      blockingMessage: undefined,
      consecutiveFailures: 0,
    })
  }, [clearRetryTimeout, supabase])

  const previewMerge = useCallback(async () => {
    if (!session) {
      return
    }

    const accessToken = getSessionAccessToken(session)
    if (!accessToken) {
      return
    }

    const pullResponse = await pullSyncRecords(accessToken, 0)
    const cloudDataset = recordsToDataset(pullResponse.records, loadSettings())
    const mergedDataset = mergeLocalAndCloudDatasets(cloudDataset)
    setMergePreview(buildSyncCountsFromDataset(mergedDataset))
  }, [session])

  const applyBootstrap = useCallback(
    async (resolution: BootstrapResolution) => {
      if (!session) {
        return
      }

      const accessToken = getSessionAccessToken(session)
      if (!accessToken) {
        setSyncRuntimeStatus('reauthRequired', {
          lastSyncError: 'Your session expired. Sign in again to continue.',
        })
        return
      }

      setBootstrapBusy(true)
      setAuthError(null)

      try {
        const rollbackSnapshot = createLocalSyncRollbackSnapshot()
        let response

        if (resolution === 'replaceCloudWithThisDevice') {
          response = await submitBootstrapResolution(
            accessToken,
            resolution,
            datasetToSyncRecordDrafts(captureLocalSyncedDataset()),
          )
        } else if (resolution === 'mergeThisDeviceIntoCloud') {
          const cloudPull = await pullSyncRecords(accessToken, 0)
          const cloudDataset = recordsToDataset(cloudPull.records, loadSettings())
          const mergedDataset = mergeLocalAndCloudDatasets(cloudDataset)
          setMergePreview(buildSyncCountsFromDataset(mergedDataset))
          response = await submitBootstrapResolution(
            accessToken,
            resolution,
            datasetToSyncRecordDrafts(mergedDataset),
          )
          const replaceResult = replaceLocalSyncedDataset(mergedDataset)
          if (!replaceResult.ok) {
            void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
            throw new Error(replaceResult.error.message)
          }
        } else {
          response = await submitBootstrapResolution(accessToken, resolution, [])
          const cloudDataset = recordsToDataset(response.records, loadSettings())
          const replaceResult = replaceLocalSyncedDataset(cloudDataset)
          if (!replaceResult.ok) {
            void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
            throw new Error(replaceResult.error.message)
          }
        }

        markBootstrapCompletedForUser(session.user.id)
        applySyncWatermark(
          response.highWatermark,
          response.records.map((record) => ({
            scope: record.scope,
            recordId: record.recordId,
            serverVersion: record.serverVersion,
          })),
        )
        setBootstrapSummary(buildBootstrapSummary(buildSyncCountsFromDataset(captureLocalSyncedDataset()), true))
        setMergePreview(null)
        setSyncRuntimeStatus(deriveOnlineStatus(loadSyncQueue().length), {
          consecutiveFailures: 0,
          lastSyncError: undefined,
          blockingMessage: undefined,
        })
        await syncNow()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to complete sync bootstrap.'
        void recordDiagnosticsEvent({
          eventType: 'sync_bootstrap_failed',
          severity: 'error',
          scope: 'diagnostics',
          message,
          payload: {
            resolution,
          },
        })
        setAuthError(message)
        setSyncRuntimeStatus('error', { lastSyncError: message })
      } finally {
        setBootstrapBusy(false)
      }
    },
    [session, syncNow],
  )

  useEffect(() => {
    if (!configured || !supabase) {
      setSyncRuntimeStatus('notConfigured')
      return
    }

    let cancelled = false
    const authCallback = hasAuthCallbackQuery()

    const initializeAuth = async () => {
      const {
        data: { session: initialSession },
        error,
      } = await supabase.auth.getSession()

      if (cancelled) {
        return
      }

      if (error) {
        setAuthError(error.message)
        setSyncRuntimeStatus('error', { lastSyncError: error.message })
      }

      setSession(initialSession)
      setSyncUser(initialSession?.user.id, initialSession?.user.email ?? undefined)

      if (authCallback) {
        setAuthNotice(
          error
            ? error.message
            : initialSession
              ? 'Sign-in complete. Open the app if you prefer the installed PWA.'
              : 'Sign-in link handled. Open the app again if you do not see your session yet.',
        )
        clearAuthCallbackQuery()
      }

      if (initialSession) {
        await refreshBootstrapSummary(initialSession)
      } else {
        setSyncRuntimeStatus('signedOut')
      }
    }

    void initializeAuth()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      const nextUserId = nextSession?.user.id
      if (syncStore.currentUserId && nextUserId && syncStore.currentUserId !== nextUserId) {
        resetSyncRuntimeForAccountSwitch()
      }
      setSyncUser(nextUserId, nextSession?.user.email ?? undefined)
      if (nextSession) {
        void refreshBootstrapSummary(nextSession)
      } else {
        setBootstrapSummary(null)
        setMergePreview(null)
        setSyncRuntimeStatus('signedOut')
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [configured, refreshBootstrapSummary, supabase, syncStore.currentUserId])

  useEffect(() => {
    if (!configured || !session || syncStore.status === 'reauthRequired') {
      return
    }

    if (syncStore.bootstrapCompletedForUserId === session.user.id && syncStore.pendingMutationCount > 0) {
      const timeout = window.setTimeout(() => {
        void syncNow()
      }, 300)

      return () => window.clearTimeout(timeout)
    }
  }, [configured, session, syncNow, syncStore.bootstrapCompletedForUserId, syncStore.pendingMutationCount, syncStore.status])

  useEffect(() => {
    if (!configured) {
      return
    }

    const handleResume = () => {
      if (session && syncStore.bootstrapCompletedForUserId === session.user.id) {
        void syncNow()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResume()
      }
    }

    window.addEventListener('focus', handleResume)
    window.addEventListener('online', handleResume)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('online', handleResume)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [configured, session, syncNow, syncStore.bootstrapCompletedForUserId])

  return {
    configured,
    session,
    syncState: syncStore,
    authNotice,
    authError,
    bootstrapSummary,
    mergePreview,
    bootstrapBusy,
    deadLetterCount: syncStore.deadLetterCount,
    clearDeadLetters: clearSyncDeadLetters,
    sendMagicLink,
    signOut,
    syncNow,
    previewMerge,
    applyBootstrap,
  }
}
