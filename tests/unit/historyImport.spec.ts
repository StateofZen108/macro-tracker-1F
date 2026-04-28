/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function readFixture(name: string): string {
  return readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'historyImport', name), 'utf8')
}

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('history import', () => {
  it('previews MacroFactor food and weight files while rejecting unsupported summary exports', async () => {
    const { previewHistoryImport } = await import('../../src/utils/storage/historyImport')

    const result = await previewHistoryImport('macrofactor', [
      { name: 'macrofactor-food-rows.csv', text: readFixture('macrofactor-food-rows.csv') },
      { name: 'macrofactor-weights.csv', text: readFixture('macrofactor-weights.csv') },
      { name: 'macrofactor-summary.csv', text: readFixture('macrofactor-summary.csv') },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.data.fileKinds).toEqual(['macrofactor_food_rows', 'macrofactor_weights'])
    expect(result.data.counts).toMatchObject({
      logEntries: 2,
      logDays: 1,
      weights: 2,
      supportedFiles: 2,
      unsupportedFiles: 1,
    })
    expect(result.data.warnings.some((warning) => warning.fileName === 'macrofactor-summary.csv')).toBe(true)
    expect(result.data.macrofactorReplayReport?.decisionDiffs).toEqual([])

    const yogurtEntry = result.data.payload.foodLogEntries.find((entry) => entry.snapshot.name === 'Greek Yogurt')
    expect(yogurtEntry?.servings).toBe(1.5)
    expect(yogurtEntry?.snapshot.brand).toBe('Fage')
  })

  it('previews MacroFactor replay overlap from supplied local dates without storage initialization', async () => {
    const { previewHistoryImport } = await import('../../src/utils/storage/historyImport')

    const result = await previewHistoryImport(
      'macrofactor',
      [
        { name: 'macrofactor-food-rows.csv', text: readFixture('macrofactor-food-rows.csv') },
        { name: 'macrofactor-weights.csv', text: readFixture('macrofactor-weights.csv') },
      ],
      {
        localDates: new Set(['2026-04-10']),
        includeMacrofactorReplay: true,
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.data.macrofactorReplayReport?.decisionDiffs).toEqual([
      {
        date: '2026-04-10',
        localWins: true,
        summary: 'Local records already exist for this date; replay marks imported rows as secondary evidence.',
      },
    ])
  })

  it('previews Renpho weights and warns that body-composition columns are ignored', async () => {
    const { previewHistoryImport } = await import('../../src/utils/storage/historyImport')

    const result = await previewHistoryImport('renpho', [
      { name: 'renpho-weights.csv', text: readFixture('renpho-weights.csv') },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.data.counts.weights).toBe(2)
    expect(result.data.warnings.some((warning) => warning.code === 'historyImportIgnoredColumns')).toBe(true)
  })

  it('keeps repeated applies idempotent and updates lastImportAt', async () => {
    const { initializeStorage } = await import('../../src/utils/storage/schema')
    const { previewHistoryImport, applyHistoryImport } = await import('../../src/utils/storage/historyImport')
    const { loadAllFoodLogs } = await import('../../src/utils/storage/logs')
    const { loadWeights } = await import('../../src/utils/storage/weights')
    const { loadSettings } = await import('../../src/utils/storage/settings')

    await initializeStorage()

    const preview = await previewHistoryImport('macrofactor', [
      { name: 'macrofactor-food-rows.csv', text: readFixture('macrofactor-food-rows.csv') },
      { name: 'macrofactor-weights.csv', text: readFixture('macrofactor-weights.csv') },
    ])
    expect(preview.ok).toBe(true)
    if (!preview.ok) {
      return
    }

    const firstApply = await applyHistoryImport(preview.data.payload)
    expect(firstApply.ok).toBe(true)

    const firstLogs = loadAllFoodLogs()
    expect(firstLogs['2026-04-10']).toHaveLength(2)
    expect(loadWeights()).toHaveLength(2)
    expect(loadSettings().lastImportAt).toBeTruthy()

    const secondApply = await applyHistoryImport(preview.data.payload)
    expect(secondApply.ok).toBe(true)

    const secondLogs = loadAllFoodLogs()
    expect(secondLogs['2026-04-10']).toHaveLength(2)
    expect(loadWeights()).toHaveLength(2)
  })

  it('fails closed when no supported files are present', async () => {
    const { previewHistoryImport } = await import('../../src/utils/storage/historyImport')

    const result = await previewHistoryImport('macrofactor', [
      { name: 'macrofactor-summary.csv', text: readFixture('macrofactor-summary.csv') },
    ])

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('unsupportedHistoryImport')
  })
})
