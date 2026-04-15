/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BackupFile, CheckInRecord, UserSettings } from '../../src/types'
import { compareCoachingShadowMode } from '../../src/domain/coaching/validation'
import { evaluateCoachEngineV1, evaluateCoachEngineV2 } from '../../src/domain/coaching/engine'

function resolveBackupPath(): string | null {
  if (process.env.COACH_PERSONAL_BACKUP_PATH?.trim()) {
    return process.env.COACH_PERSONAL_BACKUP_PATH.trim()
  }

  const cliPath = process.argv.find((value) => value.startsWith('--backup='))
  return cliPath ? cliPath.slice('--backup='.length) : null
}

function normalizeBackup(rawBackup: BackupFile): BackupFile {
  return {
    ...rawBackup,
    weeklyCheckIns: rawBackup.weeklyCheckIns ?? rawBackup.checkInHistory ?? [],
    checkInHistory: rawBackup.weeklyCheckIns ?? rawBackup.checkInHistory ?? [],
    coachDecisions: rawBackup.coachDecisions ?? [],
    dayMeta: rawBackup.dayMeta ?? [],
    activityLog: rawBackup.activityLog ?? [],
    interventions: rawBackup.interventions ?? [],
  }
}

function buildWindowSettings(
  backup: BackupFile,
  checkIn: CheckInRecord,
): UserSettings {
  const decisionRecord = (backup.coachDecisions ?? [])
    .filter((record) => record.windowEnd === checkIn.weekEndDate)
    .sort((left, right) => (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt))[0]

  return {
    ...backup.settings,
    calorieTarget: decisionRecord?.previousTargets.calorieTarget ?? backup.settings.calorieTarget,
    proteinTarget: decisionRecord?.previousTargets.proteinTarget ?? backup.settings.proteinTarget,
    carbTarget: decisionRecord?.previousTargets.carbTarget ?? backup.settings.carbTarget,
    fatTarget: decisionRecord?.previousTargets.fatTarget ?? backup.settings.fatTarget,
    goalMode: checkIn.goalMode,
    targetWeeklyRatePercent: checkIn.targetWeeklyRatePercent,
  }
}

describe('coach wave 1 personal shadow replay', () => {
  it.skipIf(!resolveBackupPath())('replays the last 8 completed weekly windows from a local backup export', () => {
    const backupPath = resolveBackupPath()
    const rawBackup = JSON.parse(readFileSync(backupPath!, 'utf8')) as BackupFile
    const backup = normalizeBackup(rawBackup)
    const completedCheckIns = [...(backup.weeklyCheckIns ?? [])]
      .sort((left, right) => right.weekEndDate.localeCompare(left.weekEndDate))
      .slice(0, 8)

    expect(completedCheckIns.length, 'Backup must contain at least one completed weekly window.').toBeGreaterThan(0)

    const shadowResults = completedCheckIns.map((checkIn) => {
      const windowSettings = buildWindowSettings(backup, checkIn)
      const params = {
        windowEnd: checkIn.weekEndDate,
        settings: windowSettings,
        logsByDate: backup.logsByDate,
        dayMeta: backup.dayMeta ?? [],
        weights: backup.weights,
        activityLog: backup.activityLog ?? [],
        interventions: backup.interventions ?? [],
        recoveryIssueCount: 0,
      }
      const v1 = evaluateCoachEngineV1(params)
      const v2 = evaluateCoachEngineV2(params)
      const shadow = compareCoachingShadowMode(v1.recommendation, v2.recommendation)

      return {
        weekEndDate: checkIn.weekEndDate,
        v1DecisionType: shadow.currentDecisionType,
        v2DecisionType: shadow.nextDecisionType,
        isFalseAdjustment: shadow.isFalseAdjustment,
      }
    })

    const falseAdjustments = shadowResults.filter((result) => result.isFalseAdjustment)

    expect(falseAdjustments, JSON.stringify(falseAdjustments, null, 2)).toHaveLength(0)
  })
})
