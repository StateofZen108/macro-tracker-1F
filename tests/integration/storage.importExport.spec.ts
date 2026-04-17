/** @vitest-environment jsdom */
import type { BackupFile } from '../../src/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('storage import/export', () => {
  it('round-trips foods, weights, activity, and check-in history', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { saveFoods, loadFoods } = await import('../../src/utils/storage/foods')
    const { loadSettings, saveSettings } = await import('../../src/utils/storage/settings')
    const { saveWeights, loadWeights } = await import('../../src/utils/storage/weights')
    const { saveActivityLog, loadActivityLog } = await import('../../src/utils/storage/activity')
    const { saveCheckInHistory, loadCheckInHistory } = await import('../../src/utils/storage/checkIns')
    const {
      saveCoachingDecisionHistory,
      loadCoachingDecisionHistory,
    } = await import('../../src/utils/storage/coachDecisions')
    const { exportBackupFile, validateBackupText, applyBackupImport } = await import(
      '../../src/utils/storage/importExport'
    )

    vi.useRealTimers()
    await initializeStorage()
    await saveFoods([
      {
        id: 'custom-rice',
        name: 'Rice',
        brand: 'Pantry',
        servingSize: 1,
        servingUnit: 'cup',
        calories: 200,
        protein: 4,
        carbs: 45,
        fat: 1,
        barcode: '0123456789012',
        searchAliases: ['rice cup', 'pantry rice'],
        remoteReferences: [
          {
            provider: 'open_food_facts',
            remoteKey: '0123456789012',
            barcode: '0123456789012',
          },
        ],
        source: 'custom',
        usageCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    await saveWeights([
      {
        id: 'weight-1',
        date: '2026-04-10',
        weight: 200,
        unit: 'lb',
        createdAt: '2026-04-10T07:00:00.000Z',
      },
    ])
    await saveActivityLog([{ date: '2026-04-10', steps: 9000, updatedAt: '2026-04-10T10:00:00.000Z' }])
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-11T08:00:00.000Z'))
    await saveSettings({
      ...loadSettings(),
      goalMode: 'lose',
      fatLossMode: 'standard_cut',
      coachingMinCalories: 950,
      targetWeeklyRatePercent: -0.8,
      loggingShortcutPreference: {
        ...loadSettings().loggingShortcutPreference!,
        enabledShortcutIds: ['custom', 'scanner'],
        shortcutOrder: ['custom', 'scanner', 'ocr'],
        mealAwareLane: false,
        topShortcutId: 'custom',
      },
      workoutActionOverrides: [
        {
          date: '2026-04-11',
          action: 'hold',
          updatedAt: '2026-04-11T08:00:00.000Z',
        },
      ],
      bodyProgressFocusState: {
        focusedMetricKey: 'waist',
        comparePreset: '7d',
        lastSelectedPose: 'side',
      },
    })
    vi.setSystemTime(new Date('2026-04-12T08:00:00.000Z'))
    await saveSettings({
      ...loadSettings(),
      fatLossMode: 'psmf',
    })
    const seededSettings = loadSettings()
    vi.useRealTimers()
    await saveCheckInHistory([
      {
        id: 'checkin:2026-04-07',
        weekEndDate: '2026-04-07',
        weekStartDate: '2026-04-01',
        priorWeekStartDate: '2026-03-25',
        priorWeekEndDate: '2026-03-31',
        goalMode: 'lose',
        targetWeeklyRatePercent: -0.5,
        actualWeeklyRatePercent: -0.4,
        avgCalories: 2000,
        avgProtein: 180,
        avgSteps: 9000,
        weeklyCardioMinutes: 120,
        stepAdherencePercent: 100,
        cardioAdherencePercent: 100,
        avgWeight: 199.5,
        priorAvgWeight: 200.3,
        recommendationReason: 'Keep current calories.',
        status: 'kept',
        createdAt: '2026-04-07T08:00:00.000Z',
        updatedAt: '2026-04-07T08:00:00.000Z',
      },
    ])
    await saveCoachingDecisionHistory([
      {
        id: 'engine_v1:2026-03-18:2026-04-07',
        source: 'engine_v1',
        status: 'kept',
        decisionType: 'keep_targets',
        windowStart: '2026-03-18',
        windowEnd: '2026-04-07',
        effectiveDate: '2026-04-08',
        confidenceBand: 'high',
        confidenceScore: 88,
        reasonCodes: ['on_target'],
        blockedReasons: [],
        explanation: 'Weight trend is aligned with the current target.',
        previousTargets: {
          calorieTarget: 2000,
          proteinTarget: 180,
          carbTarget: 200,
          fatTarget: 60,
        },
        proposedTargets: {
          calorieTarget: 2000,
          proteinTarget: 180,
          carbTarget: 200,
          fatTarget: 60,
        },
        createdAt: '2026-04-07T08:00:00.000Z',
        appliedAt: '2026-04-07T08:05:00.000Z',
        updatedAt: '2026-04-07T08:05:00.000Z',
      },
    ])

    const exported = exportBackupFile()
    expect(exported.ok).toBe(true)
    const preview = validateBackupText(JSON.stringify(exported.ok ? exported.data : {}))
    expect(preview.ok).toBe(true)

    window.localStorage.clear()
    await initializeStorage()

    const backup = exported.ok ? exported.data : ({} as BackupFile)
    const importResult = await applyBackupImport(backup, 'replace')
    expect(importResult.ok).toBe(true)
    await initializeStorage()
    const restoredFood = loadFoods().find((food) => food.id === 'custom-rice')
    expect(restoredFood).toBeDefined()
    expect(restoredFood?.searchAliases).toContain('pantry rice')
    expect(restoredFood?.remoteReferences).toEqual([
      {
        provider: 'open_food_facts',
        remoteKey: '0123456789012',
        barcode: '0123456789012',
      },
    ])
    expect(loadWeights()).toHaveLength(1)
    expect(loadActivityLog()).toHaveLength(1)
    expect(loadCheckInHistory()).toHaveLength(1)
    expect(loadCoachingDecisionHistory()).toHaveLength(1)
    expect(loadSettings().fatLossMode).toBe(seededSettings.fatLossMode)
    expect(loadSettings().coachingMinCalories).toBe(seededSettings.coachingMinCalories)
    expect(loadSettings().goalModeChangedAt).toBe(seededSettings.goalModeChangedAt)
    expect(loadSettings().goalModeChangedFrom).toBe(seededSettings.goalModeChangedFrom)
    expect(loadSettings().fatLossModeChangedAt).toBe(seededSettings.fatLossModeChangedAt)
    expect(loadSettings().loggingShortcutPreference).toMatchObject({
      enabledShortcutIds: ['custom', 'scanner'],
      shortcutOrder: ['custom', 'scanner', 'ocr'],
      mealAwareLane: false,
      topShortcutId: 'custom',
    })
    expect(loadSettings().workoutActionOverrides).toEqual(seededSettings.workoutActionOverrides)
    expect(loadSettings().bodyProgressFocusState).toMatchObject({
      focusedMetricKey: 'waist',
      comparePreset: '7d',
      lastSelectedPose: 'side',
    })
  })
})
