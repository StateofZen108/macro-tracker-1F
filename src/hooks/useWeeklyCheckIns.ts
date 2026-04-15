import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { evaluateCheckInWeek, upsertCheckInRecord } from '../domain/checkIns/math'
import {
  updateCoachingDecisionRecordStatus,
  upsertCoachingDecisionRecord,
} from '../domain/coaching'
import type { ActionResult, CheckInRecord, UserSettings, WeightEntry } from '../types'
import { loadActivityLog } from '../utils/storage/activity'
import { loadCheckInHistory, saveCheckInHistory } from '../utils/storage/checkIns'
import {
  loadCoachingDecisionHistory,
  saveCoachingDecisionHistory,
  subscribeToCoachingDecisionHistory,
} from '../utils/storage/coachDecisions'
import { subscribeToStorage } from '../utils/storage/core'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { loadDayMeta } from '../utils/storage/dayMeta'
import { loadInterventions } from '../utils/storage/interventions'
import { loadAllFoodLogs } from '../utils/storage/logs'

function fail(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: 'checkIn',
      message,
    },
  }
}

export function useWeeklyCheckIns(
  settings: UserSettings,
  weights: WeightEntry[],
  recoveryIssueCount: number,
) {
  const logsByDate = useSyncExternalStore(subscribeToStorage, loadAllFoodLogs, loadAllFoodLogs)
  const dayMeta = useSyncExternalStore(subscribeToStorage, loadDayMeta, loadDayMeta)
  const activityLog = useSyncExternalStore(subscribeToStorage, loadActivityLog, loadActivityLog)
  const interventions = useSyncExternalStore(subscribeToStorage, loadInterventions, loadInterventions)
  const checkInHistory = useSyncExternalStore(
    subscribeToStorage,
    loadCheckInHistory,
    loadCheckInHistory,
  )
  const coachingDecisionHistory = useSyncExternalStore(
    subscribeToCoachingDecisionHistory,
    loadCoachingDecisionHistory,
    loadCoachingDecisionHistory,
  )

  const current = useMemo(
    () =>
      evaluateCheckInWeek(
        settings,
        weights,
        logsByDate,
        dayMeta,
        activityLog,
        interventions,
        recoveryIssueCount,
      ),
    [activityLog, dayMeta, interventions, logsByDate, recoveryIssueCount, settings, weights],
  )
  const lastShadowEventKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const nextHistory = upsertCheckInRecord(checkInHistory, current.record)
    if (JSON.stringify(nextHistory) === JSON.stringify(checkInHistory)) {
      return
    }

    void saveCheckInHistory(nextHistory)
  }, [checkInHistory, current.record])

  useEffect(() => {
    const nextHistory = upsertCoachingDecisionRecord(coachingDecisionHistory, current.decisionRecord)
    if (JSON.stringify(nextHistory) === JSON.stringify(coachingDecisionHistory)) {
      return
    }

    void saveCoachingDecisionHistory(nextHistory)
  }, [coachingDecisionHistory, current.decisionRecord])

  useEffect(() => {
    if (!FEATURE_FLAGS.coachMethodV2 || !current.shadowComparison) {
      return
    }

    if (
      !current.shadowComparison.decisionChanged &&
      !current.shadowComparison.blockedReasonCodesChanged &&
      !current.shadowComparison.confidenceChanged
    ) {
      return
    }

    const eventKey = `${current.record.id}:${current.shadowComparison.currentDecisionType}:${current.shadowComparison.nextDecisionType}:${current.shadowComparison.currentBlockedReasonCodes.join(',')}:${current.shadowComparison.nextBlockedReasonCodes.join(',')}`
    if (lastShadowEventKeyRef.current === eventKey) {
      return
    }

    lastShadowEventKeyRef.current = eventKey
    void recordDiagnosticsEvent({
      eventType: 'coach_method_v2_diverged',
      severity: 'info',
      scope: 'diagnostics',
      recordKey: current.record.id,
      message: 'Coach Method V2 diverged from the current weekly coaching decision.',
      payload: {
        windowStart: current.decisionRecord.windowStart,
        windowEnd: current.decisionRecord.windowEnd,
        v1DecisionType: current.shadowComparison.currentDecisionType,
        v2DecisionType: current.shadowComparison.nextDecisionType,
        v1BlockedReasons: current.shadowComparison.currentBlockedReasonCodes,
        v2BlockedReasons: current.shadowComparison.nextBlockedReasonCodes,
        isFalseAdjustment: current.shadowComparison.isFalseAdjustment,
      },
    })
  }, [
    current.decisionRecord.windowEnd,
    current.decisionRecord.windowStart,
    current.record.id,
    current.shadowComparison,
  ])

  const currentRecord = useMemo(() => {
    return checkInHistory.find((entry) => entry.id === current.record.id) ?? current.record
  }, [checkInHistory, current.record])

  function updateCurrentStatus(status: 'applied' | 'kept'): ActionResult<CheckInRecord> {
    const existingRecord =
      loadCheckInHistory().find((entry) => entry.id === current.record.id) ?? current.record
    if (!existingRecord) {
      return fail('There is no completed weekly check-in to update yet.')
    }

    const nextRecord: CheckInRecord = {
      ...existingRecord,
      status,
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const nextHistory = upsertCheckInRecord(loadCheckInHistory(), nextRecord).map((entry) =>
      entry.id === nextRecord.id ? nextRecord : entry,
    )
    const result = saveCheckInHistory(nextHistory)
    if (!result.ok) {
      return result as ActionResult<CheckInRecord>
    }

    if (existingRecord.decisionRecordId) {
      const nextDecisionHistory = updateCoachingDecisionRecordStatus(
        loadCoachingDecisionHistory(),
        existingRecord.decisionRecordId,
        status,
      )
      const decisionResult = saveCoachingDecisionHistory(nextDecisionHistory)
      if (!decisionResult.ok) {
        return decisionResult as ActionResult<CheckInRecord>
      }
    }

    return {
      ok: true,
      data: nextRecord,
    }
  }

  return {
    currentCheckIn: currentRecord,
    canApplyTargets: current.canApplyTargets,
    checkInHistory,
    coachingDecisionHistory,
    markApplied: () => updateCurrentStatus('applied'),
    markKept: () => updateCurrentStatus('kept'),
  }
}
