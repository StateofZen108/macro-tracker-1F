/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryImportCorpusCase } from '../../src/types'

const CORPUS_ROOT = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'historyImport',
  'macrofactor',
  'corpus',
)

function readCorpusFixture(fileName: string): string {
  return readFileSync(path.join(CORPUS_ROOT, fileName), 'utf8')
}

function corpusFile(fileName: string): { fileName: string; text: string } {
  return { fileName, text: readCorpusFixture(fileName) }
}

const CORPUS_CASES: HistoryImportCorpusCase[] = [
  {
    id: 'food_weight_item_export',
    provider: 'macrofactor',
    files: [corpusFile('food-weight-food.csv'), corpusFile('food-weight-weights.csv')],
    expectedCounts: {
      logEntries: 3,
      logDays: 2,
      weights: 2,
      skippedRows: 0,
      supportedFiles: 2,
      unsupportedFiles: 0,
    },
    expectedWarnings: [],
    expectedReplayCommandDays: 2,
    expectedOverlapCount: 0,
  },
  {
    id: 'weights_only_export',
    provider: 'macrofactor',
    files: [corpusFile('weights-only-weights.csv')],
    expectedCounts: {
      logEntries: 0,
      logDays: 0,
      weights: 3,
      skippedRows: 0,
      supportedFiles: 1,
      unsupportedFiles: 0,
    },
    expectedWarnings: [],
    expectedReplayCommandDays: 3,
    expectedOverlapCount: 0,
  },
  {
    id: 'unsupported_day_total_with_weight_proof',
    provider: 'macrofactor',
    files: [corpusFile('unsupported-day-total.csv'), corpusFile('unsupported-mixed-weights.csv')],
    expectedCounts: {
      logEntries: 0,
      logDays: 0,
      weights: 2,
      skippedRows: 0,
      supportedFiles: 1,
      unsupportedFiles: 1,
    },
    expectedWarnings: ['unsupportedHistoryImportFile'],
    expectedReplayCommandDays: 2,
    expectedOverlapCount: 1,
  },
]

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

describe('MacroFactor import corpus', () => {
  it.each(CORPUS_CASES)(
    'matches expected preview counts, warnings, replay days, and overlaps for $id',
    async (corpusCase) => {
      const { previewHistoryImport } = await import('../../src/utils/storage/historyImport')
      const localDates =
        corpusCase.expectedOverlapCount > 0 ? new Set(['2026-03-08']) : new Set<string>()

      const result = await previewHistoryImport(
        corpusCase.provider,
        corpusCase.files.map((file) => ({ name: file.fileName, text: file.text })),
        {
          localDates,
          includeMacrofactorReplay: true,
        },
      )

      expect(result.ok).toBe(true)
      if (!result.ok) {
        return
      }

      expect(result.data.counts).toEqual(corpusCase.expectedCounts)
      expect(result.data.warnings.map((warning) => warning.code).sort()).toEqual(
        [...corpusCase.expectedWarnings].sort(),
      )
      expect(result.data.macrofactorReplayReport?.reconstructedCommands).toHaveLength(
        corpusCase.expectedReplayCommandDays,
      )
      expect(result.data.macrofactorReplayReport?.decisionDiffs).toHaveLength(
        corpusCase.expectedOverlapCount,
      )
    },
  )

  it('rejects unsupported-only day-total exports with a parser reason', async () => {
    const { previewHistoryImport } = await import('../../src/utils/storage/historyImport')

    const result = await previewHistoryImport('macrofactor', [
      { name: 'unsupported-day-total.csv', text: readCorpusFixture('unsupported-day-total.csv') },
    ])

    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    expect(result.error.code).toBe('unsupportedHistoryImport')
    expect(result.error.message).toContain('No supported files')
  })

  it('keeps corpus fixtures anonymized while preserving export headers', () => {
    const allCorpusText = CORPUS_CASES.flatMap((corpusCase) =>
      corpusCase.files.map((file) => file.text),
    ).join('\n')

    expect(allCorpusText).toContain('Food Name')
    expect(allCorpusText).toContain('Logged At')
    expect(allCorpusText).not.toMatch(/@|gmail|hotmail|deepp|street|phone|birth/i)
  })
})
