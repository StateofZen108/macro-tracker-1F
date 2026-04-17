import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import type {
  BootstrapResolution,
  BootstrapStatusSummary,
  SyncCounts,
  SyncMutation,
  SyncStatus,
} from '../types'
import {
  applyPulledSyncRecords,
  buildBootstrapSummary,
  captureLocalSyncedDataset,
  createLocalSyncRollbackSnapshot,
  isSyncedDatasetEffectivelyEmpty,
  mergeLocalAndCloudDatasets,
  replaceLocalSyncedDataset,
  restoreLocalSyncRollbackSnapshot,
} from '../utils/sync/localState'
import {
  applySyncWatermark,
  clearSyncDeadLetters,
  getDeviceId,
  loadSyncQueue,
  loadSyncState,
  markBootstrapResolvedForUser,
  markQueuedMutationAttempts,
  moveMutationsToDeadLetter,
  removeQueuedMutations,
  resetSyncRuntimeForAccountSwitch,
  setSyncRuntimeStatus,
  setSyncUser,
  subscribeToSyncStore,
} from '../utils/sync/core'
import { buildSyncCountsFromDataset, datasetToSyncRecordDrafts, recordsToDataset } from '../utils/sync/shared'
import {
  buildMagicLinkRedirectUrl,
  clearAuthCallbackQuery,
  getSessionAccessToken,
  getSupabaseBrowserClient,
  hasAuthCallbackQuery,
  isSupabaseConfigured,
} from '../utils/supabase'
import {
  fetchBootstrapStatus,
  pullSyncRecords,
  pushSyncMutations,
  submitBootstrapResolution,
} from '../utils/sync/api'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { DEFAULT_SETTINGS } from '../utils/storage/settings'

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000]
const MISSING_LOCAL_BASE_STATE_MESSAGE =
  'Local sync state is missing on this device. Review the dead-letter queue before continuing.'

export interface BootstrapResolutionView {
  requiresResolution: boolean
  reason: 'first_device_resolution' | 'post_sign_in_conflict' | null
  localEffectivelyEmpty: boolean
  cloudEffectivelyEmpty: boolean | null
  defaultResolution: BootstrapResolution | null
}

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

function buildFirstDeviceDefaultResolution(
  bootstrapSummary: BootstrapStatusSummary,
): BootstrapResolution | null {
  if (bootstrapSummary.cloudEmpty && !bootstrapSummary.localEmpty) {
    return 'replaceCloudWithThisDevice'
  }

  if (!bootstrapSummary.cloudEmpty && bootstrapSummary.localEmpty) {
    return 'useCloudOnThisDevice'
  }

  if (!bootstrapSummary.cloudEmpty && !bootstrapSummary.localEmpty) {
    return 'mergeThisDeviceIntoCloud'
  }

  return null
}

function getSessionKey(session: Session, accessToken: string): string {
  return `${session.user.id}:${accessToken}`
}

export function useSync() {
  const configured = isSupabaseConfigured()
  const syncStore = useSyncExternalStore(subscribeToSyncStore, loadSyncState, loadSyncState)
  const [session, setSession] = useState<Session | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [bootstrapSummary, setBootstrapSummary] = useState<BootstrapStatusSummary | null>(null)
  const [bootstrapResolutionView, setBootstrapResolutionView] =
    useState<BootstrapResolutionView | null>(null)
  const [mergePreview, setMergePreview] = useState<SyncCounts | null>(null)
  const [bootstrapBusy, setBootstrapBusy] = useState(false)
  const authLifecycleCancelledRef = useRef(false)
  const syncInFlightRef = useRef(false)
  const reconcileInFlightRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null)
  const lastSuccessfulReconcileSessionKeyRef = useRef<string | null>(null)
  const retryTimeoutRef = useRef<number | null>(null)

  const supabase = useMemo(() => getSupabaseBrowserClient(), [])

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  const resetBootstrapResolutionState = useCallback(() => {
    setBootstrapResolutionView(null)
    setMergePreview(null)
  }, [])

  const setReadyRuntimeStatus = useCallback(
    (options?: { lastSyncedAt?: string; preserveBlockingMessage?: boolean }) => {
      const currentState = loadSyncState()
      setSyncRuntimeStatus(deriveOnlineStatus(loadSyncQueue().length), {
        lastSyncedAt: options?.lastSyncedAt,
        lastSyncError: undefined,
        blockingMessage: options?.preserveBlockingMessage ? currentState.blockingMessage : undefined,
        consecutiveFailures: 0,
      })
    },
    [],
  )

  const deadLetterMissingLocalBaseState = useCallback(() => {
    const mutationIds = loadSyncQueue().map((mutation) => mutation.mutationId)
    if (!mutationIds.length) {
      return false
    }

    moveMutationsToDeadLetter(
      mutationIds,
      'missingLocalBaseState',
      MISSING_LOCAL_BASE_STATE_MESSAGE,
    )
    return true
  }, [])

  const loadFullCloudDataset = useCallback(async (accessToken: string) => {
    const pullResponse = await pullSyncRecords(accessToken, 0)
    const cloudDataset = recordsToDataset(pullResponse.records, DEFAULT_SETTINGS)
    return {
      pullResponse,
      cloudDataset,
      cloudEffectivelyEmpty: isSyncedDatasetEffectivelyEmpty(cloudDataset),
    }
  }, [])

  const applyFullCloudDataset = useCallback(
    (cloudDataset: ReturnType<typeof captureLocalSyncedDataset>, pullResponse: Awaited<ReturnType<typeof pullSyncRecords>>) => {
      const replaceResult = replaceLocalSyncedDataset(cloudDataset)
      if (!replaceResult.ok) {
        throw new Error(replaceResult.error.message)
      }

      applySyncWatermark(
        pullResponse.highWatermark,
        pullResponse.records.map((record) => ({
          scope: record.scope,
          recordId: record.recordId,
          serverVersion: record.serverVersion,
        })),
      )
      setBootstrapSummary(buildBootstrapSummary(buildSyncCountsFromDataset(cloudDataset), true))
    },
    [],
  )

  const runIncrementalSync = useCallback(
    async (activeSession: Session): Promise<boolean> => {
      if (authLifecycleCancelledRef.current) {
        return false
      }

      if (!configured || !supabase) {
        return false
      }

      if (syncInFlightRef.current) {
        return true
      }

      const accessToken = getSessionAccessToken(activeSession)
      if (!accessToken) {
        const message = 'Your session expired. Sign in again to resume sync.'
        setAuthError(message)
        setSyncRuntimeStatus('reauthRequired', {
          lastSyncError: message,
        })
        return false
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

        setReadyRuntimeStatus({
          lastSyncedAt: new Date().toISOString(),
        })
        setAuthError(null)
        return true
      } catch (error) {
        const nextFailures = loadSyncState().consecutiveFailures + 1
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
            void runIncrementalSync(activeSession)
          }, retryDelay)
        }

        return false
      } finally {
        syncInFlightRef.current = false
      }
    },
    [clearRetryTimeout, configured, setReadyRuntimeStatus, supabase],
  )

  const showBootstrapRequired = useCallback(
    (summary: BootstrapStatusSummary, view: BootstrapResolutionView) => {
      setBootstrapSummary(summary)
      setBootstrapResolutionView(view)
      setMergePreview(null)
      setSyncRuntimeStatus('bootstrapRequired')
    },
    [],
  )

  const reconcileSignedInSession = useCallback(
    async (activeSession: Session): Promise<boolean> => {
      if (authLifecycleCancelledRef.current) {
        return false
      }

      const accessToken = getSessionAccessToken(activeSession)
      if (!accessToken) {
        const message = 'Your session expired. Sign in again to continue.'
        setAuthError(message)
        setSyncRuntimeStatus('reauthRequired', {
          lastSyncError: message,
        })
        return false
      }

      const key = getSessionKey(activeSession, accessToken)
      const localEffectivelyEmpty = isSyncedDatasetEffectivelyEmpty(captureLocalSyncedDataset())
      const currentState = loadSyncState()
      const resolvedForUser = currentState.bootstrapResolvedForUserId === activeSession.user.id

      if (reconcileInFlightRef.current?.key === key) {
        return reconcileInFlightRef.current.promise
      }

      if (
        lastSuccessfulReconcileSessionKeyRef.current === key &&
        (!localEffectivelyEmpty || !resolvedForUser)
      ) {
        return true
      }

      const executeReconcile = async (): Promise<boolean> => {
        if (authLifecycleCancelledRef.current) {
          return false
        }

        clearRetryTimeout()
        setAuthError(null)

        if (resolvedForUser) {
          if (!localEffectivelyEmpty) {
            resetBootstrapResolutionState()
            return runIncrementalSync(activeSession)
          }

          const queueMovedToDeadLetter =
            loadSyncState().pendingMutationCount > 0 && deadLetterMissingLocalBaseState()
          setSyncRuntimeStatus('syncing')

          const { pullResponse, cloudDataset, cloudEffectivelyEmpty } =
            await loadFullCloudDataset(accessToken)
          if (!cloudEffectivelyEmpty) {
            applyFullCloudDataset(cloudDataset, pullResponse)
          } else {
            setBootstrapSummary(buildBootstrapSummary(buildSyncCountsFromDataset(cloudDataset), true))
          }

          markBootstrapResolvedForUser(activeSession.user.id)
          resetBootstrapResolutionState()
          setReadyRuntimeStatus({
            lastSyncedAt: new Date().toISOString(),
            preserveBlockingMessage: queueMovedToDeadLetter,
          })
          return true
        }

        const serverSummary = await fetchBootstrapStatus(accessToken)
        const localSummary = buildBootstrapSummary(
          serverSummary.cloudCounts,
          serverSummary.bootstrapCompleted,
        )
        setBootstrapSummary(localSummary)

        if (!serverSummary.bootstrapCompleted) {
          showBootstrapRequired(localSummary, {
            requiresResolution: true,
            reason: 'first_device_resolution',
            localEffectivelyEmpty,
            cloudEffectivelyEmpty: null,
            defaultResolution: buildFirstDeviceDefaultResolution(localSummary),
          })
          return true
        }

        const queueMovedToDeadLetter =
          localEffectivelyEmpty && loadSyncState().pendingMutationCount > 0
            ? deadLetterMissingLocalBaseState()
            : false

        setSyncRuntimeStatus('syncing')
        const { pullResponse, cloudDataset, cloudEffectivelyEmpty } =
          await loadFullCloudDataset(accessToken)

        if (localEffectivelyEmpty) {
          if (!cloudEffectivelyEmpty) {
            applyFullCloudDataset(cloudDataset, pullResponse)
          } else {
            setBootstrapSummary(buildBootstrapSummary(buildSyncCountsFromDataset(cloudDataset), true))
          }

          markBootstrapResolvedForUser(activeSession.user.id)
          resetBootstrapResolutionState()
          setReadyRuntimeStatus({
            lastSyncedAt: new Date().toISOString(),
            preserveBlockingMessage: queueMovedToDeadLetter,
          })
          return true
        }

        showBootstrapRequired(localSummary, {
          requiresResolution: true,
          reason: 'post_sign_in_conflict',
          localEffectivelyEmpty: false,
          cloudEffectivelyEmpty,
          defaultResolution: cloudEffectivelyEmpty ? 'replaceCloudWithThisDevice' : null,
        })
        return true
      }

      const reconcilePromise = Promise.resolve().then(executeReconcile)

      reconcileInFlightRef.current = {
        key,
        promise: reconcilePromise,
      }

      try {
        const succeeded = await reconcilePromise
        if (succeeded) {
          lastSuccessfulReconcileSessionKeyRef.current = key
        }
        return succeeded
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to reconcile your synced data right now.'
        const reauthRequired = /auth|session|token|unauthor/i.test(message)
        setAuthError(message)
        setSyncRuntimeStatus(reauthRequired ? 'reauthRequired' : 'error', {
          lastSyncError: message,
        })
        return false
      } finally {
        if (reconcileInFlightRef.current?.key === key) {
          reconcileInFlightRef.current = null
        }
      }
    },
    [
      applyFullCloudDataset,
      clearRetryTimeout,
      deadLetterMissingLocalBaseState,
      loadFullCloudDataset,
      resetBootstrapResolutionState,
      runIncrementalSync,
      setReadyRuntimeStatus,
      showBootstrapRequired,
    ],
  )

  const syncNow = useCallback(async () => {
    if (!configured || !supabase || !session) {
      return
    }

    if (syncInFlightRef.current) {
      return
    }

    const accessToken = getSessionAccessToken(session)
    if (accessToken && reconcileInFlightRef.current?.key === getSessionKey(session, accessToken)) {
      await reconcileInFlightRef.current.promise
      return
    }

    const localEffectivelyEmpty = isSyncedDatasetEffectivelyEmpty(captureLocalSyncedDataset())
    if (loadSyncState().bootstrapResolvedForUserId !== session.user.id || localEffectivelyEmpty) {
      await reconcileSignedInSession(session)
      return
    }

    await runIncrementalSync(session)
  }, [configured, reconcileSignedInSession, runIncrementalSync, session, supabase])

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

  const handleSignedOutState = useCallback(() => {
    clearRetryTimeout()
    lastSuccessfulReconcileSessionKeyRef.current = null
    reconcileInFlightRef.current = null
    setSession(null)
    setBootstrapSummary(null)
    resetBootstrapResolutionState()
    setSyncUser(undefined)
    setSyncRuntimeStatus('signedOut', {
      lastSyncError: undefined,
      blockingMessage: undefined,
      consecutiveFailures: 0,
    })
  }, [clearRetryTimeout, resetBootstrapResolutionState])

  const signOut = useCallback(async () => {
    clearRetryTimeout()
    lastSuccessfulReconcileSessionKeyRef.current = null
    reconcileInFlightRef.current = null
    if (supabase) {
      await supabase.auth.signOut()
    }
    handleSignedOutState()
  }, [clearRetryTimeout, handleSignedOutState, supabase])

  const previewMerge = useCallback(async () => {
    if (!session) {
      return
    }

    const accessToken = getSessionAccessToken(session)
    if (!accessToken) {
      return
    }

    const cloudPull = await pullSyncRecords(accessToken, 0)
    const cloudDataset = recordsToDataset(cloudPull.records, DEFAULT_SETTINGS)
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
        const message = 'Your session expired. Sign in again to continue.'
        setAuthError(message)
        setSyncRuntimeStatus('reauthRequired', {
          lastSyncError: message,
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
          const cloudDataset = recordsToDataset(cloudPull.records, DEFAULT_SETTINGS)
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
          const cloudDataset = recordsToDataset(response.records, DEFAULT_SETTINGS)
          const replaceResult = replaceLocalSyncedDataset(cloudDataset)
          if (!replaceResult.ok) {
            void restoreLocalSyncRollbackSnapshot(rollbackSnapshot)
            throw new Error(replaceResult.error.message)
          }
        }

        markBootstrapResolvedForUser(session.user.id)
        applySyncWatermark(
          response.highWatermark,
          response.records.map((record) => ({
            scope: record.scope,
            recordId: record.recordId,
            serverVersion: record.serverVersion,
          })),
        )
        setBootstrapSummary(
          buildBootstrapSummary(buildSyncCountsFromDataset(captureLocalSyncedDataset()), true),
        )
        resetBootstrapResolutionState()
        setReadyRuntimeStatus()
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
    [resetBootstrapResolutionState, session, setReadyRuntimeStatus, syncNow],
  )

  useEffect(() => {
    if (!configured || !supabase) {
      setSyncRuntimeStatus('notConfigured')
      return
    }

    let cancelled = false
    authLifecycleCancelledRef.current = false
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

      if (cancelled) {
        return
      }

      const nextUserId = initialSession?.user.id
      if (loadSyncState().currentUserId && nextUserId && loadSyncState().currentUserId !== nextUserId) {
        resetSyncRuntimeForAccountSwitch()
      }

      setSession(initialSession)
      setSyncUser(nextUserId, initialSession?.user.email ?? undefined)

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

      if (cancelled) {
        return
      }

      if (initialSession) {
        await reconcileSignedInSession(initialSession)
      } else {
        handleSignedOutState()
      }
    }

    void initializeAuth()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) {
        return
      }

      if (event === 'SIGNED_OUT' || !nextSession) {
        handleSignedOutState()
        return
      }

      const nextUserId = nextSession.user.id
      if (loadSyncState().currentUserId && loadSyncState().currentUserId !== nextUserId) {
        resetSyncRuntimeForAccountSwitch()
      }

      setSession(nextSession)
      setSyncUser(nextUserId, nextSession.user.email ?? undefined)

      if (event === 'SIGNED_IN') {
        void reconcileSignedInSession(nextSession)
      }
    })

    return () => {
      cancelled = true
      authLifecycleCancelledRef.current = true
      subscription.unsubscribe()
    }
  }, [configured, handleSignedOutState, reconcileSignedInSession, supabase])

  useEffect(() => {
    if (!configured || !session || syncStore.status === 'reauthRequired') {
      return
    }

    if (syncStore.bootstrapResolvedForUserId === session.user.id && syncStore.pendingMutationCount > 0) {
      const timeout = window.setTimeout(() => {
        void syncNow()
      }, 300)

      return () => window.clearTimeout(timeout)
    }
  }, [
    configured,
    session,
    syncNow,
    syncStore.bootstrapResolvedForUserId,
    syncStore.pendingMutationCount,
    syncStore.status,
  ])

  useEffect(() => {
    if (!configured) {
      return
    }

    const handleResume = () => {
      if (session && loadSyncState().bootstrapResolvedForUserId === session.user.id) {
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
  }, [configured, session, syncNow])

  return {
    configured,
    session,
    syncState: syncStore,
    authNotice,
    authError,
    bootstrapSummary,
    bootstrapResolutionView,
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
