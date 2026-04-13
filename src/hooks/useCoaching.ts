import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  buildCalibrationRecord,
  buildEmptyCoachingInsight,
  COACHING_CONFIG,
  compareDateKeys,
  getCalibrationPhase,
  roundCoachingValue,
} from '../domain/coaching/math'
import { evaluateCoachEngineV1 } from '../domain/coaching'
import type { CoachingInsight, UserSettings, WeightEntry } from '../types'
import { getTodayDateKey } from '../utils/dates'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { convertWeight } from '../utils/macros'
import { loadCoachingCalibration, saveCoachingCalibration } from '../utils/storage/coaching'
import { subscribeToStorage } from '../utils/storage/core'
import { loadDayMeta } from '../utils/storage/dayMeta'
import { loadInterventions } from '../utils/storage/interventions'
import { loadAllFoodLogs } from '../utils/storage/logs'

export function useCoaching(
  settings: UserSettings,
  weights: WeightEntry[],
  recoveryIssueCount: number,
): CoachingInsight {
  const blockedSignatureRef = useRef<string | null>(null)
  const logsByDate = useSyncExternalStore(subscribeToStorage, loadAllFoodLogs, loadAllFoodLogs)
  const dayMeta = useSyncExternalStore(subscribeToStorage, loadDayMeta, loadDayMeta)
  const interventions = useSyncExternalStore(subscribeToStorage, loadInterventions, loadInterventions)
  const coachingCalibration = useSyncExternalStore(
    subscribeToStorage,
    loadCoachingCalibration,
    loadCoachingCalibration,
  )

  const today = getTodayDateKey()

  const currentWindow = useMemo(
    () =>
      evaluateCoachEngineV1({
        windowEnd: today,
        settings,
        logsByDate,
        weights,
        dayMeta,
        interventions,
        recoveryIssueCount,
      }),
    [dayMeta, interventions, logsByDate, recoveryIssueCount, settings, today, weights],
  )

  useEffect(() => {
    if (!settings.coachingEnabled || currentWindow.quality.isActionable) {
      blockedSignatureRef.current = null
      return
    }

    const signature = `${currentWindow.context.windowStart}:${currentWindow.context.windowEnd}:${currentWindow.explanation.reason}`
    if (blockedSignatureRef.current === signature) {
      return
    }

    blockedSignatureRef.current = signature
    void recordDiagnosticsEvent({
      eventType: 'coaching_engine_blocked',
      severity: 'warning',
      scope: 'diagnostics',
      message: currentWindow.explanation.reason,
      payload: {
        windowStart: currentWindow.context.windowStart,
        windowEnd: currentWindow.context.windowEnd,
        confidenceBand: currentWindow.quality.confidenceBand,
        confidenceScore: currentWindow.quality.confidenceScore,
        intakeDays: currentWindow.summary.intakeDays,
        weighInDays: currentWindow.summary.weighInDays,
        eligibleDays: currentWindow.summary.eligibleDays,
        blockedBy: currentWindow.quality.blockedBy,
      },
    })
  }, [currentWindow, settings.coachingEnabled])

  useEffect(() => {
    if (
      !settings.coachingEnabled ||
      currentWindow.trend.estimatedTdee === null ||
      currentWindow.quality.confidenceScore === null
    ) {
      return
    }

    let nextRecords = [...coachingCalibration]
    let changed = false

    if (
      currentWindow.quality.isActionable &&
      currentWindow.quality.confidenceScore >= 50 &&
      !currentWindow.context.recentlyImported &&
      recoveryIssueCount === 0
    ) {
      const candidateRecord = buildCalibrationRecord(
        {
          windowStart: currentWindow.context.windowStart,
          windowEnd: currentWindow.context.windowEnd,
          estimatedTdee: currentWindow.trend.estimatedTdee,
          allDayRecommendedCalories: currentWindow.policy.allDayTargetFromTdee,
          eatingDayRecommendedCalories: currentWindow.policy.eatingDayTargetFromTdee,
          confidenceScore: currentWindow.quality.confidenceScore,
          eligibleDays: currentWindow.summary.eligibleDays,
          fastingDays: currentWindow.summary.fastingDays,
          partialDays: currentWindow.summary.partialDays,
          hasInterventionConfounder: currentWindow.intervention.hasRecentChanges,
        } as Parameters<typeof buildCalibrationRecord>[0],
        settings.goalMode,
      )
      const existingIndex = nextRecords.findIndex((record) => record.id === candidateRecord.id)

      if (existingIndex === -1) {
        nextRecords.push(candidateRecord)
        changed = true
      }
    }

    nextRecords = nextRecords.map((record) => {
      if (record.validated) {
        return record
      }

      const observationEnd = record.windowEnd
      const validationWindowEnd = new Date(`${observationEnd}T00:00:00.000Z`)
      validationWindowEnd.setUTCDate(validationWindowEnd.getUTCDate() + COACHING_CONFIG.analysisWindowDays)
      const comparisonDate = validationWindowEnd.toISOString().slice(0, 10)
      if (compareDateKeys(today, comparisonDate) < 0) {
        return record
      }

      const observationWindow = evaluateCoachEngineV1({
        windowEnd: comparisonDate,
        settings,
        logsByDate,
        weights,
        dayMeta,
        interventions,
        recoveryIssueCount,
      })

      if (
        !observationWindow.quality.isActionable ||
        observationWindow.trend.estimatedTdee === null ||
        recoveryIssueCount > 0
      ) {
        return record
      }

      changed = true
      const tdeeError = roundCoachingValue(observationWindow.trend.estimatedTdee - record.predictedTdee, 0)
      return {
        ...record,
        validated: true,
        observedTdee: observationWindow.trend.estimatedTdee,
        tdeeError,
        within150: Math.abs(tdeeError) <= 150,
        within250: Math.abs(tdeeError) <= 250,
        validatedAt: new Date().toISOString(),
      }
    })

    const serializedCurrent = JSON.stringify(coachingCalibration)
    const serializedNext = JSON.stringify(nextRecords)
    if (!changed || serializedCurrent === serializedNext) {
      return
    }

    void saveCoachingCalibration(nextRecords)
  }, [
    coachingCalibration,
    currentWindow,
    dayMeta,
    interventions,
    logsByDate,
    recoveryIssueCount,
    settings,
    today,
    weights,
  ])

  return useMemo(() => {
    if (!settings.coachingEnabled) {
      return buildEmptyCoachingInsight(
        settings,
        'Coaching is off',
        'Enable coaching in Settings to see confidence scoring, intervention-aware trend analysis, and target guidance.',
      )
    }

    if (
      currentWindow.summary.avgEligibleCalories === null ||
      currentWindow.trend.estimatedTdee === null
    ) {
      const calibration = getCalibrationPhase(
        {
          confidenceScore: currentWindow.quality.confidenceScore,
          fastingDays: currentWindow.summary.fastingDays,
          hasInterventionConfounder: currentWindow.intervention.hasRecentChanges,
        } as Parameters<typeof getCalibrationPhase>[0],
        coachingCalibration,
      )
      return {
        ...buildEmptyCoachingInsight(
          settings,
          currentWindow.explanation.reason,
          currentWindow.explanation.explanation,
        ),
        confidence: currentWindow.quality.confidenceBand,
        confidenceBand: currentWindow.quality.confidenceBand,
        confidenceScore: currentWindow.quality.confidenceScore,
        intakeDays: currentWindow.summary.intakeDays,
        weighInDays: currentWindow.summary.weighInDays,
        completeDays: currentWindow.summary.completeDays,
        partialDays: currentWindow.summary.partialDays,
        fastingDays: currentWindow.summary.fastingDays,
        unmarkedLoggedDays: currentWindow.summary.unmarkedLoggedDays,
        eligibleDays: currentWindow.summary.eligibleDays,
        confounders: currentWindow.explanation.confounders,
        calibrationPhase: calibration.phase,
        calibratedConfidencePercent: calibration.percent,
      }
    }

    const calibration = getCalibrationPhase(
      {
        confidenceScore: currentWindow.quality.confidenceScore,
        fastingDays: currentWindow.summary.fastingDays,
        hasInterventionConfounder: currentWindow.intervention.hasRecentChanges,
      } as Parameters<typeof getCalibrationPhase>[0],
      coachingCalibration,
    )

    return {
      confidence: currentWindow.quality.confidenceBand,
      confidenceBand: currentWindow.quality.confidenceBand,
      confidenceScore: currentWindow.quality.confidenceScore,
      goalMode: settings.goalMode,
      isReady: currentWindow.quality.isActionable,
      reason: currentWindow.explanation.reason,
      explanation: currentWindow.explanation.explanation,
      avgDailyCalories: currentWindow.summary.avgEligibleCalories,
      avgDailyProtein: currentWindow.summary.avgEligibleProtein,
      estimatedTdee: currentWindow.trend.estimatedTdee,
      recommendedCalories: currentWindow.recommendation.recommendedCalories,
      allDayRecommendedCalories: currentWindow.policy.allDayTargetFromTdee,
      eatingDayRecommendedCalories: currentWindow.policy.eatingDayTargetFromTdee,
      weightChange:
        currentWindow.trend.weightChangeLb === null
          ? null
          : roundCoachingValue(
              convertWeight(currentWindow.trend.weightChangeLb, 'lb', settings.weightUnit),
              2,
            ),
      weightChangeUnit: settings.weightUnit,
      adherenceTone: currentWindow.quality.adherenceTone,
      windowDays: COACHING_CONFIG.analysisWindowDays,
      weighInDays: currentWindow.summary.weighInDays,
      intakeDays: currentWindow.summary.intakeDays,
      completeDays: currentWindow.summary.completeDays,
      partialDays: currentWindow.summary.partialDays,
      fastingDays: currentWindow.summary.fastingDays,
      unmarkedLoggedDays: currentWindow.summary.unmarkedLoggedDays,
      eligibleDays: currentWindow.summary.eligibleDays,
      confounders: currentWindow.explanation.confounders,
      calibrationPhase: calibration.phase,
      calibratedConfidencePercent: calibration.percent,
    }
  }, [coachingCalibration, currentWindow, settings])
}
