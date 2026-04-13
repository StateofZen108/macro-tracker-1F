import { Archive, Download, Lock, PencilLine, Plus, RotateCcw, ShieldAlert, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { FoodForm } from '../components/FoodForm'
import { TemplateSummaryCard } from '../components/TemplateSummaryCard'
import { isFoodEditable } from '../hooks/useFoods'
import { useImportExport } from '../hooks/useImportExport'
import type {
  ActionResult,
  AppActionError,
  BackupPreview,
  BootstrapResolution,
  BootstrapStatusSummary,
  DiagnosticsSummary,
  Food,
  FoodDraft,
  ImportMode,
  Recipe,
  RecoverableDataIssue,
  SyncCounts,
  SyncState,
  UserSettings,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'

interface SettingsScreenProps {
  settings: UserSettings
  syncConfigured: boolean
  syncState: SyncState
  syncSessionEmail: string | null
  syncAuthNotice: string | null
  syncAuthError: string | null
  bootstrapSummary: BootstrapStatusSummary | null
  mergePreview: SyncCounts | null
  bootstrapBusy: boolean
  diagnosticsSummary: DiagnosticsSummary
  foods: Food[]
  recipes: Recipe[]
  recoveryIssues: RecoverableDataIssue[]
  initializationError: AppActionError | null
  getFoodReferenceCount: (foodId: string) => number
  onUpdateSettings: (settings: UserSettings) => ActionResult<void>
  onCreateFood: (draft: FoodDraft) => ActionResult<Food>
  onUpdateFood: (foodId: string, draft: FoodDraft) => ActionResult<void>
  onArchiveFood: (foodId: string) => ActionResult<void>
  onRestoreFood: (foodId: string) => ActionResult<void>
  onPurgeFood: (foodId: string) => ActionResult<void>
  onRenameRecipe: (recipeId: string, name: string) => ActionResult<Recipe>
  onArchiveRecipe: (recipeId: string) => ActionResult<Recipe>
  onRestoreRecipe: (recipeId: string) => ActionResult<Recipe>
  onDeleteRecipe: (recipeId: string) => ActionResult<void>
  onFindDuplicateFood: (draft: FoodDraft, excludeFoodId?: string) => Food | null
  onSendMagicLink: (email: string) => Promise<void> | void
  onSignOut: () => void
  onSyncNow: () => void
  onPreviewMerge: () => void
  onApplyBootstrap: (resolution: BootstrapResolution) => void
  onClearSyncDeadLetters: () => void
  onExportDiagnostics: () => string
  onReportGlobalError: (error: AppActionError | string | null) => void
  onFoodEditorStateChange: (state: ExternalSheetState | null) => void
}

interface ExternalSheetState {
  open: boolean
  dirty: boolean
  requestClose: () => void
}

interface SettingsFormState {
  calorieTarget: string
  proteinTarget: string
  carbTarget: string
  fatTarget: string
  weightUnit: 'lb' | 'kg'
  goalMode: UserSettings['goalMode']
  coachingEnabled: boolean
  checkInWeekday: UserSettings['checkInWeekday']
  targetWeeklyRatePercent: string
  dailyStepTarget: string
  weeklyCardioMinuteTarget: string
}

interface FoodEditorState {
  mode: 'create' | 'edit'
  food?: Food
}

function buildSettingsFormState(settings: UserSettings): SettingsFormState {
  return {
    calorieTarget: `${settings.calorieTarget}`,
    proteinTarget: `${settings.proteinTarget}`,
    carbTarget: `${settings.carbTarget}`,
    fatTarget: `${settings.fatTarget}`,
    weightUnit: settings.weightUnit,
    goalMode: settings.goalMode,
    coachingEnabled: settings.coachingEnabled,
    checkInWeekday: settings.checkInWeekday,
    targetWeeklyRatePercent: `${settings.targetWeeklyRatePercent}`,
    dailyStepTarget:
      typeof settings.dailyStepTarget === 'number' ? `${settings.dailyStepTarget}` : '',
    weeklyCardioMinuteTarget:
      typeof settings.weeklyCardioMinuteTarget === 'number'
        ? `${settings.weeklyCardioMinuteTarget}`
        : '',
  }
}

function parseTarget(label: string, value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid number.`)
  }

  return parsed
}

function parseOptionalTarget(label: string, value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  return parseTarget(label, value)
}

function formatLocalDateTime(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function buildBackupFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `macrotracker-backup-${timestamp}.json`
}

function buildDiagnosticsFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `macrotracker-diagnostics-${timestamp}.json`
}

function SettingsScreen({
  settings,
  syncConfigured,
  syncState,
  syncSessionEmail,
  syncAuthNotice,
  syncAuthError,
  bootstrapSummary,
  mergePreview,
  bootstrapBusy,
  diagnosticsSummary,
  foods,
  recipes,
  recoveryIssues,
  initializationError,
  getFoodReferenceCount,
  onUpdateSettings,
  onCreateFood,
  onUpdateFood,
  onArchiveFood,
  onRestoreFood,
  onPurgeFood,
  onRenameRecipe,
  onArchiveRecipe,
  onRestoreRecipe,
  onDeleteRecipe,
  onFindDuplicateFood,
  onSendMagicLink,
  onSignOut,
  onSyncNow,
  onPreviewMerge,
  onApplyBootstrap,
  onClearSyncDeadLetters,
  onExportDiagnostics,
  onReportGlobalError,
  onFoodEditorStateChange,
}: SettingsScreenProps) {
  const { applyImport, exportBackup, validateBackup } = useImportExport()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(buildSettingsFormState(settings))
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [foodError, setFoodError] = useState<string | null>(null)
  const [foodQuery, setFoodQuery] = useState('')
  const [foodEditor, setFoodEditor] = useState<FoodEditorState | null>(null)
  const [foodEditorDirty, setFoodEditorDirty] = useState(false)
  const [confirmingPurgeFoodId, setConfirmingPurgeFoodId] = useState<string | null>(null)
  const [recipeQuery, setRecipeQuery] = useState('')
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [recipeNameDraft, setRecipeNameDraft] = useState('')
  const [recipeError, setRecipeError] = useState<string | null>(null)
  const [confirmingDeleteRecipeId, setConfirmingDeleteRecipeId] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>('replace')
  const [importPreview, setImportPreview] = useState<BackupPreview | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null)
  const [syncEmail, setSyncEmail] = useState('')

  useEffect(() => {
    setSettingsForm(buildSettingsFormState(settings))
  }, [settings])

  useEffect(() => {
    if (!foodEditor) {
      onFoodEditorStateChange(null)
      return
    }

    onFoodEditorStateChange({
      open: true,
      dirty: foodEditorDirty,
      requestClose: () => {
        setFoodEditor(null)
        setFoodEditorDirty(false)
      },
    })
  }, [foodEditor, foodEditorDirty, onFoodEditorStateChange])

  const visibleFoods = useMemo(
    () =>
      foods.filter((food) =>
        `${food.name} ${food.brand ?? ''}`.toLowerCase().includes(foodQuery.trim().toLowerCase()),
      ),
    [foodQuery, foods],
  )
  const visibleRecipes = useMemo(
    () =>
      recipes.filter((recipe) =>
        recipe.name.toLowerCase().includes(recipeQuery.trim().toLowerCase()),
      ),
    [recipeQuery, recipes],
  )

  const bootstrapDefaultResolution: BootstrapResolution | null = useMemo(() => {
    if (!bootstrapSummary || bootstrapSummary.bootstrapCompleted) {
      return null
    }

    if (bootstrapSummary.cloudEmpty && !bootstrapSummary.localEmpty) {
      return 'replaceCloudWithThisDevice'
    }

    if (!bootstrapSummary.cloudEmpty && bootstrapSummary.localEmpty) {
      return 'useCloudOnThisDevice'
    }

    if (!bootstrapSummary.cloudEmpty && !bootstrapSummary.localEmpty) {
      return 'mergeThisDeviceIntoCloud'
    }

    return null
  }, [bootstrapSummary])

  function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    try {
      const updateResult = onUpdateSettings({
        ...settings,
        calorieTarget: parseTarget('Calorie target', settingsForm.calorieTarget),
        proteinTarget: parseTarget('Protein target', settingsForm.proteinTarget),
        carbTarget: parseTarget('Carb target', settingsForm.carbTarget),
        fatTarget: parseTarget('Fat target', settingsForm.fatTarget),
        weightUnit: settingsForm.weightUnit,
        goalMode: settingsForm.goalMode,
        coachingEnabled: settingsForm.coachingEnabled,
        checkInWeekday: settingsForm.checkInWeekday,
        targetWeeklyRatePercent: parseTarget(
          'Target weekly rate (%)',
          settingsForm.targetWeeklyRatePercent,
        ),
        dailyStepTarget: parseOptionalTarget('Daily step target', settingsForm.dailyStepTarget),
        weeklyCardioMinuteTarget: parseOptionalTarget(
          'Weekly cardio target',
          settingsForm.weeklyCardioMinuteTarget,
        ),
      })

      if (!updateResult.ok) {
        setSettingsError(updateResult.error.message)
        return
      }

      setSettingsError(null)
      onReportGlobalError(null)
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Review the settings values.')
    }
  }

  async function handleExport(): Promise<void> {
    const exportResult = exportBackup()
    if (!exportResult.ok) {
      setImportError(exportResult.error.message)
      onReportGlobalError(exportResult.error)
      return
    }

    const blob = new Blob([JSON.stringify(exportResult.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = buildBackupFilename()
    link.click()
    URL.revokeObjectURL(url)

    const exportedAt = new Date().toISOString()
    setLastExportedAt(exportedAt)
    setImportError(null)
    setImportSuccess(`Backup exported at ${formatLocalDateTime(exportedAt)}.`)
    onReportGlobalError(null)
  }

  function handleExportDiagnostics(): void {
    try {
      const diagnosticsJson = onExportDiagnostics()
      const blob = new Blob([diagnosticsJson], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = buildDiagnosticsFilename()
      link.click()
      URL.revokeObjectURL(url)

      const exportedAt = new Date().toISOString()
      setImportError(null)
      setImportSuccess(`Diagnostics exported at ${formatLocalDateTime(exportedAt)}.`)
      onReportGlobalError(null)
    } catch (error) {
      onReportGlobalError(
        error instanceof Error ? error.message : 'Unable to export diagnostics right now.',
      )
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    const validationResult = validateBackup(await file.text())
    if (!validationResult.ok) {
      setImportPreview(null)
      setImportError(validationResult.error.message)
      setImportSuccess(null)
      onReportGlobalError(validationResult.error)
      return
    }

    setImportPreview(validationResult.data)
    setImportError(null)
    setImportSuccess(null)
    onReportGlobalError(null)
  }

  function handleApplyImport(): void {
    if (!importPreview) {
      return
    }

    const importResult = applyImport(importPreview.backup, importMode)
    if (!importResult.ok) {
      setImportError(importResult.error.message)
      setImportSuccess(null)
      onReportGlobalError(importResult.error)
      return
    }

    setImportSuccess(
      `${importMode === 'replace' ? 'Replaced' : 'Merged'} ${importResult.data.foods} foods, ${importResult.data.weights} weights, and ${importResult.data.logEntries} log entries.`,
    )
    setImportError(null)
    setImportPreview(null)
    if (importInputRef.current) {
      importInputRef.current.value = ''
    }
    onReportGlobalError(null)
  }

  return (
    <div className="space-y-4 pb-6">
      {(initializationError || recoveryIssues.length) ? (
        <section className="app-card space-y-3 border-amber-200 bg-amber-50/90 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
              Data health
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              Review recoverable data issues
            </p>
          </div>
          {initializationError ? (
            <div className="rounded-2xl border border-amber-300 bg-white/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-slate-900/50 dark:text-amber-100">
              {initializationError.message}
            </div>
          ) : null}
          {recoveryIssues.length ? (
            <div className="space-y-2">
              {recoveryIssues.slice(0, 6).map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-[22px] border border-amber-200 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-amber-500/30 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">{issue.scope}</p>
                  <p>{issue.message}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="app-card space-y-4 px-4 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Cross-device sync
          </p>
          <p className="font-display text-2xl text-slate-900 dark:text-white">
            Continue on phone and desktop
          </p>
        </div>

        {!syncConfigured ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Supabase sync is not configured in this environment. Add <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>, <code>SUPABASE_URL</code>, and <code>SUPABASE_SERVICE_ROLE_KEY</code> before enabling cross-device sync.
          </div>
        ) : null}

        {syncConfigured && !syncSessionEmail ? (
          <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Send a magic link to sign in. Local tracking still works without an account.
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                className="field"
                type="email"
                placeholder="you@example.com"
                value={syncEmail}
                onChange={(event) => setSyncEmail(event.target.value)}
              />
              <button
                type="button"
                className="action-button"
                onClick={() => void onSendMagicLink(syncEmail)}
                disabled={!syncEmail.trim()}
              >
                Send magic link
              </button>
            </div>
          </div>
        ) : null}

        {syncSessionEmail ? (
          <div className="space-y-4 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{syncSessionEmail}</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Status: {syncState.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="action-button-secondary" onClick={onSyncNow}>
                  Sync now
                </button>
                <button type="button" className="action-button-secondary" onClick={onSignOut}>
                  Sign out
                </button>
              </div>
            </div>

            <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
              <p>Pending changes: {syncState.pendingMutationCount}</p>
              <p>Dead letters: {syncState.deadLetterCount}</p>
              <p>Last synced: {syncState.lastSyncedAt ? formatLocalDateTime(syncState.lastSyncedAt) : 'Not yet'}</p>
              <p>Device ID: {syncState.deviceId}</p>
            </div>

            {syncState.blockingMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                {syncState.blockingMessage}
              </div>
            ) : null}

            {syncState.deadLetterCount > 0 ? (
              <button type="button" className="action-button-secondary w-full" onClick={onClearSyncDeadLetters}>
                Clear dead-letter mutations
              </button>
            ) : null}
          </div>
        ) : null}

        {syncAuthNotice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
            {syncAuthNotice}
          </div>
        ) : null}

        {syncAuthError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {syncAuthError}
          </div>
        ) : null}

        {bootstrapSummary && !bootstrapSummary.bootstrapCompleted ? (
          <div className="space-y-4 rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Bootstrap required</p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Local device data and cloud data need a one-time resolution before sync can start.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-amber-900 dark:text-amber-100 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 dark:border-amber-500/30 dark:bg-slate-900/40">
                <p className="font-semibold">This device</p>
                <p>{bootstrapSummary.localCounts.foods} foods</p>
                <p>{bootstrapSummary.localCounts.logEntries} log entries</p>
                <p>{bootstrapSummary.localCounts.weights} weights</p>
                <p>{bootstrapSummary.localCounts.savedMeals} saved meals</p>
                <p>{bootstrapSummary.localCounts.recipes} recipes</p>
                <p>{bootstrapSummary.localCounts.favoriteFoods} favorite foods</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 dark:border-amber-500/30 dark:bg-slate-900/40">
                <p className="font-semibold">Cloud</p>
                <p>{bootstrapSummary.cloudCounts.foods} foods</p>
                <p>{bootstrapSummary.cloudCounts.logEntries} log entries</p>
                <p>{bootstrapSummary.cloudCounts.weights} weights</p>
                <p>{bootstrapSummary.cloudCounts.savedMeals} saved meals</p>
                <p>{bootstrapSummary.cloudCounts.recipes} recipes</p>
                <p>{bootstrapSummary.cloudCounts.favoriteFoods} favorite foods</p>
              </div>
            </div>

            {mergePreview ? (
              <div className="rounded-2xl border border-teal-200 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-teal-500/30 dark:bg-slate-900/50 dark:text-slate-200">
                Merge preview: {mergePreview.foods} foods, {mergePreview.logEntries} log entries, {mergePreview.weights} weights, {mergePreview.savedMeals} saved meals, {mergePreview.recipes} recipes, {mergePreview.favoriteFoods} favorite foods.
              </div>
            ) : null}

            <div className="grid gap-3">
              <button
                type="button"
                className="action-button"
                onClick={() => bootstrapDefaultResolution && onApplyBootstrap(bootstrapDefaultResolution)}
                disabled={!bootstrapDefaultResolution || bootstrapBusy}
              >
                {bootstrapBusy ? 'Working...' : `Apply default: ${bootstrapDefaultResolution ?? 'unavailable'}`}
              </button>
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => onApplyBootstrap('useCloudOnThisDevice')}
                disabled={bootstrapBusy}
              >
                Use cloud on this device
              </button>
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => void onPreviewMerge()}
                disabled={bootstrapBusy}
              >
                Preview merge
              </button>
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => onApplyBootstrap('mergeThisDeviceIntoCloud')}
                disabled={bootstrapBusy}
              >
                Merge this device into cloud
              </button>
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => onApplyBootstrap('replaceCloudWithThisDevice')}
                disabled={bootstrapBusy}
              >
                Replace cloud with this device
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Diagnostics</p>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Local app health signals
              </p>
            </div>
            <button type="button" className="action-button-secondary" onClick={handleExportDiagnostics}>
              Export diagnostics JSON
            </button>
          </div>

          <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            <p>Total events: {diagnosticsSummary.totalCount}</p>
            <p>
              Last event:{' '}
              {diagnosticsSummary.lastEventAt
                ? formatLocalDateTime(diagnosticsSummary.lastEventAt)
                : 'None'}
            </p>
            <p>
              Sync failures: {diagnosticsSummary.counts.sync_push_failed ?? 0}
            </p>
            <p>
              Dead letters recorded: {diagnosticsSummary.counts.sync_dead_letter_created ?? 0}
            </p>
          </div>

          {diagnosticsSummary.lastError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              Last error: {diagnosticsSummary.lastError.message}
            </div>
          ) : null}
        </div>
      </section>

      <section className="app-card px-4 py-4">
        <form className="space-y-4" onSubmit={handleSettingsSubmit}>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Daily targets
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">Set your macro goals</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Calories
              <input
                className="field mt-2"
                inputMode="decimal"
                value={settingsForm.calorieTarget}
                onChange={(event) =>
                  setSettingsForm((currentState) => ({
                    ...currentState,
                    calorieTarget: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Protein (g)
              <input
                className="field mt-2"
                inputMode="decimal"
                value={settingsForm.proteinTarget}
                onChange={(event) =>
                  setSettingsForm((currentState) => ({
                    ...currentState,
                    proteinTarget: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Carbs (g)
              <input
                className="field mt-2"
                inputMode="decimal"
                value={settingsForm.carbTarget}
                onChange={(event) =>
                  setSettingsForm((currentState) => ({
                    ...currentState,
                    carbTarget: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Fat (g)
              <input
                className="field mt-2"
                inputMode="decimal"
                value={settingsForm.fatTarget}
                onChange={(event) =>
                  setSettingsForm((currentState) => ({
                    ...currentState,
                    fatTarget: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Weight unit</p>
            <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['lb', 'kg'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    settingsForm.weightUnit === unit
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() =>
                    setSettingsForm((currentState) => ({
                      ...currentState,
                      weightUnit: unit,
                    }))
                  }
                >
                  {unit.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Goal mode</p>
            <div className="grid grid-cols-3 gap-2">
              {(['lose', 'maintain', 'gain'] as const).map((goalMode) => (
                <button
                  key={goalMode}
                  type="button"
                  className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                    settingsForm.goalMode === goalMode
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                  onClick={() =>
                    setSettingsForm((currentState) => ({
                      ...currentState,
                      goalMode,
                    }))
                  }
                >
                  {goalMode}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
            <span>Enable coaching guidance</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-teal-700"
              checked={settingsForm.coachingEnabled}
              onChange={(event) =>
                setSettingsForm((currentState) => ({
                  ...currentState,
                  coachingEnabled: event.target.checked,
                }))
              }
            />
          </label>

          <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                Prep settings
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Weekly check-ins use the completed week, weigh-ins, and activity adherence before suggesting calorie changes.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Check-in day</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {[
                  { value: 1 as const, label: 'Mon' },
                  { value: 2 as const, label: 'Tue' },
                  { value: 3 as const, label: 'Wed' },
                  { value: 4 as const, label: 'Thu' },
                  { value: 5 as const, label: 'Fri' },
                  { value: 6 as const, label: 'Sat' },
                  { value: 0 as const, label: 'Sun' },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      settingsForm.checkInWeekday === option.value
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() =>
                      setSettingsForm((currentState) => ({
                        ...currentState,
                        checkInWeekday: option.value,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Target weekly rate (%)
                <input
                  className="field mt-2"
                  inputMode="decimal"
                  value={settingsForm.targetWeeklyRatePercent}
                  onChange={(event) =>
                    setSettingsForm((currentState) => ({
                      ...currentState,
                      targetWeeklyRatePercent: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Daily step target
                <input
                  className="field mt-2"
                  inputMode="numeric"
                  placeholder="Optional"
                  value={settingsForm.dailyStepTarget}
                  onChange={(event) =>
                    setSettingsForm((currentState) => ({
                      ...currentState,
                      dailyStepTarget: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Weekly cardio minutes
                <input
                  className="field mt-2"
                  inputMode="numeric"
                  placeholder="Optional"
                  value={settingsForm.weeklyCardioMinuteTarget}
                  onChange={(event) =>
                    setSettingsForm((currentState) => ({
                      ...currentState,
                      weeklyCardioMinuteTarget: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </div>

          {settingsError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {settingsError}
            </div>
          ) : null}

          <button type="submit" className="action-button w-full">
            Save targets
          </button>
        </form>
      </section>

      <section className="app-card space-y-4 px-4 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Backup and restore
          </p>
          <p className="font-display text-2xl text-slate-900 dark:text-white">
            Protect your data
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className="action-button gap-2" onClick={() => void handleExport()}>
            <Download className="h-4 w-4" />
            Export backup
          </button>
          <button type="button" className="action-button-secondary gap-2" onClick={() => importInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Select backup file
          </button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) {
              return
            }

            void handleImportFile(file)
          }}
        />

        {lastExportedAt ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Last export: {formatLocalDateTime(lastExportedAt)}
          </p>
        ) : null}

        {importPreview ? (
          <div className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Backup preview</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {importPreview.counts.foods} foods • {importPreview.counts.weights} weights • {importPreview.counts.logDays} logged days • {importPreview.counts.logEntries} entries
              </p>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Exported {formatLocalDateTime(importPreview.backup.exportedAt)}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Import mode</p>
              <div className="grid grid-cols-2 gap-2">
                {(['replace', 'merge'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      importMode === mode
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() => setImportMode(mode)}
                  >
                    {mode === 'replace' ? 'Replace device data' : 'Merge into device data'}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {importMode === 'replace'
                ? 'Replace mode overwrites all current foods, weights, settings, and logs after writing a rollback backup first.'
                : 'Merge mode keeps current settings and merges foods, weights, and logs using conflict resolution rules.'}
            </div>

            <button type="button" className="action-button w-full" onClick={handleApplyImport}>
              Apply import
            </button>
          </div>
        ) : null}

        {importError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {importError}
          </div>
        ) : null}

        {importSuccess ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
            {importSuccess}
          </div>
        ) : null}
      </section>

      {FEATURE_FLAGS.recipes ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Recipes
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              {recipes.filter((recipe) => !recipe.deletedAt && !recipe.archivedAt).length} active recipes
            </p>
          </div>

          <input
            className="field"
            placeholder="Search recipes"
            value={recipeQuery}
            onChange={(event) => setRecipeQuery(event.target.value)}
          />

          {recipeError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {recipeError}
            </div>
          ) : null}

          <div className="space-y-3">
            {visibleRecipes.length ? (
              visibleRecipes.map((recipe) => {
                const isEditing = editingRecipeId === recipe.id
                const isConfirmingDelete = confirmingDeleteRecipeId === recipe.id
                const isArchived = Boolean(recipe.archivedAt)

                return (
                  <div
                    key={recipe.id}
                    className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
                  >
                    <TemplateSummaryCard
                      name={recipe.name}
                      entries={recipe.ingredients}
                      usageCount={recipe.usageCount}
                      updatedAt={recipe.updatedAt}
                      className="border-0 bg-transparent px-0 py-0 shadow-none"
                    />

                    {isArchived ? (
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                        Archived
                      </p>
                    ) : null}

                    {isEditing ? (
                      <div className="mt-3 space-y-3 rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-950/60">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                          Recipe name
                          <input
                            className="field mt-2"
                            value={recipeNameDraft}
                            onChange={(event) => setRecipeNameDraft(event.target.value)}
                          />
                        </label>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            className="action-button flex-1"
                            onClick={() => {
                              const result = onRenameRecipe(recipe.id, recipeNameDraft)
                              if (!result.ok) {
                                setRecipeError(result.error.message)
                                return
                              }

                              setRecipeError(null)
                              setEditingRecipeId(null)
                              setRecipeNameDraft('')
                            }}
                          >
                            Save name
                          </button>
                          <button
                            type="button"
                            className="action-button-secondary flex-1"
                            onClick={() => {
                              setEditingRecipeId(null)
                              setRecipeNameDraft('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {isConfirmingDelete ? (
                      <div className="mt-3 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                        <p className="font-semibold">Delete {recipe.name} permanently?</p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            className="action-button-secondary flex-1"
                            onClick={() => setConfirmingDeleteRecipeId(null)}
                          >
                            Keep recipe
                          </button>
                          <button
                            type="button"
                            className="action-button flex-1"
                            onClick={() => {
                              const result = onDeleteRecipe(recipe.id)
                              if (!result.ok) {
                                setRecipeError(result.error.message)
                                return
                              }

                              setRecipeError(null)
                              setConfirmingDeleteRecipeId(null)
                            }}
                          >
                            Delete permanently
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <button
                        type="button"
                        className="action-button-secondary"
                        onClick={() => {
                          setEditingRecipeId(recipe.id)
                          setRecipeNameDraft(recipe.name)
                          setConfirmingDeleteRecipeId(null)
                          setRecipeError(null)
                        }}
                      >
                        Rename
                      </button>
                      {isArchived ? (
                        <button
                          type="button"
                          className="action-button-secondary"
                          onClick={() => {
                            const result = onRestoreRecipe(recipe.id)
                            if (!result.ok) {
                              setRecipeError(result.error.message)
                              return
                            }

                            setRecipeError(null)
                          }}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="action-button-secondary"
                          onClick={() => {
                            const result = onArchiveRecipe(recipe.id)
                            if (!result.ok) {
                              setRecipeError(result.error.message)
                              return
                            }

                            setRecipeError(null)
                          }}
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        className="action-button-secondary text-rose-700 dark:text-rose-300"
                        onClick={() => {
                          setConfirmingDeleteRecipeId(recipe.id)
                          setEditingRecipeId(null)
                          setRecipeError(null)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-6 text-sm text-slate-600 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-slate-300">
                Save a logged meal as a recipe from the Log tab to manage it here.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="app-card space-y-4 px-4 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Food database
          </p>
          <p className="font-display text-2xl text-slate-900 dark:text-white">
            {foods.length} saved foods
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="field"
            placeholder="Search foods"
            value={foodQuery}
            onChange={(event) => setFoodQuery(event.target.value)}
          />
          <button type="button" className="action-button gap-2" onClick={() => setFoodEditor({ mode: 'create' })}>
            <Plus className="h-4 w-4" />
            New food
          </button>
        </div>

        {foodError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {foodError}
          </div>
        ) : null}

        <div className="space-y-3">
          {visibleFoods.map((food) => {
            const isEditable = isFoodEditable(food)
            const referenceCount = getFoodReferenceCount(food.id)
            const isConfirmingPurge = confirmingPurgeFoodId === food.id

            return (
              <div
                key={food.id}
                className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{food.name}</p>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {food.source}
                      </span>
                      {food.archivedAt ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                          archived
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      {food.brand ? `${food.brand} • ` : ''}
                      {food.servingSize}
                      {food.servingUnit}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {Math.round(food.calories)} cal • {Math.round(food.protein)}P • {Math.round(food.carbs)}C • {Math.round(food.fat)}F
                    </p>
                    {referenceCount ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Referenced by {referenceCount} log entr{referenceCount === 1 ? 'y' : 'ies'}
                      </p>
                    ) : null}
                  </div>

                  {isEditable ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => {
                          setFoodError(null)
                          setFoodEditor({ mode: 'edit', food })
                        }}
                        aria-label={`Edit ${food.name}`}
                      >
                        <PencilLine className="h-4 w-4" />
                      </button>
                      {food.archivedAt ? (
                        <>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => {
                              const result = onRestoreFood(food.id)
                              setFoodError(result.ok ? null : result.error.message)
                            }}
                            aria-label={`Restore ${food.name}`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="icon-button text-rose-600 dark:text-rose-300"
                            onClick={() => setConfirmingPurgeFoodId(isConfirmingPurge ? null : food.id)}
                            disabled={referenceCount > 0}
                            aria-label={`Delete ${food.name} permanently`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => {
                            const result = onArchiveFood(food.id)
                            setFoodError(result.ok ? null : result.error.message)
                          }}
                          aria-label={`Archive ${food.name}`}
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      <Lock className="h-4 w-4" />
                    </div>
                  )}
                </div>

                {food.archivedAt && isConfirmingPurge ? (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-semibold">Permanently delete this food?</p>
                        <p className="mt-1">
                          This cannot be undone. Purge is only allowed when no log entries reference the food.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        className="action-button-secondary flex-1"
                        onClick={() => setConfirmingPurgeFoodId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="action-button flex-1"
                        onClick={() => {
                          const result = onPurgeFood(food.id)
                          setFoodError(result.ok ? null : result.error.message)
                          if (result.ok) {
                            setConfirmingPurgeFoodId(null)
                          }
                        }}
                      >
                        Confirm purge
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <BottomSheet
        open={foodEditor !== null}
        title={foodEditor?.mode === 'edit' ? 'Edit Food' : 'Create Food'}
        description="Manage your local food database."
        onClose={() => {
          setFoodEditor(null)
          setFoodEditorDirty(false)
        }}
        isDirty={foodEditorDirty}
        discardMessage="Your food form has unsaved changes. Discard them and close this sheet?"
      >
        {foodEditor ? (
          <FoodForm
            title={foodEditor.mode === 'edit' ? 'Update food' : 'Create custom food'}
            submitLabel={foodEditor.mode === 'edit' ? 'Save changes' : 'Save food'}
            source={foodEditor.food?.source ?? 'custom'}
            initialValues={foodEditor.food}
            onDirtyChange={setFoodEditorDirty}
            onSubmit={(draft) => {
              const duplicateFood = onFindDuplicateFood(
                draft,
                foodEditor.mode === 'edit' && foodEditor.food ? foodEditor.food.id : undefined,
              )
              if (duplicateFood) {
                const duplicateResult = {
                  ok: false as const,
                  error: {
                    code: 'duplicateFood',
                    message: `${duplicateFood.name} already exists in your saved foods. Edit that food instead of creating a duplicate.`,
                  },
                }
                setFoodError(duplicateResult.error.message)
                return duplicateResult
              }

              const result =
                foodEditor.mode === 'edit' && foodEditor.food
                  ? onUpdateFood(foodEditor.food.id, draft)
                  : onCreateFood(draft)

              if (result.ok) {
                setFoodError(null)
                setFoodEditor(null)
                setFoodEditorDirty(false)
                onReportGlobalError(null)
              }

              return result
            }}
            onCancel={() => {
              setFoodEditor(null)
              setFoodEditorDirty(false)
            }}
          />
        ) : null}
      </BottomSheet>
    </div>
  )
}

export { SettingsScreen }
