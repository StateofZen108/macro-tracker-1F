import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ActionResult,
  AppActionError,
  GarminAvailabilityInfo,
  GarminConnectionInfo,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import {
  clearGarminCallbackQuery,
  hasGarminCallbackQuery,
  readGarminCallbackResult,
  requestGarminConnect,
  requestGarminDisconnect,
  requestGarminStatus,
  requestGarminSync,
} from '../utils/garmin'
import { loadWeights } from '../utils/storage/weights'
import { mergeGarminImportedData } from '../utils/storage/garminImports'
import { getSessionAccessToken } from '../utils/supabase'
import { useWellness } from './useWellness'

interface SyncSessionLike {
  access_token?: string | null
}

const DEFAULT_CONNECTION: GarminConnectionInfo = {
  status: 'not_connected',
  staleData: false,
}

const DEFAULT_AVAILABILITY: GarminAvailabilityInfo = {
  providerConfigured: false,
  persistentStoreConfigured: false,
  backgroundAutomationEnabled: false,
}

function fail(message: string, code = 'garmin'): ActionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  }
}

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function isOlderThanSixHours(timestamp: string | undefined): boolean {
  if (!timestamp) {
    return true
  }

  return Date.now() - new Date(timestamp).getTime() >= 6 * 60 * 60 * 1000
}

export function useGarmin(session: SyncSessionLike | null) {
  const { mergeImportedEntries } = useWellness()
  const [connection, setConnection] = useState<GarminConnectionInfo>(DEFAULT_CONNECTION)
  const [availability, setAvailability] = useState<GarminAvailabilityInfo>(DEFAULT_AVAILABILITY)
  const [busy, setBusy] = useState(false)
  const [lastError, setLastError] = useState<AppActionError | null>(null)
  const bootstrapSyncTriggeredRef = useRef(false)

  const accessToken = useMemo(
    () => (session ? getSessionAccessToken(session as never) : null),
    [session],
  )

  const refreshStatus = useCallback(async (): Promise<ActionResult<GarminConnectionInfo>> => {
    if (!FEATURE_FLAGS.garminConnectV1) {
      setConnection(DEFAULT_CONNECTION)
      setAvailability(DEFAULT_AVAILABILITY)
      return ok(DEFAULT_CONNECTION)
    }

    if (!accessToken) {
      setConnection(DEFAULT_CONNECTION)
      setAvailability(DEFAULT_AVAILABILITY)
      setLastError(null)
      return ok(DEFAULT_CONNECTION)
    }

    try {
      const status = await requestGarminStatus(accessToken)
      setConnection(status.connection)
      setAvailability({
        providerConfigured: status.providerConfigured,
        persistentStoreConfigured: status.persistentStoreConfigured,
        backgroundAutomationEnabled: status.backgroundAutomationEnabled,
        automationMode: status.automationMode,
      })
      setLastError(null)
      return ok(status.connection)
    } catch (error) {
      const nextError = {
        code: 'garminStatus',
        message: error instanceof Error ? error.message : 'Unable to load Garmin status.',
      } satisfies AppActionError
      setLastError(nextError)
      return { ok: false, error: nextError }
    }
  }, [accessToken])

  const syncNow = useCallback(async (): Promise<ActionResult<GarminConnectionInfo>> => {
    if (!accessToken) {
      return fail('Sign in to sync Garmin data.')
    }

    setBusy(true)
    try {
      const response = await requestGarminSync(accessToken)
      const mergeResult = mergeImportedEntries(response.records)
      if (!mergeResult.ok) {
        setLastError(mergeResult.error)
        return mergeResult as ActionResult<GarminConnectionInfo>
      }

      if (FEATURE_FLAGS.garminIntelligenceV2) {
        const typedImportResult = mergeGarminImportedData({
          importedWeights: response.importedWeights,
          modifierRecords:
            response.modifierRecords ??
            response.records.map((record) => ({
              date: record.date,
              steps: record.steps,
              sleepMinutes: record.sleepMinutes,
              restingHeartRate: record.restingHeartRate,
              derivedCardioMinutes: record.derivedCardioMinutes,
              sourceUpdatedAt: record.sourceUpdatedAt,
            })),
          workoutSummaries: response.workoutSummaries,
          localWeights: loadWeights(),
        })
        if (!typedImportResult.ok) {
          setLastError(typedImportResult.error)
          return typedImportResult as ActionResult<GarminConnectionInfo>
        }

        void recordDiagnosticsEvent({
          eventType:
            typedImportResult.data.localWeightConflictCount > 0
              ? 'garmin_v2_local_weight_wins'
              : 'garmin_v2_sync_succeeded',
          severity: 'info',
          scope: 'diagnostics',
          message:
            typedImportResult.data.localWeightConflictCount > 0
              ? 'Garmin sync completed and local manual weight remained authoritative for same-date conflicts.'
              : 'Garmin sync completed and typed Garmin import records were stored.',
          payload: {
            importedWeights: typedImportResult.data.weights.length,
            modifierRecords: typedImportResult.data.modifiers.length,
            workoutSummaries: typedImportResult.data.workouts.length,
            localWeightConflictCount: typedImportResult.data.localWeightConflictCount,
          },
        })
      }

      setConnection(response.connection)
      setLastError(null)
      return ok(response.connection)
    } catch (error) {
      const nextError = {
        code: 'garminSync',
        message: error instanceof Error ? error.message : 'Unable to sync Garmin right now.',
      } satisfies AppActionError
      void recordDiagnosticsEvent({
        eventType: 'garmin_v2_sync_failed',
        severity: 'error',
        scope: 'diagnostics',
        message: nextError.message,
      })
      setLastError(nextError)
      return { ok: false, error: nextError }
    } finally {
      setBusy(false)
    }
  }, [accessToken, mergeImportedEntries])

  const connect = useCallback(async (): Promise<ActionResult<void>> => {
    if (!accessToken) {
      return fail('Sign in before connecting Garmin.')
    }

    if (
      !availability.providerConfigured ||
      !availability.persistentStoreConfigured ||
      !availability.backgroundAutomationEnabled
    ) {
      return fail('Garmin is not enabled in this deployment.', 'garminNotEnabled')
    }

    setBusy(true)
    try {
      const response = await requestGarminConnect(accessToken, window.location.href)
      window.location.assign(response.authorizationUrl)
      return ok(undefined)
    } catch (error) {
      const nextError = {
        code: 'garminConnect',
        message: error instanceof Error ? error.message : 'Unable to start Garmin connection.',
      } satisfies AppActionError
      setLastError(nextError)
      return { ok: false, error: nextError }
    } finally {
      setBusy(false)
    }
  }, [accessToken, availability])

  const disconnect = useCallback(async (): Promise<ActionResult<GarminConnectionInfo>> => {
    if (!accessToken) {
      return fail('Sign in before disconnecting Garmin.')
    }

    setBusy(true)
    try {
      const nextConnection = await requestGarminDisconnect(accessToken)
      setConnection(nextConnection)
      setLastError(null)
      bootstrapSyncTriggeredRef.current = false
      return ok(nextConnection)
    } catch (error) {
      const nextError = {
        code: 'garminDisconnect',
        message: error instanceof Error ? error.message : 'Unable to disconnect Garmin.',
      } satisfies AppActionError
      setLastError(nextError)
      return { ok: false, error: nextError }
    } finally {
      setBusy(false)
    }
  }, [accessToken])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!FEATURE_FLAGS.garminConnectV1 || !accessToken || !hasGarminCallbackQuery()) {
      return
    }

    const callbackResult = readGarminCallbackResult()
    if (!callbackResult) {
      return
    }

    clearGarminCallbackQuery()

    void (async () => {
      if (callbackResult.kind === 'error') {
        setLastError({
          code: 'garminCallback',
          message: `Garmin connection could not be completed (${callbackResult.code}).`,
        })
        await refreshStatus()
        return
      }

      const statusResult = await refreshStatus()
      if (
        statusResult.ok &&
        !statusResult.data.lastSuccessfulSyncAt &&
        !bootstrapSyncTriggeredRef.current
      ) {
        bootstrapSyncTriggeredRef.current = true
        await syncNow()
      }
    })()
  }, [accessToken, refreshStatus, syncNow])

  useEffect(() => {
    if (!FEATURE_FLAGS.garminConnectV1 || !accessToken) {
      return
    }

    const maybeAutoSync = () => {
      if (connection.status === 'connected' && isOlderThanSixHours(connection.lastSuccessfulSyncAt)) {
        void syncNow()
      }
    }

    maybeAutoSync()

    const handleFocus = () => {
      maybeAutoSync()
      void refreshStatus()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [accessToken, connection.lastSuccessfulSyncAt, connection.status, refreshStatus, syncNow])

  return {
    connection,
    availability,
    busy,
    lastError,
    refreshStatus,
    syncNow,
    connect,
    disconnect,
  }
}
