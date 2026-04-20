import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { FEATURE_FLAGS } from '../config/featureFlags'
import {
  evaluateCheckInWeek,
  isCheckInWindowActiveForDate,
  upsertCheckInRecord,
} from '../domain/checkIns/math'
import {
  updateCoachingDecisionRecordStatus,
  upsertCoachingDecisionRecord,
} from '../domain/coaching'
import type {
  ActionResult,
  BodyProgressSnapshot,
  CheckInRecord,
  DietPhase,
  DietPhaseEvent,
  RecoveryReadiness,
  StrengthRetentionSnapshot,
  UserSettings,
  WeightEntry,
} from '../types'
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
  adaptiveInputs?: {
    bodyProgressSnapshots?: BodyProgressSnapshot[]
    dietPhases?: DietPhase[]
    dietPhaseEvents?: DietPhaseEvent[]
    readiness?: RecoveryReadiness
    strengthRetention?: StrengthRetentionSnapshot
  },
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
        {
          ...adaptiveInputs,
          coachingDecisionHistory,
        },
      ),
    [
      activityLog,
      adaptiveInputs,
      coachingDecisionHistory,
      dayMeta,
      interventions,
      logsByDate,
      recoveryIssueCount,
      settings,
      weights,
    ],
  )
  const lastShadowEventKeyRef = useRef<string | null>(null)
  const lastCoachV3PacketEventKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const latestHistory = loadCheckInHistory()
    const nextHistory = upsertCheckInRecord(latestHistory, current.record)
    if (JSON.stringify(nextHistory) === JSON.stringify(latestHistory)) {
      return
    }

    void saveCheckInHistory(nextHistory)
  }, [current.record])

  useEffect(() => {
    const latestHistory = loadCoachingDecisionHistory()
    const staleRecords = latestHistory.filter(
      (entry) =>
        entry.windowStart === current.decisionRecord.windowStart &&
        entry.windowEnd === current.decisionRecord.windowEnd &&
        entry.id !== current.decisionRecord.id &&
        (entry.status === 'pending' || entry.status === 'deferred'),
    )
    let nextHistory = upsertCoachingDecisionRecord(latestHistory, current.decisionRecord)
    for (const staleRecord of staleRecords) {
      nextHistory = updateCoachingDecisionRecordStatus(nextHistory, staleRecord.id, 'superseded')
    }
    if (JSON.stringify(nextHistory) === JSON.stringify(latestHistory)) {
      return
    }

    void saveCoachingDecisionHistory(nextHistory)
    if (FEATURE_FLAGS.adaptiveCutIntelligenceV1 && staleRecords.length > 0) {
      void recordDiagnosticsEvent({
        eventType: 'cut_intel_v1.review_superseded',
        severity: 'info',
        scope: 'diagnostics',
        recordKey: current.record.id,
        message: 'A stale adaptive cut review was superseded by fresher data.',
        payload: {
          supersededDecisionIds: staleRecords.map((entry) => entry.id),
          nextDecisionId: current.decisionRecord.id,
        },
      })
    }
  }, [current.decisionRecord])

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

  useEffect(() => {
    if (!FEATURE_FLAGS.coachEngineV3 || !current.record.weeklyCheckInPacket) {
      return
    }

    const packet = current.record.weeklyCheckInPacket
    const eventKey = `${current.record.id}:${packet.decisionType}:${packet.confidenceBand}:${packet.generatedAt}`
    if (lastCoachV3PacketEventKeyRef.current === eventKey) {
      return
    }

    lastCoachV3PacketEventKeyRef.current = eventKey
    void recordDiagnosticsEvent({
      eventType: 'coach_v3_packet_generated',
      severity: 'info',
      scope: 'diagnostics',
      recordKey: current.record.id,
      message: 'Coach Engine V3 packet generated for the latest weekly check-in.',
      payload: {
        decisionType: packet.decisionType,
        confidenceBand: packet.confidenceBand,
        confidenceScore: packet.confidenceScore,
        nextCheckInDate: packet.nextCheckInDate,
      },
    })
  }, [current.record.id, current.record.weeklyCheckInPacket])

  const currentRecord = useMemo(() => {
    return checkInHistory.find((entry) => entry.id === current.record.id) ?? current.record
  }, [checkInHistory, current.record])

  function updateCurrentStatus(
    status: 'applied' | 'kept' | 'deferred',
  ): ActionResult<CheckInRecord> {
    const existingRecord =
      loadCheckInHistory().find((entry) => entry.id === current.record.id) ?? current.record
    if (!existingRecord) {
      return fail('There is no completed weekly check-in to update yet.')
    }

    const nextRecord: CheckInRecord = {
      ...existingRecord,
      status,
      appliedAt: status === 'applied' || status === 'kept' ? new Date().toISOString() : existingRecord.appliedAt,
      cutReviewCard: existingRecord.cutReviewCard
        ? {
            ...existingRecord.cutReviewCard,
            state:
              status === 'applied' || status === 'kept'
                ? 'accepted'
                : status === 'deferred'
                  ? 'deferred'
                  : existingRecord.cutReviewCard.state,
          }
        : undefined,
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

  function markOverridden(
    overrideDecisionRecordId: string,
    effectiveDate: string,
  ): ActionResult<CheckInRecord> {
    const existingRecord =
      loadCheckInHistory().find((entry) => entry.id === current.record.id) ?? current.record
    if (!existingRecord) {
      return fail('There is no completed weekly check-in to override yet.')
    }

    if (!isCheckInWindowActiveForDate(existingRecord, effectiveDate)) {
      return {
        ok: true,
        data: existingRecord,
      }
    }

    const nextRecord: CheckInRecord = {
      ...existingRecord,
      status: 'overridden',
      supersededByDecisionRecordId: overrideDecisionRecordId,
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
        'overridden',
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
    markDeferred: () => updateCurrentStatus('deferred'),
    markOverridden,
  }
}
