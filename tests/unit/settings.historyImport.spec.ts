/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BootstrapResolutionView } from '../../src/hooks/useSync'
import { SettingsScreen } from '../../src/screens/SettingsScreen'
import type {
  BootstrapStatusSummary,
  Food,
  HistoryImportPreview,
  Recipe,
  SyncCounts,
  SyncState,
} from '../../src/types'
import { DEFAULT_SETTINGS } from '../../src/utils/storage/settings'

const previewImportMock = vi.fn()
const applyHistoryImportMock = vi.fn()

vi.mock('../../src/hooks/useImportExport', () => ({
  useImportExport: () => ({
    applyImport: vi.fn(),
    exportBackup: vi.fn(),
    validateBackup: vi.fn(),
  }),
}))

vi.mock('../../src/hooks/useHistoryImport', () => ({
  useHistoryImport: () => ({
    previewImport: previewImportMock,
    applyImport: applyHistoryImportMock,
  }),
}))

vi.mock('../../src/hooks/useSafetySnapshots', () => ({
  useSafetySnapshots: () => ({
    summary: { lastSnapshotAt: null },
    captureSnapshot: vi.fn(async () => ({
      ok: true,
      data: {
        backup: {
          schemaVersion: 1,
          exportedAt: '2026-04-16T10:00:00.000Z',
          settings: DEFAULT_SETTINGS,
          foods: [],
          weights: [],
          logsByDate: {},
          dayMeta: [],
          activityLog: [],
          interventions: [],
          checkInHistory: [],
          coachingCalibration: [],
        },
      },
    })),
  }),
}))

const zeroCounts: SyncCounts = {
  foods: 0,
  logDays: 0,
  logEntries: 0,
  weights: 0,
  dayMeta: 0,
  activity: 0,
  wellness: 0,
  recoveryCheckIns: 0,
  dietPhases: 0,
  dietPhaseEvents: 0,
  interventions: 0,
  savedMeals: 0,
  recipes: 0,
  favoriteFoods: 0,
}

const bootstrapSummary: BootstrapStatusSummary = {
  localCounts: zeroCounts,
  cloudCounts: zeroCounts,
  localEmpty: true,
  cloudEmpty: true,
  bootstrapCompleted: true,
}

const syncState: SyncState = {
  status: 'upToDate',
  deviceId: 'device-1',
  pendingMutationCount: 0,
  deadLetterCount: 0,
  consecutiveFailures: 0,
  highWatermark: 0,
  recordVersions: {},
}

function buildFood(id: string): Food {
  return {
    id,
    name: `Food ${id}`,
    servingSize: 100,
    servingUnit: 'g',
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 2,
    source: 'custom',
    usageCount: 0,
    createdAt: '2026-04-15T10:00:00.000Z',
  }
}

function buildRecipe(id: string): Recipe {
  return {
    id,
    name: `Recipe ${id}`,
    yieldServings: 1,
    ingredients: [],
    usageCount: 0,
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
  }
}

function okResult<T>(data: T) {
  return {
    ok: true as const,
    data,
  }
}

function buildProps(overrides: Partial<ComponentProps<typeof SettingsScreen>> = {}) {
  const bootstrapResolutionView: BootstrapResolutionView = {
    requiresResolution: false,
    reason: null,
    localEffectivelyEmpty: true,
    cloudEffectivelyEmpty: true,
    defaultResolution: null,
  }

  return {
    settings: DEFAULT_SETTINGS,
    syncConfigured: true,
    syncState,
    syncSessionEmail: 'sync@example.com',
    syncAuthNotice: null,
    syncAuthError: null,
    bootstrapSummary,
    bootstrapResolutionView,
    mergePreview: null,
    bootstrapBusy: false,
    diagnosticsSummary: { totalCount: 0, counts: {} },
    foods: [],
    recipes: [],
    recoveryIssues: [],
    initializationError: null,
    getFoodReferenceCount: () => 0,
    onUpdateSettings: () => okResult(undefined),
    onCreateFood: () => okResult(buildFood('created')),
    onUpdateFood: () => okResult(undefined),
    onArchiveFood: () => okResult(undefined),
    onRestoreFood: () => okResult(undefined),
    onPurgeFood: () => okResult(undefined),
    onRenameRecipe: () => okResult(buildRecipe('renamed')),
    onArchiveRecipe: () => okResult(buildRecipe('archived')),
    onRestoreRecipe: () => okResult(buildRecipe('restored')),
    onDeleteRecipe: () => okResult(undefined),
    onFindDuplicateFood: () => null,
    onSendMagicLink: vi.fn(),
    onSignOut: vi.fn(),
    onSyncNow: vi.fn(),
    onPreviewMerge: vi.fn(),
    onApplyBootstrap: vi.fn(),
    onClearSyncDeadLetters: vi.fn(),
    onExportDiagnostics: () => '{}',
    onReportGlobalError: vi.fn(),
    onFoodEditorStateChange: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof SettingsScreen>
}

describe('settings history import', () => {
  beforeEach(() => {
    previewImportMock.mockReset()
    applyHistoryImportMock.mockReset()
    window.localStorage.clear()
  })

  it('previews and applies a third-party import', async () => {
    const preview: HistoryImportPreview = {
      provider: 'macrofactor',
      fileKinds: ['macrofactor_food_rows', 'macrofactor_weights'],
      counts: {
        logEntries: 2,
        logDays: 1,
        weights: 2,
        skippedRows: 0,
        supportedFiles: 2,
        unsupportedFiles: 0,
      },
      dateRange: {
        start: '2026-04-10',
        end: '2026-04-11',
      },
      warnings: [],
      payload: {
        provider: 'macrofactor',
        foodLogEntries: [],
        weights: [],
      },
    }

    previewImportMock.mockResolvedValueOnce({ ok: true, data: preview })
    applyHistoryImportMock.mockResolvedValueOnce({
      ok: true,
      data: preview.counts,
    })

    const view = render(createElement(SettingsScreen, buildProps()))
    const input = view.container.querySelector('[data-testid="macrofactor-history-input"]') as HTMLInputElement

    const file = new File(['Date,Meal,Food Name'], 'macrofactor-food.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(previewImportMock).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('MacroFactor preview')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Import to this device' }))

    await waitFor(() => {
      expect(applyHistoryImportMock).toHaveBeenCalledWith(preview)
    })

    expect(await screen.findByText('Imported 2 log entries and 2 weights from MacroFactor.')).toBeTruthy()
  })
})
