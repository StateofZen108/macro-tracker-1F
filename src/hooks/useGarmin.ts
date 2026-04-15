import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActionResult, AppActionError, GarminConnectionInfo } from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import {
  requestGarminConnect,
  requestGarminDisconnect,
  requestGarminStatus,
  requestGarminSync,
} from '../utils/garmin'
import { getSessionAccessToken } from '../utils/supabase'
import { useWellness } from './useWellness'

interface SyncSessionLike {
  access_token?: string | null
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
  const [connection, setConnection] = useState<GarminConnectionInfo>({
    status: 'not_connected',
    staleData: false,
  })
  const [busy, setBusy] = useState(false)
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  const accessToken = useMemo(
    () => (session ? getSessionAccessToken(session as never) : null),
    [session],
  )

  const refreshStatus = useCallback(async (): Promise<ActionResult<GarminConnectionInfo>> => {
    if (!FEATURE_FLAGS.garminConnectV1) {
      return ok<GarminConnectionInfo>({
        status: 'not_connected',
        staleData: false,
      })
    }

    if (!accessToken) {
      const nextConnection: GarminConnectionInfo = {
        status: 'not_connected',
        staleData: false,
      }
      setConnection(nextConnection)
      setLastError(null)
      return ok(nextConnection)
    }

    try {
      const status = await requestGarminStatus(accessToken)
      setConnection(status.connection)
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

      setConnection(response.connection)
      setLastError(null)
      return ok(response.connection)
    } catch (error) {
      const nextError = {
        code: 'garminSync',
        message: error instanceof Error ? error.message : 'Unable to sync Garmin right now.',
      } satisfies AppActionError
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

    setBusy(true)
    try {
      const response = await requestGarminConnect(accessToken)
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
  }, [accessToken])

  const disconnect = useCallback(async (): Promise<ActionResult<GarminConnectionInfo>> => {
    if (!accessToken) {
      return fail('Sign in before disconnecting Garmin.')
    }

    setBusy(true)
    try {
      const nextConnection = await requestGarminDisconnect(accessToken)
      setConnection(nextConnection)
      setLastError(null)
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
    busy,
    lastError,
    refreshStatus,
    syncNow,
    connect,
    disconnect,
  }
}
