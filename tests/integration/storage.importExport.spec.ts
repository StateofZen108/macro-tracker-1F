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
    const { saveWeights, loadWeights } = await import('../../src/utils/storage/weights')
    const { saveActivityLog, loadActivityLog } = await import('../../src/utils/storage/activity')
    const { saveCheckInHistory, loadCheckInHistory } = await import('../../src/utils/storage/checkIns')
    const { exportBackupFile, validateBackupText, applyBackupImport } = await import(
      '../../src/utils/storage/importExport'
    )

    await initializeStorage()
    await saveFoods([
      {
        id: 'custom-rice',
        name: 'Rice',
        servingSize: 1,
        servingUnit: 'cup',
        calories: 200,
        protein: 4,
        carbs: 45,
        fat: 1,
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
      },
    ])

    const exported = exportBackupFile()
    expect(exported.ok).toBe(true)
    const preview = validateBackupText(JSON.stringify(exported.ok ? exported.data : {}))
    expect(preview.ok).toBe(true)

    window.localStorage.clear()
    await initializeStorage()

    const backup = exported.ok ? exported.data : ({} as BackupFile)
    const importResult = applyBackupImport(backup, 'replace')
    expect(importResult.ok).toBe(true)
    await initializeStorage()
    expect(loadFoods().some((food) => food.id === 'custom-rice')).toBe(true)
    expect(loadWeights()).toHaveLength(1)
    expect(loadActivityLog()).toHaveLength(1)
    expect(loadCheckInHistory()).toHaveLength(1)
  })
})
