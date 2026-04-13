/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('storage recovery', () => {
  it('surfaces unreadable foods as recovery issues', async () => {
    window.localStorage.setItem('mt_foods', '{broken')

    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { getRecoveryIssues } = await import('../../src/utils/storage/recovery')

    await initializeStorage()
    expect(getRecoveryIssues().some((issue) => /food/i.test(issue.scope))).toBe(true)
  })

  it('normalizes invalid fasting plus food import states into partial days', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { applyBackupImport } = await import('../../src/utils/storage/importExport')
    const { loadDayMeta } = await import('../../src/utils/storage/dayMeta')
    const { getRecoveryIssues } = await import('../../src/utils/storage/recovery')

    await initializeStorage()
    const backup = {
      schemaVersion: 6,
      exportedAt: '2026-04-10T00:00:00.000Z',
      foods: [],
      weights: [],
      settings: null,
      uiPrefs: null,
      mealTemplates: [],
      dayMeta: [{ date: '2026-04-10', status: 'fasting', updatedAt: '2026-04-10T09:00:00.000Z' }],
      activityLog: [],
      interventions: [],
      checkInHistory: [],
      coachingCalibration: [],
      coachThread: null,
      coachFeedback: [],
      coachQueue: [],
      coachConfig: null,
      logsByDate: {
        '2026-04-10': [
          {
            id: 'entry-1',
            date: '2026-04-10',
            meal: 'breakfast',
            servings: 1,
            createdAt: '2026-04-10T08:00:00.000Z',
            snapshot: {
              name: 'Invalid fast',
              servingSize: 1,
              servingUnit: 'entry',
              calories: 100,
              protein: 10,
              carbs: 10,
              fat: 1,
              source: 'custom',
            },
          },
        ],
      },
    }

    const result = applyBackupImport(backup as never, 'replace')
    expect(result.ok).toBe(true)
    await initializeStorage()
    expect(loadDayMeta()[0]?.status).toBe('partial')
    expect(getRecoveryIssues().some((issue) => /fasting/i.test(issue.message))).toBe(true)
  })
})
