/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BootstrapResolutionView } from '../../src/hooks/useSync'
import { SettingsScreen } from '../../src/screens/SettingsScreen'
import type { BootstrapStatusSummary, Food, Recipe, SyncCounts, SyncState } from '../../src/types'
import { DEFAULT_SETTINGS } from '../../src/utils/storage/settings'

vi.mock('../../src/hooks/useImportExport', () => ({
  useImportExport: () => ({
    applyImport: vi.fn(),
    exportBackup: vi.fn(),
    validateBackup: vi.fn(),
  }),
}))

vi.mock('../../src/hooks/useHistoryImport', () => ({
  useHistoryImport: () => ({
    applyImport: vi.fn(),
    previewImport: vi.fn(),
  }),
}))

vi.mock('../../src/hooks/useSafetySnapshots', () => ({
  useSafetySnapshots: () => ({
    summary: { lastSnapshotAt: null },
    captureSnapshot: vi.fn(),
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
  status: 'bootstrapRequired',
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

function buildProps(
  resolutionView: BootstrapResolutionView,
  overrides: Partial<ComponentProps<typeof SettingsScreen>> = {},
) {
  const onApplyBootstrap = vi.fn()
  const onPreviewMerge = vi.fn()

  return {
    onApplyBootstrap,
    onPreviewMerge,
    props: {
      settings: DEFAULT_SETTINGS,
      syncConfigured: true,
      syncState,
      syncSessionEmail: 'sync@example.com',
      syncAuthNotice: null,
      syncAuthError: null,
      bootstrapSummary,
      bootstrapResolutionView: resolutionView,
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
      onPreviewMerge,
      onApplyBootstrap,
      onClearSyncDeadLetters: vi.fn(),
      onExportDiagnostics: () => '{}',
      onReportGlobalError: vi.fn(),
      onFoodEditorStateChange: vi.fn(),
      ...overrides,
    } satisfies ComponentProps<typeof SettingsScreen>,
  }
}

describe('settings sync resolution card', () => {
  it('uses the post-sign-in conflict primary CTA rules and shows the synced-settings note when counts are zero', () => {
    const previewMergeView: BootstrapResolutionView = {
      requiresResolution: true,
      reason: 'post_sign_in_conflict',
      localEffectivelyEmpty: false,
      cloudEffectivelyEmpty: false,
      defaultResolution: null,
    }
    const previewSetup = buildProps(previewMergeView)
    const view = render(createElement(SettingsScreen, previewSetup.props))

    expect(screen.getByText('Synced settings also count as data on this device.')).toBeTruthy()
    expect(screen.getByText('Synced settings also count as data in this cloud account.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }))
    expect(previewSetup.onPreviewMerge).toHaveBeenCalledTimes(1)

    const replaceCloudView: BootstrapResolutionView = {
      requiresResolution: true,
      reason: 'post_sign_in_conflict',
      localEffectivelyEmpty: false,
      cloudEffectivelyEmpty: true,
      defaultResolution: 'replaceCloudWithThisDevice',
    }
    const replaceSetup = buildProps(replaceCloudView, {
      onPreviewMerge: previewSetup.onPreviewMerge,
      onApplyBootstrap: previewSetup.onApplyBootstrap,
    })

    view.rerender(createElement(SettingsScreen, replaceSetup.props))

    fireEvent.click(screen.getByRole('button', { name: 'Replace cloud with this device' }))
    expect(previewSetup.onApplyBootstrap).toHaveBeenCalledWith('replaceCloudWithThisDevice')
  })
})
