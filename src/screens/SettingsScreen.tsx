import {
  Activity,
  Archive,
  Camera,
  Database,
  Download,
  LayoutDashboard,
  Lock,
  PencilLine,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { FoodForm } from '../components/FoodForm'
import { NotesEditorSheet } from '../components/NotesEditorSheet'
import { ScreenHeader } from '../components/ScreenHeader'
import { TemplateSummaryCard } from '../components/TemplateSummaryCard'
import { NUTRIENT_DEFINITION_LIST_V1 } from '../domain/nutrition'
import { useHistoryImport } from '../hooks/useHistoryImport'
import type { BootstrapResolutionView } from '../hooks/useSync'
import { isFoodEditable } from '../hooks/useFoods'
import { useImportExport } from '../hooks/useImportExport'
import { useSafetySnapshots } from '../hooks/useSafetySnapshots'
import type {
  ActionResult,
  AppActionError,
  BackupFile,
  BackupPreview,
  BootstrapResolution,
  BootstrapStatusSummary,
  CanonicalNutrientKey,
  CutDayType,
  DietPhase,
  DietPhaseEvent,
  DiagnosticsSummary,
  Food,
  FoodDraft,
  FoodReviewItem,
  HistoryImportPreview,
  HistoryImportProvider,
  ImportMode,
  LoggingShortcutId,
  LoggingToolbarStyle,
  MealTemplate,
  PhaseReviewIntent,
  Recipe,
  RecoverableDataIssue,
  RecoveryCheckIn,
  SettingsHubSectionId,
  SettingsFocusRequest,
  SyncCounts,
  SyncState,
  ToolbarColorToken,
  ToolbarShortcutConfig,
  UserSettings,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { formatShortDate, getTodayDateKey } from '../utils/dates'
import { recordDiagnosticsEvent } from '../utils/diagnostics'

interface SettingsScreenProps {
  settings: UserSettings
  syncConfigured: boolean
  syncState: SyncState
  syncSessionEmail: string | null
  syncAuthNotice: string | null
  syncAuthError: string | null
  bootstrapSummary: BootstrapStatusSummary | null
  bootstrapResolutionView: BootstrapResolutionView | null
  mergePreview: SyncCounts | null
  bootstrapBusy: boolean
  diagnosticsSummary: DiagnosticsSummary
  foods: Food[]
  recipes: Recipe[]
  savedMeals?: MealTemplate[]
  foodReviewQueue?: FoodReviewItem[]
  recoveryIssues: RecoverableDataIssue[]
  previewPsmfGarminUiState?: PreviewPsmfGarminUiState | null
  activePsmfPhase?: DietPhase | null
  activeDietBreakPhase?: DietPhase | null
  activeCarbCyclePhase?: DietPhase | null
  activeCarbCycleHighCarbDays?: DietPhaseEvent[]
  expiredPsmfPhase?: DietPhase | null
  plannedPhases?: DietPhase[]
  historicalPhases?: DietPhase[]
  selectablePsmfPhases?: DietPhase[]
  selectedPsmfPhaseId?: string | null
  selectedPsmfPhase?: DietPhase | null
  selectedPsmfPhaseRefeeds?: DietPhaseEvent[]
  recoveryCheckInToday?: RecoveryCheckIn | null
  garminBusy?: boolean
  initializationError: AppActionError | null
  settingsFocusRequest?: SettingsFocusRequest | null
  getFoodReferenceCount: (foodId: string) => number
  onUpdateSettings: (settings: UserSettings) => ActionResult<void>
  onConsumeSettingsFocusRequest?: (id: string) => void
  phaseReviewIntent?: PhaseReviewIntent | null
  onClearPhaseReviewIntent?: () => void
  onStartPsmfPhase?: (startDate: string, plannedEndDate: string, notes?: string) => ActionResult<DietPhase>
  onUpdatePlannedPhase?: (
    phaseId: string,
    patch: Pick<DietPhase, 'startDate' | 'plannedEndDate' | 'calorieTargetOverride' | 'notes'>,
  ) => ActionResult<DietPhase>
  onExtendDietPhase?: (phaseId: string, plannedEndDate: string) => ActionResult<DietPhase>
  onCompleteDietPhase?: (phaseId: string, actualEndDate: string) => ActionResult<DietPhase>
  onStartDietBreak?: (
    startDate: string,
    plannedEndDate: string,
    calorieTargetOverride: number,
    notes?: string,
  ) => ActionResult<DietPhase>
  onStartCarbCycle?: (startDate: string, plannedEndDate: string, notes?: string) => ActionResult<DietPhase>
  onScheduleRefeed?: (
    phaseId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ) => ActionResult<DietPhaseEvent>
  onUpdateRefeed?: (
    eventId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ) => ActionResult<DietPhaseEvent>
  onScheduleHighCarbDay?: (
    phaseId: string,
    date: string,
    calorieTargetOverride: number,
    notes?: string,
  ) => ActionResult<DietPhaseEvent>
  onDeleteRefeed?: (eventId: string) => ActionResult<void>
  onDeleteHighCarbDay?: (eventId: string) => ActionResult<void>
  onCancelPhase?: (phaseId: string) => ActionResult<DietPhase>
  onUpdatePhaseNotes?: (phaseId: string, notes?: string) => ActionResult<DietPhase>
  onSelectPsmfPhase?: (phaseId: string | null) => void
  hasLoggedEntriesOnDate?: (date: string) => boolean
  onExitPsmf?: () => ActionResult<void>
  onSaveRecoveryCheckIn?: (
    date: string,
    checkIn: Pick<
      RecoveryCheckIn,
      'energyScore' | 'hungerScore' | 'sorenessScore' | 'sleepQualityScore' | 'notes'
    >,
  ) => ActionResult<RecoveryCheckIn>
  onDeleteRecoveryCheckIn?: (date: string) => ActionResult<void>
  onConnectGarmin?: () => void
  onSyncGarmin?: () => void
  onDisconnectGarmin?: () => void
  onOpenLogDate?: (date: string) => void
  onCreateFood: (draft: FoodDraft) => ActionResult<Food>
  onUpdateFood: (foodId: string, draft: FoodDraft) => ActionResult<void>
  onArchiveFood: (foodId: string) => ActionResult<void>
  onRestoreFood: (foodId: string) => ActionResult<void>
  onPurgeFood: (foodId: string) => ActionResult<void>
  onRenameRecipe: (recipeId: string, name: string) => ActionResult<Recipe>
  onArchiveRecipe: (recipeId: string) => ActionResult<Recipe>
  onRestoreRecipe: (recipeId: string) => ActionResult<Recipe>
  onDeleteRecipe: (recipeId: string) => ActionResult<void>
  onDismissFoodReviewItem?: (reviewItemId: string) => void
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
  fatLossMode: NonNullable<UserSettings['fatLossMode']>
  coachingEnabled: boolean
  checkInWeekday: UserSettings['checkInWeekday']
  targetWeeklyRatePercent: string
  dailyStepTarget: string
  weeklyCardioMinuteTarget: string
  coachingMinCalories: string
}

interface FoodEditorState {
  mode: 'create' | 'edit'
  food?: Food
}

type PhaseEditorMode =
  | 'start_psmf'
  | 'edit_planned_phase'
  | 'extend_phase'
  | 'start_diet_break'
  | 'schedule_refeed'
  | 'edit_refeed'
  | null

interface DietPhaseFormState {
  startDate: string
  plannedEndDate: string
  calorieTargetOverride: string
  notes: string
  refeedDate: string
  refeedCalories: string
  refeedNotes: string
}

interface RecoveryFormState {
  energyScore: 1 | 2 | 3 | 4 | 5
  hungerScore: 1 | 2 | 3 | 4 | 5
  sorenessScore: 1 | 2 | 3 | 4 | 5
  sleepQualityScore: 1 | 2 | 3 | 4 | 5
  notes: string
}

interface PreviewPsmfGarminUiState {
  dietPhase?: {
    kind: 'no_active_phase' | 'active_psmf' | 'expired_psmf' | 'diet_break_active'
    activeUntilLabel?: string
    expiredOnLabel?: string
  }
  recovery?: {
    severity: 'green' | 'yellow' | 'red'
  }
  garmin?: {
    kind:
      | 'not_enabled'
      | 'not_connected'
      | 'connected'
      | 'syncing'
      | 'rate_limited'
      | 'reconnect_required'
      | 'error'
    lastSyncedLabel?: string
    rateLimitedUntilLabel?: string
    stale?: boolean
  }
}

interface NotesEditorState {
  kind: 'phase' | 'refeed'
  title: 'Edit phase notes' | 'Edit refeed notes'
  targetId: string
  initialNotes?: string
  refeedDate?: string
  refeedCalories?: number
}

const LOGGING_SHORTCUT_OPTIONS: Array<{
  id: LoggingShortcutId
  label: string
  description: string
}> = [
  { id: 'scanner', label: 'Barcode scanner', description: 'Fastest path for known packaged foods.' },
  { id: 'ocr', label: 'Nutrition label OCR', description: 'Good when the barcode path is incomplete.' },
  { id: 'custom', label: 'Custom food', description: 'Fastest path for your own manual entries.' },
]

const TOOLBAR_STYLE_OPTIONS: Array<{
  id: LoggingToolbarStyle
  label: string
  description: string
}> = [
  { id: 'search_barcode', label: 'Search + barcode', description: 'Search stays primary and barcode stays one tap away.' },
  { id: 'search_barcode_custom', label: 'Search + barcode + custom', description: 'Keep custom food in the primary row.' },
  { id: 'four_custom', label: 'Four custom', description: 'Render the full customizable shortcut row.' },
  { id: 'none', label: 'None', description: 'Hide the top row but keep search and barcode available.' },
]

const TOOLBAR_COLOR_TOKENS: ToolbarColorToken[] = ['teal', 'slate', 'amber', 'rose']
const DEFAULT_SHORTCUT_COLORS: Record<LoggingShortcutId, ToolbarColorToken> = {
  scanner: 'teal',
  ocr: 'amber',
  custom: 'slate',
}

const PHASE_TEMPLATE_DAY_TYPES: Array<{
  dayType: CutDayType
  label: string
  description: string
}> = [
  { dayType: 'psmf_day', label: 'PSMF day', description: 'Lean repeat-food structure for aggressive cut days.' },
  { dayType: 'refeed_day', label: 'Refeed day', description: 'Higher-carb repeat meals for planned refeed days.' },
  { dayType: 'diet_break_day', label: 'Diet break day', description: 'Maintenance-style repeat meals while recovery is prioritized.' },
  { dayType: 'high_carb_day', label: 'High-carb day', description: 'Carb-cycle day templates for glycogen and training support.' },
]

const DEFAULT_PHASE_TEMPLATE_LABELS: Record<CutDayType, string> = {
  psmf_day: 'PSMF day',
  refeed_day: 'Refeed day',
  diet_break_day: 'Diet break day',
  high_carb_day: 'High-carb day',
  standard_cut_day: 'Standard cut day',
}

const SETTINGS_HUB_SECTIONS: Array<{
  id: SettingsHubSectionId
  label: string
  description: string
  icon: LucideIcon
  actionLabel: string
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Daily targets, check-in defaults, nutrients, and execution preferences.',
    icon: LayoutDashboard,
    actionLabel: 'Open dashboard settings',
  },
  {
    id: 'logging',
    label: 'Logging',
    description: 'Shortcut order, toolbar style, food review flow, and phase templates.',
    icon: PencilLine,
    actionLabel: 'Open logging settings',
  },
  {
    id: 'workouts',
    label: 'Workouts',
    description: 'Diet-phase timing, recovery inputs, and Garmin-linked training signals.',
    icon: Activity,
    actionLabel: 'Open workout inputs',
  },
  {
    id: 'body_progress',
    label: 'Body Progress',
    description: 'Compare defaults, gallery resets, and progress-proof preferences.',
    icon: Camera,
    actionLabel: 'Open body-progress settings',
  },
  {
    id: 'data_sync',
    label: 'Data & Sync',
    description: 'Cross-device sync, diagnostics, backups, and import/export controls.',
    icon: Database,
    actionLabel: 'Open data and sync settings',
  },
]

function normalizeLoggingShortcutIds(
  ids: readonly LoggingShortcutId[] | undefined,
): LoggingShortcutId[] {
  const seen = new Set<LoggingShortcutId>()
  const normalized: LoggingShortcutId[] = []

  for (const id of ids ?? []) {
    if (!LOGGING_SHORTCUT_OPTIONS.some((option) => option.id === id) || seen.has(id)) {
      continue
    }

    seen.add(id)
    normalized.push(id)
  }

  for (const option of LOGGING_SHORTCUT_OPTIONS) {
    if (!seen.has(option.id)) {
      normalized.push(option.id)
    }
  }

  return normalized
}

function normalizeToolbarShortcutConfigs(
  configs: readonly ToolbarShortcutConfig[] | undefined,
): ToolbarShortcutConfig[] {
  const configMap = new Map((configs ?? []).map((config) => [config.id, config]))
  return normalizeLoggingShortcutIds(configs?.map((config) => config.id)).map((id, order) => ({
    id,
    order,
    colorToken: configMap.get(id)?.colorToken ?? DEFAULT_SHORTCUT_COLORS[id],
    visible: configMap.get(id)?.visible ?? true,
  }))
}

function buildSettingsFormState(settings: UserSettings): SettingsFormState {
  return {
    calorieTarget: `${settings.calorieTarget}`,
    proteinTarget: `${settings.proteinTarget}`,
    carbTarget: `${settings.carbTarget}`,
    fatTarget: `${settings.fatTarget}`,
    weightUnit: settings.weightUnit,
    goalMode: settings.goalMode,
    fatLossMode: settings.fatLossMode ?? 'standard_cut',
    coachingEnabled: settings.coachingEnabled,
    checkInWeekday: settings.checkInWeekday,
    targetWeeklyRatePercent: `${settings.targetWeeklyRatePercent}`,
    dailyStepTarget:
      typeof settings.dailyStepTarget === 'number' ? `${settings.dailyStepTarget}` : '',
    weeklyCardioMinuteTarget:
      typeof settings.weeklyCardioMinuteTarget === 'number'
        ? `${settings.weeklyCardioMinuteTarget}`
        : '',
    coachingMinCalories:
      typeof settings.coachingMinCalories === 'number' ? `${settings.coachingMinCalories}` : '',
  }
}

function buildDietPhaseFormState(
  settings: UserSettings,
  recoveryCheckInToday: RecoveryCheckIn | null | undefined,
): DietPhaseFormState {
  const today = getTodayDateKey()
  const endDate = new Date(`${today}T00:00:00.000Z`)
  endDate.setUTCDate(endDate.getUTCDate() + 14)
  const refeedDate = new Date(`${today}T00:00:00.000Z`)
  refeedDate.setUTCDate(refeedDate.getUTCDate() + 3)

  return {
    startDate: today,
    plannedEndDate: endDate.toISOString().slice(0, 10),
    calorieTargetOverride: `${Math.max(settings.calorieTarget + 300, settings.calorieTarget)}`,
    notes: '',
    refeedDate: refeedDate.toISOString().slice(0, 10),
    refeedCalories: `${settings.calorieTarget + 200}`,
    refeedNotes: recoveryCheckInToday?.notes ?? '',
  }
}

function buildRecoveryFormState(
  recoveryCheckInToday: RecoveryCheckIn | null | undefined,
): RecoveryFormState {
  return {
    energyScore: recoveryCheckInToday?.energyScore ?? 3,
    hungerScore: recoveryCheckInToday?.hungerScore ?? 3,
    sorenessScore: recoveryCheckInToday?.sorenessScore ?? 3,
    sleepQualityScore: recoveryCheckInToday?.sleepQualityScore ?? 3,
    notes: recoveryCheckInToday?.notes ?? '',
  }
}

function getEffectiveEndDate(phase: DietPhase): string {
  return phase.actualEndDate ?? phase.plannedEndDate
}

function formatPhaseDateRange(phase: DietPhase): string {
  return `${formatShortDate(phase.startDate)} to ${formatShortDate(getEffectiveEndDate(phase))}`
}

function buildPsmfPhaseOptionLabel(phase: DietPhase): string {
  const prefix =
    phase.status === 'active'
      ? 'Active PSMF'
      : phase.status === 'planned'
        ? 'Planned PSMF'
        : phase.status === 'expired'
          ? 'Expired PSMF'
          : 'Completed PSMF'
  return `${prefix}: ${formatPhaseDateRange(phase)}`
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

function parsePositiveOptionalTarget(value: string, validationMessage: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(validationMessage)
  }

  return parsed
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

function formatHistoryImportProvider(provider: HistoryImportProvider): string {
  return provider === 'macrofactor' ? 'MacroFactor' : 'Renpho'
}

function formatHistoryImportFileKind(kind: HistoryImportPreview['fileKinds'][number]): string {
  switch (kind) {
    case 'macrofactor_food_rows':
      return 'MacroFactor food rows'
    case 'macrofactor_weights':
      return 'MacroFactor weights'
    case 'renpho_weights':
      return 'Renpho weights'
    default:
      return kind
  }
}

const LAST_MANUAL_EXPORT_AT_KEY = 'mt_last_manual_export_at'
const ADVANCED_NUTRIENT_KEYS: CanonicalNutrientKey[] = NUTRIENT_DEFINITION_LIST_V1.map(
  (entry) => entry.key,
)
const NUTRIENT_LABELS = new Map(
  NUTRIENT_DEFINITION_LIST_V1.map((entry) => [entry.key, entry.label] as const),
)

function formatNutrientLabel(key: CanonicalNutrientKey): string {
  return NUTRIENT_LABELS.get(key) ?? key
}

function readPersistedTimestamp(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(key)
  return rawValue?.trim() ? rawValue : null
}

function persistTimestamp(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, value)
}

function triggerDownload(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function shareOrDownloadJsonFile(fileName: string, content: string): Promise<'shared' | 'downloaded'> {
  const shareableFile = new File([content], fileName, { type: 'application/json' })
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [shareableFile] })

  if (canShareFiles) {
    await navigator.share({
      files: [shareableFile],
      title: 'MacroTracker backup',
      text: 'MacroTracker backup',
    })
    return 'shared'
  }

  triggerDownload(fileName, content, 'application/json')
  return 'downloaded'
}

function buildDiagnosticsFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `macrotracker-diagnostics-${timestamp}.json`
}

function areVisibleSyncCountsZero(counts: SyncCounts): boolean {
  return (
    counts.foods === 0 &&
    counts.logEntries === 0 &&
    counts.weights === 0 &&
    counts.savedMeals === 0 &&
    counts.recipes === 0 &&
    counts.favoriteFoods === 0
  )
}

function SettingsScreen({
  settings,
  syncConfigured,
  syncState,
  syncSessionEmail,
  syncAuthNotice,
  syncAuthError,
  bootstrapSummary,
  bootstrapResolutionView,
  mergePreview,
  bootstrapBusy,
  diagnosticsSummary,
  foods,
  recipes,
  savedMeals = [],
  foodReviewQueue = [],
  recoveryIssues,
  previewPsmfGarminUiState,
  activePsmfPhase,
  activeDietBreakPhase,
  activeCarbCyclePhase,
  activeCarbCycleHighCarbDays = [],
  expiredPsmfPhase,
  plannedPhases = [],
  historicalPhases = [],
  selectablePsmfPhases = [],
  selectedPsmfPhaseId,
  selectedPsmfPhase,
  selectedPsmfPhaseRefeeds = [],
  recoveryCheckInToday,
  garminBusy,
  initializationError,
  settingsFocusRequest = null,
  getFoodReferenceCount,
  onUpdateSettings,
  onConsumeSettingsFocusRequest,
  phaseReviewIntent = null,
  onClearPhaseReviewIntent,
  onStartPsmfPhase,
  onUpdatePlannedPhase,
  onExtendDietPhase,
  onCompleteDietPhase,
  onStartDietBreak,
  onStartCarbCycle,
  onScheduleRefeed,
  onScheduleHighCarbDay,
  onUpdateRefeed,
  onDeleteRefeed,
  onDeleteHighCarbDay,
  onCancelPhase,
  onUpdatePhaseNotes,
  onSelectPsmfPhase,
  hasLoggedEntriesOnDate,
  onExitPsmf,
  onSaveRecoveryCheckIn,
  onDeleteRecoveryCheckIn,
  onConnectGarmin,
  onSyncGarmin,
  onDisconnectGarmin,
  onOpenLogDate,
  onCreateFood,
  onUpdateFood,
  onArchiveFood,
  onRestoreFood,
  onPurgeFood,
  onRenameRecipe,
  onArchiveRecipe,
  onRestoreRecipe,
  onDeleteRecipe,
  onDismissFoodReviewItem,
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
  const { applyImport: applyHistoryImport, previewImport } = useHistoryImport()
  const { summary: safetySummary, captureSnapshot } = useSafetySnapshots()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const thirdPartyHistoryImportSectionRef = useRef<HTMLElement | null>(null)
  const macroFactorImportCardRef = useRef<HTMLDivElement | null>(null)
  const macroFactorImportButtonRef = useRef<HTMLButtonElement | null>(null)
  const macroFactorImportInputRef = useRef<HTMLInputElement | null>(null)
  const renphoImportCardRef = useRef<HTMLDivElement | null>(null)
  const renphoImportButtonRef = useRef<HTMLButtonElement | null>(null)
  const renphoImportInputRef = useRef<HTMLInputElement | null>(null)
  const pendingAutoOpenRequestIdRef = useRef<string | null>(null)
  const consumedFocusRequestIdRef = useRef<string | null>(null)
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
  const [historyImportPreview, setHistoryImportPreview] = useState<HistoryImportPreview | null>(null)
  const [historyImportError, setHistoryImportError] = useState<string | null>(null)
  const [historyImportSuccess, setHistoryImportSuccess] = useState<string | null>(null)
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(() =>
    readPersistedTimestamp(LAST_MANUAL_EXPORT_AT_KEY),
  )
  const [lastImportRollbackBackup, setLastImportRollbackBackup] = useState<BackupFile | null>(null)
  const [syncEmail, setSyncEmail] = useState('')
  const [phaseEditorMode, setPhaseEditorMode] = useState<PhaseEditorMode>(null)
  const [phaseEditorTargetId, setPhaseEditorTargetId] = useState<string | null>(null)
  const [refeedEditorTargetId, setRefeedEditorTargetId] = useState<string | null>(null)
  const [dietPhaseForm, setDietPhaseForm] = useState<DietPhaseFormState>(() =>
    buildDietPhaseFormState(settings, recoveryCheckInToday),
  )
  const [phaseActionError, setPhaseActionError] = useState<string | null>(null)
  const [notesEditorState, setNotesEditorState] = useState<NotesEditorState | null>(null)
  const [notesReturnFocusTo, setNotesReturnFocusTo] = useState<HTMLElement | null>(null)
  const [recoveryForm, setRecoveryForm] = useState<RecoveryFormState>(() =>
    buildRecoveryFormState(recoveryCheckInToday),
  )
  const [recoveryActionError, setRecoveryActionError] = useState<string | null>(null)
  const [showAdvancedLoggingShortcuts, setShowAdvancedLoggingShortcuts] = useState(false)
  const [activeHubSection, setActiveHubSection] = useState<SettingsHubSectionId>('dashboard')
  const settingsHubSectionRefs = useRef<Record<SettingsHubSectionId, HTMLDivElement | null>>({
    dashboard: null,
    logging: null,
    workouts: null,
    body_progress: null,
    data_sync: null,
  })
  const toolbarShortcutConfigs = useMemo(
    () => normalizeToolbarShortcutConfigs(settings.loggingShortcuts),
    [settings.loggingShortcuts],
  )

  useEffect(() => {
    setSettingsForm(buildSettingsFormState(settings))
  }, [settings])

  useEffect(() => {
    setDietPhaseForm(buildDietPhaseFormState(settings, recoveryCheckInToday))
  }, [recoveryCheckInToday, settings])

  useEffect(() => {
    setRecoveryForm(buildRecoveryFormState(recoveryCheckInToday))
  }, [recoveryCheckInToday])

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

  useEffect(() => {
    if (!settingsFocusRequest || consumedFocusRequestIdRef.current === settingsFocusRequest.id) {
      return
    }

    const focusTarget =
      settingsFocusRequest.target === 'macrofactor_history_import'
        ? {
            card: macroFactorImportCardRef.current,
            button: macroFactorImportButtonRef.current,
            input: macroFactorImportInputRef.current,
          }
        : settingsFocusRequest.target === 'renpho_history_import'
          ? {
              card: renphoImportCardRef.current,
              button: renphoImportButtonRef.current,
              input: renphoImportInputRef.current,
            }
          : {
              card: thirdPartyHistoryImportSectionRef.current,
              button: macroFactorImportButtonRef.current,
              input: macroFactorImportInputRef.current,
            }

    if (!focusTarget.card || !focusTarget.button) {
      recordDiagnosticsEvent({
        eventType: 'cut_os.import_focus_failed',
        severity: 'warning',
        scope: 'diagnostics',
        message: `Settings focus target ${settingsFocusRequest.target} was not mounted.`,
        payload: {
          requestId: settingsFocusRequest.id,
          source: settingsFocusRequest.source,
        },
      })
      onConsumeSettingsFocusRequest?.(settingsFocusRequest.id)
      return
    }

    const focusCard = focusTarget.card
    const focusButton = focusTarget.button
    const focusInput = focusTarget.input
    consumedFocusRequestIdRef.current = settingsFocusRequest.id
    pendingAutoOpenRequestIdRef.current = settingsFocusRequest.autoOpenFilePicker
      ? settingsFocusRequest.id
      : null
    focusCard.scrollIntoView({ behavior: 'smooth', block: 'center' })

    const timer = window.setTimeout(() => {
      focusButton.focus({ preventScroll: true })
      recordDiagnosticsEvent({
        eventType: 'cut_os.import_focus_consumed',
        severity: 'info',
        scope: 'diagnostics',
        message: `Settings focus request consumed for ${settingsFocusRequest.target}.`,
        payload: {
          requestId: settingsFocusRequest.id,
          source: settingsFocusRequest.source,
          autoOpenFilePicker: settingsFocusRequest.autoOpenFilePicker,
        },
      })

      if (
        settingsFocusRequest.autoOpenFilePicker &&
        pendingAutoOpenRequestIdRef.current === settingsFocusRequest.id
      ) {
        try {
          focusInput?.click()
          recordDiagnosticsEvent({
            eventType: 'cut_os.import_picker_opened',
            severity: 'info',
            scope: 'diagnostics',
            message: `Import file picker requested for ${settingsFocusRequest.target}.`,
            payload: {
              requestId: settingsFocusRequest.id,
              source: settingsFocusRequest.source,
            },
          })
          window.setTimeout(() => {
            focusButton.focus({ preventScroll: true })
          }, 0)
        } catch (error) {
          focusButton.focus({ preventScroll: true })
          recordDiagnosticsEvent({
            eventType: 'cut_os.import_picker_blocked',
            severity: 'warning',
            scope: 'diagnostics',
            message: 'Browser blocked automatic import file picker.',
            payload: {
              requestId: settingsFocusRequest.id,
              source: settingsFocusRequest.source,
              error: error instanceof Error ? error.message : String(error),
            },
          })
        } finally {
          pendingAutoOpenRequestIdRef.current = null
        }
      }

      onConsumeSettingsFocusRequest?.(settingsFocusRequest.id)
    }, 160)

    return () => {
      window.clearTimeout(timer)
    }
  }, [onConsumeSettingsFocusRequest, settingsFocusRequest])

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
  const pendingFoodReviewItems = useMemo(
    () => foodReviewQueue.filter((item) => item.status === 'pending'),
    [foodReviewQueue],
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
  const bootstrapPrimaryAction = useMemo(() => {
    if (!bootstrapResolutionView?.requiresResolution) {
      return null
    }

    if (bootstrapResolutionView.reason === 'post_sign_in_conflict') {
      if (bootstrapResolutionView.cloudEffectivelyEmpty === true) {
        return {
          label: 'Replace cloud with this device',
          disabled: bootstrapBusy,
          onClick: () => onApplyBootstrap('replaceCloudWithThisDevice'),
        }
      }

      return {
        label: 'Preview merge',
        disabled: bootstrapBusy,
        onClick: () => void onPreviewMerge(),
      }
    }

    return {
      label: `Apply default: ${bootstrapDefaultResolution ?? 'unavailable'}`,
      disabled: !bootstrapDefaultResolution || bootstrapBusy,
      onClick: () => bootstrapDefaultResolution && onApplyBootstrap(bootstrapDefaultResolution),
    }
  }, [
    bootstrapBusy,
    bootstrapDefaultResolution,
    bootstrapResolutionView,
    onApplyBootstrap,
    onPreviewMerge,
  ])
  const showLocalSettingsNote = Boolean(
    bootstrapSummary &&
      bootstrapResolutionView &&
      !bootstrapResolutionView.localEffectivelyEmpty &&
      areVisibleSyncCountsZero(bootstrapSummary.localCounts),
  )
  const showCloudSettingsNote = Boolean(
    bootstrapSummary &&
      bootstrapResolutionView &&
      bootstrapResolutionView.cloudEffectivelyEmpty === false &&
      areVisibleSyncCountsZero(bootstrapSummary.cloudCounts),
  )
  const previewMergeIsPrimary =
    bootstrapResolutionView?.reason === 'post_sign_in_conflict' &&
    bootstrapResolutionView.cloudEffectivelyEmpty === false
  const replaceCloudIsPrimary =
    bootstrapResolutionView?.reason === 'post_sign_in_conflict' &&
    bootstrapResolutionView.cloudEffectivelyEmpty === true
  const showCoachMinimumWarning =
    settingsForm.coachingMinCalories.trim().length > 0 &&
    Number.isFinite(Number.parseFloat(settingsForm.coachingMinCalories)) &&
    settings.calorieTarget < Number.parseFloat(settingsForm.coachingMinCalories)

  function applySettingsUpdate(): void {
    try {
      const updateResult = onUpdateSettings({
        ...settings,
        calorieTarget: parseTarget('Calorie target', settingsForm.calorieTarget),
        proteinTarget: parseTarget('Protein target', settingsForm.proteinTarget),
        carbTarget: parseTarget('Carb target', settingsForm.carbTarget),
        fatTarget: parseTarget('Fat target', settingsForm.fatTarget),
        weightUnit: settingsForm.weightUnit,
        goalMode: settingsForm.goalMode,
        fatLossMode: settingsForm.fatLossMode,
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
        coachingMinCalories: parsePositiveOptionalTarget(
          settingsForm.coachingMinCalories,
          'Coach minimum calories must be a positive number or left blank.',
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

  function applyAdvancedSettingsPatch(patch: Partial<UserSettings>): void {
    const result = onUpdateSettings({
      ...settings,
      ...patch,
    })
    setSettingsError(result.ok ? null : result.error.message)
  }

  function updatePhaseMealTemplateLabel(dayType: CutDayType, label: string): void {
    const now = new Date().toISOString()
    const existingTemplates = settings.phaseMealTemplates ?? []
    const existing = existingTemplates.find((template) => template.dayType === dayType && !template.archivedAt)
    const nextTemplate = existing
      ? {
          ...existing,
          label: label.trim() || DEFAULT_PHASE_TEMPLATE_LABELS[dayType],
          updatedAt: now,
          source: 'manual' as const,
        }
      : {
          id: crypto.randomUUID(),
          label: label.trim() || DEFAULT_PHASE_TEMPLATE_LABELS[dayType],
          dayType,
          meals: [],
          source: 'manual' as const,
          createdAt: now,
          updatedAt: now,
        }
    const remaining = existingTemplates.filter((template) => template.id !== existing?.id)
    applyAdvancedSettingsPatch({
      phaseMealTemplates: [...remaining, nextTemplate].sort((left, right) => left.dayType.localeCompare(right.dayType)),
    })
  }

  function updatePhaseMealTemplateMeal(
    dayType: CutDayType,
    meal: MealTemplate['defaultMeal'] & string,
    savedMealId: string,
  ): void {
    const now = new Date().toISOString()
    const existingTemplates = settings.phaseMealTemplates ?? []
    const existing = existingTemplates.find((template) => template.dayType === dayType && !template.archivedAt)
    const base = existing ?? {
      id: crypto.randomUUID(),
      label: DEFAULT_PHASE_TEMPLATE_LABELS[dayType],
      dayType,
      meals: [],
      source: 'saved_meal_map' as const,
      createdAt: now,
      updatedAt: now,
    }
    const nextMeals = [
      ...base.meals.filter((entry) => entry.meal !== meal),
      ...(savedMealId ? [{ meal, savedMealId }] : []),
    ]
    const nextTemplate = {
      ...base,
      meals: nextMeals,
      source: 'saved_meal_map' as const,
      updatedAt: now,
    }
    const remaining = existingTemplates.filter((template) => template.id !== existing?.id)
    applyAdvancedSettingsPatch({
      phaseMealTemplates: [...remaining, nextTemplate].sort((left, right) => left.dayType.localeCompare(right.dayType)),
    })
  }

  function handleStartCarbCycleSubmit(): void {
    if (!onStartCarbCycle) {
      return
    }
    const result = onStartCarbCycle(
      dietPhaseForm.startDate,
      dietPhaseForm.plannedEndDate,
      dietPhaseForm.notes,
    )
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }
    setPhaseActionError(null)
    onReportGlobalError(null)
  }

  function handleScheduleHighCarbDaySubmit(): void {
    if (!activeCarbCyclePhase || !onScheduleHighCarbDay) {
      return
    }
    const calories = Number.parseFloat(dietPhaseForm.refeedCalories)
    if (!dietPhaseForm.refeedDate.trim()) {
      handlePhaseActionError('High-carb day date is required.')
      return
    }
    if (!Number.isFinite(calories) || calories <= 0) {
      handlePhaseActionError('High-carb day calories must be a positive number.')
      return
    }
    const result = onScheduleHighCarbDay(
      activeCarbCyclePhase.id,
      dietPhaseForm.refeedDate,
      calories,
      dietPhaseForm.refeedNotes,
    )
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }
    setPhaseActionError(null)
    onReportGlobalError(null)
  }

  function handleDeleteHighCarbDayAction(eventId: string): void {
    if (!onDeleteHighCarbDay) {
      return
    }
    const result = onDeleteHighCarbDay(eventId)
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }
    setPhaseActionError(null)
    onReportGlobalError(null)
  }

  function updateNutrientGoalMode(key: CanonicalNutrientKey, mode: 'auto' | 'custom' | 'none'): void {
    const currentGoals = settings.nutrientGoals ?? {}
    const nextGoal =
      mode === 'auto'
        ? { mode }
        : mode === 'none'
          ? { mode }
          : {
              mode,
              target: currentGoals[key]?.target,
              floor: currentGoals[key]?.floor,
              ceiling: currentGoals[key]?.ceiling,
            }
    applyAdvancedSettingsPatch({
      nutrientGoals: {
        ...currentGoals,
        [key]: nextGoal,
      },
    })
  }

  function updateNutrientGoalValue(
    key: CanonicalNutrientKey,
    field: 'floor' | 'target' | 'ceiling',
    rawValue: string,
  ): void {
    const parsed = rawValue.trim() ? Number.parseFloat(rawValue) : undefined
    if (rawValue.trim() && (!Number.isFinite(parsed) || parsed! < 0)) {
      setSettingsError(`${formatNutrientLabel(key)} ${field} must be a valid positive number or blank.`)
      return
    }

    const currentGoal = settings.nutrientGoals?.[key] ?? { mode: 'custom' as const }
    applyAdvancedSettingsPatch({
      nutrientGoals: {
        ...(settings.nutrientGoals ?? {}),
        [key]: {
          ...currentGoal,
          mode: currentGoal.mode === 'none' ? 'custom' : currentGoal.mode ?? 'custom',
          [field]: parsed,
        },
      },
    })
  }

  function togglePinnedNutrient(key: CanonicalNutrientKey): void {
    const currentPins = settings.pinnedNutrients ?? []
    const alreadyPinned = currentPins.some((entry) => entry.key === key)
    const nextPins = alreadyPinned
      ? currentPins.filter((entry) => entry.key !== key).map((entry, order) => ({ ...entry, order }))
      : [...currentPins, { key, order: currentPins.length }]
    applyAdvancedSettingsPatch({ pinnedNutrients: nextPins })
  }

  function toggleCoachModule(kind: 'partial_logging' | 'fasting' | 'logging_break' | 'program_update'): void {
    const currentSettings = settings.coachModuleSettings ?? {}
    applyAdvancedSettingsPatch({
      coachModuleSettings: {
        ...currentSettings,
        [kind]: {
          enabled: !(currentSettings[kind]?.enabled ?? true),
        },
      },
    })
  }

  function updateFastCheckInPreference(patch: Partial<NonNullable<UserSettings['fastCheckInPreference']>>): void {
    applyAdvancedSettingsPatch({
      fastCheckInPreference: {
        enabled: settings.fastCheckInPreference?.enabled ?? true,
        skipModuleDetails: settings.fastCheckInPreference?.skipModuleDetails ?? true,
        surfaceEntryPoint: settings.fastCheckInPreference?.surfaceEntryPoint ?? 'dashboard',
        postResultModuleSummary: settings.fastCheckInPreference?.postResultModuleSummary ?? true,
        ...patch,
      },
    })
  }

  function buildLoggingShortcutConfigs(
    nextPreference: NonNullable<UserSettings['loggingShortcutPreference']>,
  ): ToolbarShortcutConfig[] {
    const existingConfigMap = new Map(
      normalizeToolbarShortcutConfigs(settings.loggingShortcuts).map((config) => [config.id, config]),
    )
    return nextPreference.shortcutOrder.map((id, order) => ({
      id,
      order,
      colorToken: existingConfigMap.get(id)?.colorToken ?? DEFAULT_SHORTCUT_COLORS[id],
      visible: nextPreference.enabledShortcutIds.includes(id),
    }))
  }

  function updateLoggingShortcutPreference(patch: Partial<NonNullable<UserSettings['loggingShortcutPreference']>>): void {
    const enabledShortcutIds = normalizeLoggingShortcutIds(
      settings.loggingShortcutPreference?.enabledShortcutIds,
    )
    const shortcutOrder = normalizeLoggingShortcutIds(
      settings.loggingShortcutPreference?.shortcutOrder,
    )
    const nextPreference: NonNullable<UserSettings['loggingShortcutPreference']> = {
      barcodeFirst: settings.loggingShortcutPreference?.barcodeFirst ?? true,
      autologExactBarcodeHits: settings.loggingShortcutPreference?.autologExactBarcodeHits ?? true,
      prioritizeRecents: settings.loggingShortcutPreference?.prioritizeRecents ?? true,
      prioritizeFavorites: settings.loggingShortcutPreference?.prioritizeFavorites ?? true,
      prioritizeSavedMeals: settings.loggingShortcutPreference?.prioritizeSavedMeals ?? true,
      enabledShortcutIds,
      shortcutOrder,
      mealAwareLane: settings.loggingShortcutPreference?.mealAwareLane ?? true,
      toolbarStyle: settings.loggingShortcutPreference?.toolbarStyle ?? 'search_barcode',
      topShortcutId: settings.loggingShortcutPreference?.topShortcutId ?? 'scanner',
      ...patch,
    }

    nextPreference.enabledShortcutIds = normalizeLoggingShortcutIds(nextPreference.enabledShortcutIds)
    nextPreference.shortcutOrder = normalizeLoggingShortcutIds(nextPreference.shortcutOrder)
    nextPreference.topShortcutId = nextPreference.topShortcutId ?? 'scanner'
    if (!nextPreference.enabledShortcutIds.includes(nextPreference.topShortcutId)) {
      nextPreference.topShortcutId = nextPreference.enabledShortcutIds[0] ?? 'scanner'
    }

    applyAdvancedSettingsPatch({
      loggingShortcutPreference: nextPreference,
      loggingToolbarStyle: nextPreference.toolbarStyle,
      loggingShortcuts: buildLoggingShortcutConfigs(nextPreference),
      featureSettingsVersionApplied: Math.max(settings.featureSettingsVersionApplied ?? 0, 1),
    })
  }

  function updateToolbarShortcutConfig(
    shortcutId: LoggingShortcutId,
    patch: Partial<ToolbarShortcutConfig>,
  ): void {
    const nextConfigs = normalizeToolbarShortcutConfigs(settings.loggingShortcuts).map((config) =>
      config.id === shortcutId ? { ...config, ...patch } : config,
    )
    applyAdvancedSettingsPatch({
      loggingShortcuts: nextConfigs,
      featureSettingsVersionApplied: Math.max(settings.featureSettingsVersionApplied ?? 0, 1),
    })
  }

  function resetLoggingShortcuts(): void {
    const defaultPreference: NonNullable<UserSettings['loggingShortcutPreference']> = {
      barcodeFirst: true,
      autologExactBarcodeHits: true,
      prioritizeRecents: true,
      prioritizeFavorites: true,
      prioritizeSavedMeals: true,
      enabledShortcutIds: LOGGING_SHORTCUT_OPTIONS.map((option) => option.id),
      shortcutOrder: LOGGING_SHORTCUT_OPTIONS.map((option) => option.id),
      mealAwareLane: true,
      toolbarStyle: 'search_barcode',
      topShortcutId: 'scanner',
    }
    applyAdvancedSettingsPatch({
      loggingShortcutPreference: defaultPreference,
      loggingToolbarStyle: defaultPreference.toolbarStyle,
      loggingShortcuts: defaultPreference.shortcutOrder.map((id, order) => ({
        id,
        order,
        colorToken: DEFAULT_SHORTCUT_COLORS[id],
        visible: true,
      })),
      featureSettingsVersionApplied: Math.max(settings.featureSettingsVersionApplied ?? 0, 1),
    })
  }

  function resetDashboardCustomization(): void {
    applyAdvancedSettingsPatch({
      dashboardLayout: {
        order: ['coach', 'nutrition', 'food_review', 'garmin', 'workouts', 'body_progress', 'benchmark'],
        hiddenSectionIds: [],
        updatedAt: new Date().toISOString(),
      },
      dashboardDefaultsVersionApplied: Math.max(settings.dashboardDefaultsVersionApplied ?? 0, 1),
      featureSettingsVersionApplied: Math.max(settings.featureSettingsVersionApplied ?? 0, 1),
    })
  }

  function resetProgressComparePreferences(): void {
    applyAdvancedSettingsPatch({
      bodyProgressFocusState: {
        focusedMetricKey: settings.bodyProgressFocusState?.focusedMetricKey,
        comparePreset: 'same_day',
        lastSelectedPose: 'front',
        compareMode: 'side_by_side',
        galleryMode: 'latest_vs_compare',
      },
      featureSettingsVersionApplied: Math.max(settings.featureSettingsVersionApplied ?? 0, 1),
    })
  }

  function toggleLoggingShortcutEnabled(shortcutId: LoggingShortcutId): void {
    const currentEnabled = normalizeLoggingShortcutIds(
      settings.loggingShortcutPreference?.enabledShortcutIds,
    )
    const nextEnabled = currentEnabled.includes(shortcutId)
      ? currentEnabled.filter((id) => id !== shortcutId)
      : [...currentEnabled, shortcutId]

    updateLoggingShortcutPreference({
      enabledShortcutIds: nextEnabled.length ? nextEnabled : [shortcutId],
    })
  }

  function moveLoggingShortcut(shortcutId: LoggingShortcutId, direction: -1 | 1): void {
    const currentOrder = normalizeLoggingShortcutIds(settings.loggingShortcutPreference?.shortcutOrder)
    const index = currentOrder.indexOf(shortcutId)
    const nextIndex = index + direction
    if (index === -1 || nextIndex < 0 || nextIndex >= currentOrder.length) {
      return
    }

    const nextOrder = [...currentOrder]
    const [moved] = nextOrder.splice(index, 1)
    nextOrder.splice(nextIndex, 0, moved)
    updateLoggingShortcutPreference({ shortcutOrder: nextOrder })
  }

  function handleSettingsSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    applySettingsUpdate()
  }

  async function handleExport(): Promise<void> {
    const exportResult = exportBackup()
    if (!exportResult.ok) {
      setImportError(exportResult.error.message)
      onReportGlobalError(exportResult.error)
      return
    }

    try {
      const exportPayload = JSON.stringify(exportResult.data, null, 2)
      const exportMode = await shareOrDownloadJsonFile(buildBackupFilename(), exportPayload)

      const exportedAt = new Date().toISOString()
      persistTimestamp(LAST_MANUAL_EXPORT_AT_KEY, exportedAt)
      setLastExportedAt(exportedAt)
      setImportError(null)
      setImportSuccess(
        `${exportMode === 'shared' ? 'Backup shared' : 'Backup exported'} at ${formatLocalDateTime(exportedAt)}.`,
      )
      onReportGlobalError(null)
    } catch (error) {
      onReportGlobalError(
        error instanceof Error ? error.message : 'Unable to export the backup right now.',
      )
    }
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

  async function handleHistoryImportFiles(
    provider: HistoryImportProvider,
    files: FileList | File[],
  ): Promise<void> {
    const validationResult = await previewImport(provider, files)
    if (!validationResult.ok) {
      setHistoryImportPreview(null)
      setHistoryImportError(validationResult.error.message)
      setHistoryImportSuccess(null)
      onReportGlobalError(validationResult.error)
      return
    }

    setHistoryImportPreview(validationResult.data)
    setHistoryImportError(null)
    setHistoryImportSuccess(null)
    onReportGlobalError(null)
  }

  async function handleApplyImport(): Promise<void> {
    if (!importPreview) {
      return
    }

    const snapshotReason =
      importMode === 'replace' ? 'pre-import-replace' : 'pre-import-merge'
    const snapshotResult = await captureSnapshot(snapshotReason)
    if (!snapshotResult.ok) {
      setImportError(snapshotResult.error.message)
      setImportSuccess(null)
      onReportGlobalError(snapshotResult.error)
      return
    }

    const importResult = await applyImport(importPreview.backup, importMode)
    if (!importResult.ok) {
      setImportError(importResult.error.message)
      setImportSuccess(null)
      onReportGlobalError(importResult.error)
      return
    }

    setImportSuccess(
      `${importMode === 'replace' ? 'Replaced' : 'Merged'} ${importResult.data.foods} foods, ${importResult.data.weights} weights, and ${importResult.data.logEntries} log entries.`,
    )
    setLastImportRollbackBackup(snapshotResult.data.backup)
    setImportError(null)
    setImportPreview(null)
    if (importInputRef.current) {
      importInputRef.current.value = ''
    }
    onReportGlobalError(null)
  }

  async function handleApplyHistoryImport(): Promise<void> {
    if (!historyImportPreview) {
      return
    }

    const snapshotResult = await captureSnapshot('pre-import-merge')
    if (!snapshotResult.ok) {
      setHistoryImportError(snapshotResult.error.message)
      setHistoryImportSuccess(null)
      onReportGlobalError(snapshotResult.error)
      return
    }

    const importResult = await applyHistoryImport(historyImportPreview)
    if (!importResult.ok) {
      setHistoryImportError(importResult.error.message)
      setHistoryImportSuccess(null)
      onReportGlobalError(importResult.error)
      return
    }

    setHistoryImportSuccess(
      `Imported ${importResult.data.logEntries} log entries and ${importResult.data.weights} weights from ${formatHistoryImportProvider(historyImportPreview.provider)}.`,
    )
    setLastImportRollbackBackup(snapshotResult.data.backup)
    setHistoryImportError(null)
    setHistoryImportPreview(null)
    if (macroFactorImportInputRef.current) {
      macroFactorImportInputRef.current.value = ''
    }
    if (renphoImportInputRef.current) {
      renphoImportInputRef.current.value = ''
    }
    onReportGlobalError(null)
  }

  async function handleUndoLastImport(): Promise<void> {
    if (!lastImportRollbackBackup) {
      return
    }

    const snapshotResult = await captureSnapshot('pre-recovery-restore')
    if (!snapshotResult.ok) {
      setImportError(snapshotResult.error.message)
      setImportSuccess(null)
      onReportGlobalError(snapshotResult.error)
      return
    }

    const restoreResult = await applyImport(lastImportRollbackBackup, 'replace')
    if (!restoreResult.ok) {
      setImportError(restoreResult.error.message)
      setImportSuccess(null)
      onReportGlobalError(restoreResult.error)
      return
    }

    setImportError(null)
    setImportSuccess('Restored the device to the state captured before the last import.')
    setLastImportRollbackBackup(null)
    onReportGlobalError(null)
  }

  function handlePhaseActionError(message: string): void {
    setPhaseActionError(message)
    onReportGlobalError(message)
  }

  function handleRecoveryActionError(message: string): void {
    setRecoveryActionError(message)
    onReportGlobalError(message)
  }

  function resetPhaseEditor(): void {
    setPhaseEditorMode(null)
    setPhaseEditorTargetId(null)
    setRefeedEditorTargetId(null)
  }

  function isRefeedLocked(event: DietPhaseEvent): boolean {
    return event.date < todayDate || (event.date === todayDate && (hasLoggedEntriesOnDate?.(event.date) ?? false))
  }

  function openStartPsmfEditor(): void {
    setDietPhaseForm(buildDietPhaseFormState(settings, recoveryCheckInToday))
    setPhaseActionError(null)
    setPhaseEditorTargetId(null)
    setPhaseEditorMode('start_psmf')
  }

  function openPlannedPhaseEditor(phase: DietPhase): void {
    setDietPhaseForm((current) => ({
      ...current,
      startDate: phase.startDate,
      plannedEndDate: phase.plannedEndDate,
      calorieTargetOverride:
        typeof phase.calorieTargetOverride === 'number' ? `${phase.calorieTargetOverride}` : '',
      notes: phase.notes ?? '',
    }))
    setPhaseActionError(null)
    setPhaseEditorTargetId(phase.id)
    setPhaseEditorMode('edit_planned_phase')
  }

  function openExtendPhaseEditor(targetPhase: DietPhase | null | undefined): void {
    if (!targetPhase) {
      return
    }

    setDietPhaseForm((current) => ({
      ...current,
      plannedEndDate: targetPhase.plannedEndDate,
    }))
    setPhaseActionError(null)
    setPhaseEditorTargetId(targetPhase.id)
    setPhaseEditorMode('extend_phase')
  }

  function openDietBreakEditor(): void {
    const nextState = buildDietPhaseFormState(settings, recoveryCheckInToday)
    setDietPhaseForm({
      ...nextState,
      startDate: todayDate,
      notes: '',
    })
    setPhaseActionError(null)
    setPhaseEditorTargetId(activePsmfPhase?.id ?? null)
    setPhaseEditorMode('start_diet_break')
  }

  function openScheduleRefeedEditor(targetPhase: DietPhase): void {
    const baseState = buildDietPhaseFormState(settings, recoveryCheckInToday)
    const nextRefeedDate =
      baseState.refeedDate < targetPhase.startDate
        ? targetPhase.startDate
        : baseState.refeedDate > targetPhase.plannedEndDate
          ? targetPhase.plannedEndDate
          : baseState.refeedDate
    setDietPhaseForm((current) => ({
      ...current,
      refeedDate: nextRefeedDate,
      refeedCalories: baseState.refeedCalories,
      refeedNotes: baseState.refeedNotes,
    }))
    setPhaseActionError(null)
    setRefeedEditorTargetId(null)
    onSelectPsmfPhase?.(targetPhase.id)
    setPhaseEditorMode('schedule_refeed')
  }

  function openPhaseNotesEditor(phase: DietPhase, trigger: HTMLElement | null): void {
    setNotesReturnFocusTo(trigger)
    setNotesEditorState({
      kind: 'phase',
      title: 'Edit phase notes',
      targetId: phase.id,
      initialNotes: phase.notes,
    })
  }

  function openRefeedNotesEditor(event: DietPhaseEvent, trigger: HTMLElement | null): void {
    setNotesReturnFocusTo(trigger)
    setNotesEditorState({
      kind: 'refeed',
      title: 'Edit refeed notes',
      targetId: event.id,
      initialNotes: event.notes,
      refeedDate: event.date,
      refeedCalories: event.calorieTargetOverride,
    })
  }

  function handleCloseNotesEditor(): void {
    const target = notesReturnFocusTo
    setNotesEditorState(null)
    setNotesReturnFocusTo(null)
    if (target) {
      window.requestAnimationFrame(() => {
        target.focus()
      })
    }
  }

  function handleStartPsmfSubmit(): void {
    if (!onStartPsmfPhase) {
      return
    }

    const result = onStartPsmfPhase(
      dietPhaseForm.startDate,
      dietPhaseForm.plannedEndDate,
      dietPhaseForm.notes,
    )
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleUpdatePlannedPhaseSubmit(): void {
    if (!phaseEditorTargetId || !onUpdatePlannedPhase) {
      return
    }

    const phase = plannedPhases.find((entry) => entry.id === phaseEditorTargetId)
    if (!phase) {
      handlePhaseActionError('Phase not found.')
      return
    }

    const calorieTargetOverride =
      phase.type === 'diet_break'
        ? Number.parseFloat(dietPhaseForm.calorieTargetOverride)
        : undefined
    if (
      phase.type === 'diet_break' &&
      (!Number.isFinite(calorieTargetOverride ?? Number.NaN) || (calorieTargetOverride ?? 0) <= 0)
    ) {
      handlePhaseActionError('Diet break calories must be a positive number.')
      return
    }

    const result = onUpdatePlannedPhase(phaseEditorTargetId, {
      startDate: dietPhaseForm.startDate,
      plannedEndDate: dietPhaseForm.plannedEndDate,
      calorieTargetOverride,
      notes: dietPhaseForm.notes,
    })
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleExtendPhaseSubmit(targetPhase: DietPhase | null | undefined): void {
    if (!targetPhase || !onExtendDietPhase) {
      return
    }

    const result = onExtendDietPhase(targetPhase.id, dietPhaseForm.plannedEndDate)
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleCompletePhase(targetPhase: DietPhase | null | undefined): void {
    if (!targetPhase || !onCompleteDietPhase) {
      return
    }

    const result = onCompleteDietPhase(targetPhase.id, getTodayDateKey())
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleStartDietBreakSubmit(): void {
    if (!onStartDietBreak) {
      return
    }

    const calories = Number.parseFloat(dietPhaseForm.calorieTargetOverride)
    if (!Number.isFinite(calories) || calories <= 0) {
      handlePhaseActionError('Diet break calories must be a positive number.')
      return
    }

    const result = onStartDietBreak(
      dietPhaseForm.startDate,
      dietPhaseForm.plannedEndDate,
      calories,
      dietPhaseForm.notes,
    )
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleScheduleRefeedSubmit(): void {
    if (!selectedPsmfPhase || !onScheduleRefeed) {
      return
    }

    const calories = Number.parseFloat(dietPhaseForm.refeedCalories)
    if (!dietPhaseForm.refeedDate.trim()) {
      handlePhaseActionError('Refeed date is required.')
      return
    }
    if (!Number.isFinite(calories) || calories <= settings.calorieTarget) {
      handlePhaseActionError('Refeed calories must be higher than your current calorie target.')
      return
    }

    const result = onScheduleRefeed(
      selectedPsmfPhase.id,
      dietPhaseForm.refeedDate,
      calories,
      dietPhaseForm.refeedNotes,
    )
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleOpenEditRefeed(
    event: DietPhaseEvent,
    trigger: HTMLElement | null,
  ): void {
    if (isRefeedLocked(event)) {
      openRefeedNotesEditor(event, trigger)
      return
    }

    setDietPhaseForm((current) => ({
      ...current,
      refeedDate: event.date,
      refeedCalories: `${event.calorieTargetOverride}`,
      refeedNotes: event.notes ?? '',
    }))
    setPhaseActionError(null)
    setRefeedEditorTargetId(event.id)
    setPhaseEditorMode('edit_refeed')
  }

  function handleUpdateRefeedSubmit(): void {
    if (!refeedEditorTargetId || !onUpdateRefeed) {
      return
    }

    const targetRefeed = selectedPsmfPhaseRefeeds.find((event) => event.id === refeedEditorTargetId)
    if (!targetRefeed) {
      handlePhaseActionError('Refeed not found.')
      return
    }

    const calories = Number.parseFloat(dietPhaseForm.refeedCalories)
    if (!dietPhaseForm.refeedDate.trim()) {
      handlePhaseActionError('Refeed date is required.')
      return
    }
    if (!Number.isFinite(calories) || calories <= settings.calorieTarget) {
      handlePhaseActionError('Refeed calories must be higher than your current calorie target.')
      return
    }

    const result = onUpdateRefeed(
      targetRefeed.id,
      dietPhaseForm.refeedDate,
      calories,
      dietPhaseForm.refeedNotes,
    )
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleDeleteScheduledRefeed(eventId: string): void {
    if (!onDeleteRefeed) {
      return
    }

    const result = onDeleteRefeed(eventId)
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    onReportGlobalError(null)
  }

  function handleCancelPhasePress(phaseId: string): void {
    if (!onCancelPhase) {
      return
    }

    const result = onCancelPhase(phaseId)
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    resetPhaseEditor()
    onReportGlobalError(null)
  }

  function handleSaveNotes(notes: string | undefined): ActionResult<void> {
    if (!notesEditorState) {
      return { ok: true, data: undefined }
    }

    if (notesEditorState.kind === 'phase') {
      if (!onUpdatePhaseNotes) {
        return { ok: true, data: undefined }
      }
      const result = onUpdatePhaseNotes(notesEditorState.targetId, notes)
      if (!result.ok) {
        return result as ActionResult<void>
      }
      return { ok: true, data: undefined }
    }

    if (!onUpdateRefeed || !notesEditorState.refeedDate || !notesEditorState.refeedCalories) {
      return { ok: true, data: undefined }
    }

    const result = onUpdateRefeed(
      notesEditorState.targetId,
      notesEditorState.refeedDate,
      notesEditorState.refeedCalories,
      notes,
    )
    if (!result.ok) {
      return result as ActionResult<void>
    }

    return { ok: true, data: undefined }
  }

  function handleExitPsmfPress(): void {
    if (!onExitPsmf) {
      return
    }

    const result = onExitPsmf()
    if (!result.ok) {
      handlePhaseActionError(result.error.message)
      return
    }

    setPhaseActionError(null)
    onReportGlobalError(null)
  }

  function handleSaveRecovery(): void {
    if (!onSaveRecoveryCheckIn) {
      return
    }

    const result = onSaveRecoveryCheckIn(getTodayDateKey(), recoveryForm)
    if (!result.ok) {
      handleRecoveryActionError(result.error.message)
      return
    }

    setRecoveryActionError(null)
    onReportGlobalError(null)
  }

  function handleDeleteRecovery(): void {
    if (!onDeleteRecoveryCheckIn) {
      return
    }

    const result = onDeleteRecoveryCheckIn(getTodayDateKey())
    if (!result.ok) {
      handleRecoveryActionError(result.error.message)
      return
    }

    setRecoveryActionError(null)
    onReportGlobalError(null)
  }

  const todayDate = getTodayDateKey()
  const currentPhase = activeDietBreakPhase ?? activePsmfPhase ?? expiredPsmfPhase ?? null
  const editingPlannedPhase = plannedPhases.find((phase) => phase.id === phaseEditorTargetId) ?? null
  const editingRefeed = selectedPsmfPhaseRefeeds.find((event) => event.id === refeedEditorTargetId) ?? null
  const scheduledRefeedFieldsLocked = editingRefeed ? isRefeedLocked(editingRefeed) : false
  const showPsmfPhaseSelector = selectablePsmfPhases.length > 1

  function setSettingsHubSectionRef(sectionId: SettingsHubSectionId) {
    return (node: HTMLDivElement | null): void => {
      settingsHubSectionRefs.current[sectionId] = node
    }
  }

  function openSettingsHubSection(sectionId: SettingsHubSectionId): void {
    setActiveHubSection(sectionId)
    const target = settingsHubSectionRefs.current[sectionId]
    if (!target) {
      return
    }

    target.scrollIntoView({
      behavior: FEATURE_FLAGS.motionSystemV1 ? 'smooth' : 'auto',
      block: 'start',
    })
  }

  useEffect(() => {
    if (!phaseReviewIntent) {
      return
    }

    openSettingsHubSection('workouts')
    setPhaseActionError(null)

    if (phaseReviewIntent.type === 'refeed_day') {
      const targetEvent =
        selectedPsmfPhaseRefeeds.find((event) => event.id === phaseReviewIntent.eventId) ?? null
      setDietPhaseForm((current) => ({
        ...current,
        refeedDate: phaseReviewIntent.date,
        refeedCalories:
          targetEvent && Number.isFinite(targetEvent.calorieTargetOverride)
            ? `${targetEvent.calorieTargetOverride}`
            : current.refeedCalories,
        refeedNotes: targetEvent?.notes ?? current.refeedNotes,
      }))
      setPhaseEditorTargetId(phaseReviewIntent.phaseId)
      setRefeedEditorTargetId(phaseReviewIntent.eventId)
      setPhaseEditorMode('edit_refeed')
      onSelectPsmfPhase?.(phaseReviewIntent.phaseId)
    } else {
      const targetEvent =
        activeCarbCycleHighCarbDays.find((event) => event.id === phaseReviewIntent.eventId) ?? null
      setDietPhaseForm((current) => ({
        ...current,
        refeedDate: phaseReviewIntent.date,
        refeedCalories:
          targetEvent && Number.isFinite(targetEvent.calorieTargetOverride)
            ? `${targetEvent.calorieTargetOverride}`
            : current.refeedCalories,
        refeedNotes: targetEvent?.notes ?? current.refeedNotes,
      }))
      setPhaseEditorMode(null)
    }

    onClearPhaseReviewIntent?.()
  }, [
    activeCarbCycleHighCarbDays,
    onClearPhaseReviewIntent,
    onSelectPsmfPhase,
    phaseReviewIntent,
    selectedPsmfPhaseRefeeds,
  ])

  return (
    <div className="space-y-4 pb-6">
      <ScreenHeader
        eyebrow="Feature settings"
        title="Tune the app around daily execution"
        description="Keep the first view calm: pick the area you want to tune, then drill into detailed controls only when you need them."
      />

      {FEATURE_FLAGS.settingsHubV1 ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
              Settings hub
            </p>
            <p className="text-sm text-[color:var(--text-secondary)]">
              One entry point for dashboard, logging, workouts, body progress, and data safety.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SETTINGS_HUB_SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeHubSection === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`settings-hub-card text-left transition ${
                    isActive
                      ? 'border-transparent bg-[color:var(--action-primary-bg)] text-[color:var(--action-primary-text)] shadow-[var(--shadow-raised)]'
                      : ''
                  }`}
                  onClick={() => openSettingsHubSection(section.id)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'bg-[color:var(--surface-floating)] text-[color:var(--text-primary)]'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{section.label}</p>
                      <p
                        className={`mt-1 text-xs ${
                          isActive
                            ? 'text-white/80'
                            : 'text-[color:var(--text-secondary)]'
                        }`}
                      >
                        {section.description}
                      </p>
                      <p
                        className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          isActive
                            ? 'text-white/75'
                            : 'text-[color:var(--text-muted)]'
                        }`}
                      >
                        {section.actionLabel}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <div ref={setSettingsHubSectionRef('logging')} />
      {(initializationError || recoveryIssues.length) ? (
        <section className="app-card space-y-3 border-amber-200 bg-amber-50/90 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
              Data health
            </p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
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

      {FEATURE_FLAGS.foodTruthV2 ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Food review queue
            </p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">
              {pendingFoodReviewItems.length} pending review item{pendingFoodReviewItems.length === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Imported-food conflicts and orphaned log links stay here until you resolve or dismiss them.
            </p>
          </div>

          {pendingFoodReviewItems.length ? (
            <div className="space-y-3">
              {pendingFoodReviewItems.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.reason}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        {item.source.replaceAll('_', ' ')}
                        {item.linkedEntryDate ? ` • ${formatShortDate(item.linkedEntryDate)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.linkedEntryDate && onOpenLogDate ? (
                        <button
                          type="button"
                          className="action-button-secondary"
                          onClick={() => onOpenLogDate(item.linkedEntryDate!)}
                        >
                          Open log day
                        </button>
                      ) : null}
                      {onDismissFoodReviewItem ? (
                        <button
                          type="button"
                          className="action-button-secondary"
                          onClick={() => onDismissFoodReviewItem(item.id)}
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-6 text-sm text-slate-600 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-slate-300">
              No pending review items. New barcode, OCR, and import conflicts will surface here when they need user action.
            </div>
          )}
        </section>
      ) : null}

      <div ref={setSettingsHubSectionRef('workouts')} />
      {previewPsmfGarminUiState ? (
        <section className="app-card space-y-4 px-4 py-4" data-testid="psmf-diet-phase-section">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Diet phase</p>
            <p className="text-2xl font-semibold text-slate-900 dark:text-white">Manage PSMF timing</p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            PSMF requires an active phase with an end date. Refeed days and diet breaks are scheduled here.
          </p>
          <div className="space-y-4">
            <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Current phase</p>
              <div className="mt-3 space-y-3">
            {previewPsmfGarminUiState.dietPhase?.kind === 'active_psmf' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  PSMF active until {previewPsmfGarminUiState.dietPhase.activeUntilLabel ?? '--'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Start date is locked once the phase becomes active.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-button-secondary" onClick={() => openExtendPhaseEditor(activePsmfPhase)}>
                    Extend phase
                  </button>
                  <button type="button" className="action-button-secondary" onClick={() => handleCompletePhase(activePsmfPhase)}>
                    Complete phase
                  </button>
                  <button type="button" className="action-button-secondary" onClick={() => activePsmfPhase ? openScheduleRefeedEditor(activePsmfPhase) : undefined}>
                    Schedule refeed
                  </button>
                  <button type="button" className="action-button-secondary" onClick={openDietBreakEditor}>
                    Start diet break
                  </button>
                </div>
              </div>
            ) : previewPsmfGarminUiState.dietPhase?.kind === 'expired_psmf' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  PSMF phase expired on {previewPsmfGarminUiState.dietPhase.expiredOnLabel ?? '--'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Extend the phase, start a diet break, or exit PSMF before the coach can adjust targets again.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Only notes may be edited until you extend or complete this phase.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-button-secondary" onClick={() => openExtendPhaseEditor(expiredPsmfPhase)}>
                    Extend phase
                  </button>
                  <button type="button" className="action-button-secondary" onClick={() => handleCompletePhase(expiredPsmfPhase)}>
                    Complete phase
                  </button>
                  <button
                    type="button"
                    className="action-button-secondary"
                    onClick={(event) => expiredPsmfPhase ? openPhaseNotesEditor(expiredPsmfPhase, event.currentTarget) : undefined}
                  >
                    Edit notes
                  </button>
                  <button type="button" className="action-button-secondary" onClick={openDietBreakEditor}>
                    Start diet break
                  </button>
                  <button type="button" className="action-button-secondary" onClick={handleExitPsmfPress}>
                    Exit PSMF
                  </button>
                </div>
              </div>
            ) : previewPsmfGarminUiState.dietPhase?.kind === 'diet_break_active' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Diet break active until {previewPsmfGarminUiState.dietPhase.activeUntilLabel ?? '--'}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Start date is locked once the phase becomes active.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-button-secondary" onClick={() => openExtendPhaseEditor(activeDietBreakPhase)}>
                    Extend diet break
                  </button>
                  <button type="button" className="action-button-secondary" onClick={() => handleCompletePhase(activeDietBreakPhase)}>
                    Complete diet break
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">No active PSMF phase scheduled.</p>
                <button type="button" className="action-button-secondary" onClick={openStartPsmfEditor}>
                  Start PSMF phase
                </button>
              </div>
            )}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Upcoming phases</p>
              <div className="mt-3 space-y-3">
                {plannedPhases.length ? (
                  plannedPhases.map((phase) => (
                    <div
                      key={phase.id}
                      className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-slate-950/60"
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {phase.type === 'psmf'
                          ? `PSMF scheduled from ${formatShortDate(phase.startDate)} to ${formatShortDate(phase.plannedEndDate)}`
                          : `Diet break scheduled from ${formatShortDate(phase.startDate)} to ${formatShortDate(phase.plannedEndDate)}`}
                      </p>
                      {phase.type === 'diet_break' && typeof phase.calorieTargetOverride === 'number' ? (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {phase.calorieTargetOverride} kcal
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="action-button-secondary" onClick={() => openPlannedPhaseEditor(phase)}>
                          Edit phase
                        </button>
                        <button type="button" className="action-button-secondary" onClick={() => handleCancelPhasePress(phase.id)}>
                          Cancel phase
                        </button>
                        {phase.type === 'psmf' ? (
                          <button type="button" className="action-button-secondary" onClick={() => openScheduleRefeedEditor(phase)}>
                            Schedule refeed
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No upcoming phases scheduled.</p>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Refeed schedule</p>
              <div className="mt-3 space-y-3">
                {selectedPsmfPhaseId === null ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No PSMF phase available for refeed scheduling.</p>
                ) : (
                  <>
                    {showPsmfPhaseSelector ? (
                      <label htmlFor="psmf-phase-selector" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                        PSMF phase
                        <select
                          id="psmf-phase-selector"
                          className="field mt-2"
                          value={selectedPsmfPhaseId ?? ''}
                          onChange={(event) => onSelectPsmfPhase?.(event.target.value || null)}
                        >
                          {selectablePsmfPhases.map((phase) => (
                            <option key={phase.id} value={phase.id}>
                              {buildPsmfPhaseOptionLabel(phase)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selectedPsmfPhase && (selectedPsmfPhase.status === 'active' || selectedPsmfPhase.status === 'planned') ? (
                      <button type="button" className="action-button-secondary" onClick={() => openScheduleRefeedEditor(selectedPsmfPhase)}>
                        Schedule refeed
                      </button>
                    ) : null}
                    {selectedPsmfPhaseRefeeds.length ? (
                      selectedPsmfPhaseRefeeds.map((event) => {
                        const fieldsLocked = isRefeedLocked(event)
                        return (
                          <div
                            key={event.id}
                            className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-slate-950/60"
                          >
                            <p className="font-semibold text-slate-900 dark:text-white">
                              Planned refeed on {formatShortDate(event.date)}
                            </p>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                              {event.calorieTargetOverride} kcal
                            </p>
                            {fieldsLocked ? (
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                Past refeed details are locked after logging begins for that day.
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="action-button-secondary"
                                onClick={(actionEvent) => handleOpenEditRefeed(event, actionEvent.currentTarget)}
                              >
                                Edit refeed
                              </button>
                              {!fieldsLocked && onDeleteRefeed ? (
                                <button
                                  type="button"
                                  className="action-button-secondary"
                                  onClick={() => handleDeleteScheduledRefeed(event.id)}
                                >
                                  Delete refeed
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-300">No refeeds scheduled for this phase.</p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Phase history</p>
              <div className="mt-3 space-y-3">
                {historicalPhases.length ? (
                  historicalPhases.map((phase) => (
                    <div
                      key={phase.id}
                      className="rounded-2xl border border-black/5 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-slate-950/60"
                    >
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {phase.status === 'cancelled' ? 'Cancelled' : 'Completed'} {phase.type === 'psmf' ? 'PSMF' : 'diet break'}: {formatPhaseDateRange(phase)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="action-button-secondary"
                          onClick={(event) => openPhaseNotesEditor(phase, event.currentTarget)}
                        >
                          Edit notes
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">No completed or cancelled phases yet.</p>
                )}
              </div>
            </div>

            {phaseEditorMode === 'start_psmf' || phaseEditorMode === 'edit_planned_phase' ? (
              <div className="space-y-3 rounded-[24px] border border-black/5 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-slate-950/60">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Start date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.startDate}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, startDate: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  End date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.plannedEndDate}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, plannedEndDate: event.target.value }))}
                  />
                </label>
                {phaseEditorMode === 'edit_planned_phase' && editingPlannedPhase?.type === 'diet_break' ? (
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Diet break calories
                    <input
                      className="field mt-2"
                      inputMode="numeric"
                      value={dietPhaseForm.calorieTargetOverride}
                      onChange={(event) => setDietPhaseForm((current) => ({ ...current, calorieTargetOverride: event.target.value }))}
                    />
                  </label>
                ) : null}
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Notes
                  <textarea
                    className="field mt-2 min-h-24"
                    value={dietPhaseForm.notes}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="action-button flex-1"
                    onClick={phaseEditorMode === 'edit_planned_phase' ? handleUpdatePlannedPhaseSubmit : handleStartPsmfSubmit}
                  >
                    {phaseEditorMode === 'edit_planned_phase' ? 'Save phase' : 'Start PSMF phase'}
                  </button>
                  <button type="button" className="action-button-secondary flex-1" onClick={resetPhaseEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {phaseEditorMode === 'extend_phase' ? (
              <div className="space-y-3 rounded-[24px] border border-black/5 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-slate-950/60">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  New end date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.plannedEndDate}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, plannedEndDate: event.target.value }))}
                  />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="action-button flex-1"
                    onClick={() => handleExtendPhaseSubmit(currentPhase)}
                  >
                    Save end date
                  </button>
                  <button type="button" className="action-button-secondary flex-1" onClick={resetPhaseEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {phaseEditorMode === 'start_diet_break' ? (
              <div className="space-y-3 rounded-[24px] border border-black/5 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-slate-950/60">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Start date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.startDate}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, startDate: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  End date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.plannedEndDate}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, plannedEndDate: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Diet break calories
                  <input
                    className="field mt-2"
                    inputMode="numeric"
                    value={dietPhaseForm.calorieTargetOverride}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, calorieTargetOverride: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Notes
                  <textarea
                    className="field mt-2 min-h-24"
                    value={dietPhaseForm.notes}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="button" className="action-button flex-1" onClick={handleStartDietBreakSubmit}>
                    Start diet break
                  </button>
                  <button type="button" className="action-button-secondary flex-1" onClick={resetPhaseEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {phaseEditorMode === 'schedule_refeed' || phaseEditorMode === 'edit_refeed' ? (
              <div className="space-y-3 rounded-[24px] border border-black/5 bg-slate-50/80 px-4 py-4 dark:border-white/10 dark:bg-slate-950/60">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Refeed date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.refeedDate}
                    disabled={phaseEditorMode === 'edit_refeed' && scheduledRefeedFieldsLocked}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, refeedDate: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Refeed calories
                  <input
                    className="field mt-2"
                    inputMode="numeric"
                    value={dietPhaseForm.refeedCalories}
                    disabled={phaseEditorMode === 'edit_refeed' && scheduledRefeedFieldsLocked}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, refeedCalories: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Notes
                  <textarea
                    className="field mt-2 min-h-24"
                    value={dietPhaseForm.refeedNotes}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, refeedNotes: event.target.value }))}
                  />
                </label>
                {phaseEditorMode === 'edit_refeed' && scheduledRefeedFieldsLocked ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Past refeed details are locked after logging begins for that day.
                  </p>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="action-button flex-1"
                    onClick={
                      phaseEditorMode === 'edit_refeed'
                        ? handleUpdateRefeedSubmit
                        : handleScheduleRefeedSubmit
                    }
                  >
                    {phaseEditorMode === 'edit_refeed' ? 'Save refeed changes' : 'Schedule refeed'}
                  </button>
                  <button type="button" className="action-button-secondary flex-1" onClick={resetPhaseEditor}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {phaseActionError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                {phaseActionError}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {settingsForm.goalMode === 'lose' && settingsForm.fatLossMode === 'carb_cycle' ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Carb cycle
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">Schedule high-carb days</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Carb-cycle phases keep higher-carb training days explicit instead of relying on manual toggles.
            </p>
          </div>

          {activeCarbCyclePhase ? (
            <div className="space-y-4 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Active phase
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    Carb cycle until {formatShortDate(activeCarbCyclePhase.plannedEndDate)}
                  </p>
                  {activeCarbCyclePhase.notes ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{activeCarbCyclePhase.notes}</p>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  High-carb date
                  <input
                    type="date"
                    className="field mt-2"
                    value={dietPhaseForm.refeedDate}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, refeedDate: event.target.value }))}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  High-carb calories
                  <input
                    className="field mt-2"
                    inputMode="numeric"
                    value={dietPhaseForm.refeedCalories}
                    onChange={(event) => setDietPhaseForm((current) => ({ ...current, refeedCalories: event.target.value }))}
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Notes
                <textarea
                  className="field mt-2 min-h-24"
                  value={dietPhaseForm.refeedNotes}
                  onChange={(event) => setDietPhaseForm((current) => ({ ...current, refeedNotes: event.target.value }))}
                />
              </label>
              <button type="button" className="action-button w-full" onClick={handleScheduleHighCarbDaySubmit}>
                Schedule high-carb day
              </button>

              {activeCarbCycleHighCarbDays.length ? (
                <div className="space-y-2">
                  {activeCarbCycleHighCarbDays.map((event) => (
                    <div
                      key={event.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-slate-50/90 px-4 py-3 dark:bg-slate-950/50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {formatShortDate(event.date)} • {event.calorieTargetOverride} kcal
                        </p>
                        {event.notes ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{event.notes}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="action-button-secondary"
                        onClick={() => handleDeleteHighCarbDayAction(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[20px] bg-slate-50/90 px-4 py-3 text-sm text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                  No high-carb days scheduled yet.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Start date
                <input
                  type="date"
                  className="field mt-2"
                  value={dietPhaseForm.startDate}
                  onChange={(event) => setDietPhaseForm((current) => ({ ...current, startDate: event.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                End date
                <input
                  type="date"
                  className="field mt-2"
                  value={dietPhaseForm.plannedEndDate}
                  onChange={(event) => setDietPhaseForm((current) => ({ ...current, plannedEndDate: event.target.value }))}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Notes
                <textarea
                  className="field mt-2 min-h-24"
                  value={dietPhaseForm.notes}
                  onChange={(event) => setDietPhaseForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </label>
              <button type="button" className="action-button w-full" onClick={handleStartCarbCycleSubmit}>
                Start carb cycle
              </button>
            </div>
          )}

          {phaseActionError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {phaseActionError}
            </div>
          ) : null}
        </section>
      ) : null}

      {previewPsmfGarminUiState ? (
        <section className="app-card space-y-4 px-4 py-4" data-testid="recovery-section">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Recovery</p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">Recovery</p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Recovery can lower coach confidence and may pause aggressive phases when strain stays high.
          </p>
          <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Recovery: {previewPsmfGarminUiState.recovery?.severity ?? 'green'}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {recoveryCheckInToday ? 'Saved for today.' : 'No recovery check-in for today yet.'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(['energyScore', 'hungerScore', 'sorenessScore', 'sleepQualityScore'] as const).map((key) => (
                <label key={key} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  {key === 'energyScore'
                    ? 'Energy'
                    : key === 'hungerScore'
                      ? 'Hunger'
                      : key === 'sorenessScore'
                        ? 'Soreness'
                        : 'Sleep quality'}
                  <select
                    className="field mt-2"
                    value={recoveryForm[key]}
                    onChange={(event) =>
                      setRecoveryForm((current) => ({
                        ...current,
                        [key]: Number.parseInt(event.target.value, 10) as 1 | 2 | 3 | 4 | 5,
                      }))
                    }
                  >
                    {[1, 2, 3, 4, 5].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Recovery notes
              <textarea
                className="field mt-2 min-h-24"
                value={recoveryForm.notes}
                onChange={(event) => setRecoveryForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            {recoveryActionError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                {recoveryActionError}
              </div>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" className="action-button flex-1" onClick={handleSaveRecovery}>
                Save recovery
              </button>
              {recoveryCheckInToday ? (
                <button type="button" className="action-button-secondary flex-1" onClick={handleDeleteRecovery}>
                  Delete today&apos;s check-in
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {previewPsmfGarminUiState ? (
        <section className="app-card space-y-4 px-4 py-4" data-testid="garmin-section">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Garmin</p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">Connected recovery data</p>
          </div>
          <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            {previewPsmfGarminUiState.garmin?.kind === 'not_enabled' ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Garmin is not enabled in this deployment.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Background sync requires provider credentials, durable server storage, and the production automation worker.
                </p>
              </div>
            ) : previewPsmfGarminUiState.garmin?.kind === 'connected' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Garmin is connected and background automation is active. Fresh wellness snapshots sync into MacroTracker automatically.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Last synced: {previewPsmfGarminUiState.garmin.lastSyncedLabel ?? 'Not yet'}
                </p>
                {previewPsmfGarminUiState.garmin.stale ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Garmin automation is behind. Snapshots older than 6 hours can delay recovery updates until the next successful sync.
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Background sync runs automatically. You only need troubleshooting actions if data stops refreshing.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="action-button-secondary" onClick={onDisconnectGarmin} disabled={garminBusy}>
                    Disconnect
                  </button>
                </div>
                <details className="rounded-[20px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
                    Troubleshooting
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="action-button-secondary" onClick={onSyncGarmin} disabled={garminBusy}>
                      Sync now
                    </button>
                  </div>
                </details>
              </div>
            ) : previewPsmfGarminUiState.garmin?.kind === 'syncing' ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Syncing Garmin data...</p>
            ) : previewPsmfGarminUiState.garmin?.kind === 'rate_limited' ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Garmin background sync is temporarily rate limited. It will resume after{' '}
                  {previewPsmfGarminUiState.garmin.rateLimitedUntilLabel ?? 'later'}.
                </p>
              </div>
            ) : previewPsmfGarminUiState.garmin?.kind === 'reconnect_required' ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Garmin needs to be reconnected before automatic background sync can resume.
                </p>
                <button type="button" className="action-button-secondary" onClick={onConnectGarmin} disabled={garminBusy}>
                  Reconnect Garmin
                </button>
              </div>
            ) : previewPsmfGarminUiState.garmin?.kind === 'error' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  The last Garmin sync failed. Existing imported data is still available and background automation will retry.
                </p>
                <details className="rounded-[20px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
                    Troubleshooting
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="action-button-secondary" onClick={onSyncGarmin} disabled={garminBusy}>
                      Sync now
                    </button>
                  </div>
                </details>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Connect Garmin once. After that, MacroTracker keeps sleep, stress, Body Battery, steps, and cardio snapshots updated automatically in the background.
                </p>
                <button type="button" className="action-button-secondary" onClick={onConnectGarmin} disabled={garminBusy}>
                  Connect Garmin
                </button>
              </div>
            )}
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Imported wellness data provided by Garmin Connect.
            </p>
          </div>
        </section>
      ) : null}

      <section
        ref={thirdPartyHistoryImportSectionRef}
        className="app-card space-y-4 px-4 py-4"
        data-testid="third-party-history-import-section"
      >
        <div ref={setSettingsHubSectionRef('data_sync')} />
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

        {bootstrapSummary && bootstrapResolutionView?.requiresResolution ? (
          <div className="space-y-4 rounded-[26px] border border-amber-200 bg-amber-50/90 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {bootstrapResolutionView.reason === 'post_sign_in_conflict'
                  ? 'Resolution required'
                  : 'Bootstrap required'}
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {bootstrapResolutionView.reason === 'post_sign_in_conflict'
                  ? 'This device already has local synced data. Choose how it should reconcile with the signed-in cloud account before sync can continue.'
                  : 'Local device data and cloud data need a one-time resolution before sync can start.'}
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
                {showLocalSettingsNote ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    Synced settings also count as data on this device.
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 dark:border-amber-500/30 dark:bg-slate-900/40">
                <p className="font-semibold">Cloud</p>
                <p>{bootstrapSummary.cloudCounts.foods} foods</p>
                <p>{bootstrapSummary.cloudCounts.logEntries} log entries</p>
                <p>{bootstrapSummary.cloudCounts.weights} weights</p>
                <p>{bootstrapSummary.cloudCounts.savedMeals} saved meals</p>
                <p>{bootstrapSummary.cloudCounts.recipes} recipes</p>
                <p>{bootstrapSummary.cloudCounts.favoriteFoods} favorite foods</p>
                {showCloudSettingsNote ? (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    Synced settings also count as data in this cloud account.
                  </p>
                ) : null}
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
                onClick={() => bootstrapPrimaryAction?.onClick()}
                disabled={bootstrapPrimaryAction?.disabled ?? true}
              >
                {bootstrapBusy ? 'Working...' : (bootstrapPrimaryAction?.label ?? 'Apply default: unavailable')}
              </button>
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => onApplyBootstrap('useCloudOnThisDevice')}
                disabled={bootstrapBusy}
              >
                Use cloud on this device
              </button>
              {!previewMergeIsPrimary ? (
                <button
                  type="button"
                  className="action-button-secondary"
                  onClick={() => void onPreviewMerge()}
                  disabled={bootstrapBusy}
                >
                  Preview merge
                </button>
              ) : null}
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => onApplyBootstrap('mergeThisDeviceIntoCloud')}
                disabled={bootstrapBusy}
              >
                Merge this device into cloud
              </button>
              {!replaceCloudIsPrimary ? (
                <button
                  type="button"
                  className="action-button-secondary"
                  onClick={() => onApplyBootstrap('replaceCloudWithThisDevice')}
                  disabled={bootstrapBusy}
                >
                  Replace cloud with this device
                </button>
              ) : null}
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

          {diagnosticsSummary.foodTruth ? (
            <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-sm text-slate-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Food truth</p>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Barcode and label trust signals
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <p>Barcode lookups: {diagnosticsSummary.foodTruth.metrics.barcodeLookupCount}</p>
                <p>Lookup success: {diagnosticsSummary.foodTruth.metrics.barcodeLookupSuccessRate}%</p>
                <p>Autolog eligible: {diagnosticsSummary.foodTruth.metrics.exactAutologEligibilityRate}%</p>
                <p>Barcode blocked: {diagnosticsSummary.foodTruth.metrics.barcodeBlockedRate}%</p>
                <p>OCR blocked: {diagnosticsSummary.foodTruth.metrics.ocrBlockedRate}%</p>
                <p>Local re-scan wins: {diagnosticsSummary.foodTruth.metrics.localRescanWinRate}%</p>
              </div>
              {diagnosticsSummary.foodTruth.alerts.length ? (
                <div className="space-y-2">
                  {diagnosticsSummary.foodTruth.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                    >
                      Food truth alert: {alert.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {diagnosticsSummary.lastError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              Last error: {diagnosticsSummary.lastError.message}
            </div>
          ) : null}
        </div>
      </section>

      <div ref={setSettingsHubSectionRef('dashboard')} />
      <section className="app-card px-4 py-4">
        <form
          className="space-y-4"
          data-testid="settings-targets-form"
          onSubmit={handleSettingsSubmit}
        >
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

          {settingsForm.goalMode === 'lose' ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Fat-loss mode</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'standard_cut' as const, label: 'Standard cut' },
                  { value: 'psmf' as const, label: 'PSMF' },
                  { value: 'carb_cycle' as const, label: 'Carb cycle' },
                ]).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      settingsForm.fatLossMode === option.value
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() =>
                      setSettingsForm((currentState) => ({
                        ...currentState,
                        fatLossMode: option.value,
                      }))
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Standard cut allows normal calorie adjustments. PSMF treats protein adherence as primary. Carb cycle keeps cut phases explicit while scheduled high-carb days support training and adherence.
              </p>
            </div>
          ) : null}

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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Coach minimum calories (optional)
                <input
                  className="field mt-2"
                  inputMode="numeric"
                  placeholder="No automatic minimum"
                  value={settingsForm.coachingMinCalories}
                  onChange={(event) =>
                    setSettingsForm((currentState) => ({
                      ...currentState,
                      coachingMinCalories: event.target.value,
                    }))
                  }
                />
                <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">
                  Leave blank for no automatic minimum. If set, automatic calorie decreases will not go below this value.
                </span>
                {showCoachMinimumWarning ? (
                  <span className="mt-2 block text-xs text-amber-700 dark:text-amber-300">
                    Your current target is below this coach minimum. Automatic decreases will not go lower, but your current target will stay unchanged.
                  </span>
                ) : null}
              </label>
            </div>
          </div>

          {FEATURE_FLAGS.nutrientGoalsV1 ? (
            <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  Nutrient goals and focus
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Set nutrient goals to auto, custom, or none, and pin the nutrients that matter on the dashboard.
                </p>
              </div>
              <div className="space-y-3">
                {ADVANCED_NUTRIENT_KEYS.map((key) => {
                  const goal = settings.nutrientGoals?.[key]
                  const mode = goal?.mode ?? 'auto'
                  const pinned = settings.pinnedNutrients?.some((entry) => entry.key === key) ?? false
                  return (
                    <div key={key} className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatNutrientLabel(key)}</p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {pinned ? 'Pinned on dashboard' : 'Not pinned'}
                          </p>
                        </div>
                        <button type="button" className="action-button-secondary" onClick={() => togglePinnedNutrient(key)}>
                          {pinned ? 'Unpin' : 'Pin'}
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {(['auto', 'custom', 'none'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                              mode === option
                                ? 'bg-teal-700 text-white'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                            }`}
                            onClick={() => updateNutrientGoalMode(key, option)}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                      {mode === 'custom' ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Floor
                            <input className="field mt-2" inputMode="decimal" defaultValue={goal?.floor ?? ''} onBlur={(event) => updateNutrientGoalValue(key, 'floor', event.target.value)} />
                          </label>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Target
                            <input className="field mt-2" inputMode="decimal" defaultValue={goal?.target ?? ''} onBlur={(event) => updateNutrientGoalValue(key, 'target', event.target.value)} />
                          </label>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            Ceiling
                            <input className="field mt-2" inputMode="decimal" defaultValue={goal?.ceiling ?? ''} onBlur={(event) => updateNutrientGoalValue(key, 'ceiling', event.target.value)} />
                          </label>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {FEATURE_FLAGS.coachModulesV1 ? (
            <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  Coach modules and fast check-in
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Weekly packets evaluate these modules before generating a recommendation.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['partial_logging', 'Partial logging'],
                  ['fasting', 'Fasting'],
                  ['logging_break', 'Logging break'],
                  ['program_update', 'Program update'],
                ] as const).map(([kind, label]) => (
                  <label key={kind} className="flex items-center justify-between rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-teal-700"
                      checked={settings.coachModuleSettings?.[kind]?.enabled ?? true}
                      onChange={() => toggleCoachModule(kind)}
                    />
                  </label>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                  <span>Enable fast check-in</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-700"
                    checked={settings.fastCheckInPreference?.enabled ?? true}
                    onChange={(event) => updateFastCheckInPreference({ enabled: event.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                  <span>Skip module detail screens</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-700"
                    checked={settings.fastCheckInPreference?.skipModuleDetails ?? true}
                    onChange={(event) => updateFastCheckInPreference({ skipModuleDetails: event.target.checked })}
                  />
                </label>
                <label className="flex items-center justify-between rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                  <span>Show unresolved-module summary after result</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-teal-700"
                    checked={settings.fastCheckInPreference?.postResultModuleSummary ?? true}
                    onChange={(event) => updateFastCheckInPreference({ postResultModuleSummary: event.target.checked })}
                  />
                </label>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Preferred entry point
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['dashboard', 'coach'] as const).map((surface) => (
                    <button
                      key={surface}
                      type="button"
                      className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                        (settings.fastCheckInPreference?.surfaceEntryPoint ?? 'dashboard') === surface
                          ? 'bg-teal-700 text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                      onClick={() => updateFastCheckInPreference({ surfaceEntryPoint: surface })}
                    >
                      {surface === 'dashboard' ? 'Dashboard' : 'Coach'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {FEATURE_FLAGS.cohesionFinishV1 ? (
            <div
              ref={setSettingsHubSectionRef('body_progress')}
              className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70"
            >
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  Reset controls
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Restore the default dashboard, shortcut, and body-progress behaviors without digging through the whole screen.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Dashboard', description: 'Reset layout and hidden sections', action: resetDashboardCustomization },
                  { label: 'Shortcuts', description: 'Reset toolbar style, order, and colors', action: resetLoggingShortcuts },
                  { label: 'Workouts', description: 'Defaults live inside each program card on the workouts screen' },
                  { label: 'Body Progress', description: 'Reset compare preset, pose, and gallery mode', action: resetProgressComparePreferences },
                ].map((section) => (
                  <div key={section.label} className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{section.label}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{section.description}</p>
                    {section.action ? (
                      <button type="button" className="action-button-secondary mt-3 w-full" onClick={() => section.action()}>
                        Reset
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {FEATURE_FLAGS.loggingShortcutsV1 ? (
            <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  Logging shortcuts
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Tune the add-food fast path around barcode, recents, favorites, and saved meals.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ['autologExactBarcodeHits', 'Autolog trusted exact barcode hits'],
                  ['mealAwareLane', 'Show meal-aware lane first'],
                  ['barcodeFirst', 'Show barcode first'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-teal-700"
                      checked={settings.loggingShortcutPreference?.[key] ?? true}
                      onChange={(event) => updateLoggingShortcutPreference({ [key]: event.target.checked })}
                    />
                  </label>
                ))}
              </div>
              {FEATURE_FLAGS.quietSettingsV1 ? (
                <div className="rounded-[22px] border border-black/5 bg-slate-50/90 px-4 py-4 dark:border-white/10 dark:bg-slate-950/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                        Advanced shortcut controls
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        Toolbar style, ranking controls, and shortcut visibility stay tucked away until you need them.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="action-button-secondary"
                      onClick={() => setShowAdvancedLoggingShortcuts((current) => !current)}
                    >
                      {showAdvancedLoggingShortcuts ? 'Hide advanced controls' : 'Show advanced controls'}
                    </button>
                  </div>
                </div>
              ) : null}
              {!FEATURE_FLAGS.quietSettingsV1 || showAdvancedLoggingShortcuts ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([
                      ['prioritizeRecents', 'Prioritize recents'],
                      ['prioritizeFavorites', 'Prioritize favorites'],
                      ['prioritizeSavedMeals', 'Prioritize saved meals'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-teal-700"
                          checked={settings.loggingShortcutPreference?.[key] ?? true}
                          onChange={(event) => updateLoggingShortcutPreference({ [key]: event.target.checked })}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Toolbar style
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {TOOLBAR_STYLE_OPTIONS.map(({ id: toolbarStyle, label, description }) => (
                        <button
                          key={toolbarStyle}
                          type="button"
                          className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                            (settings.loggingToolbarStyle ?? settings.loggingShortcutPreference?.toolbarStyle ?? 'search_barcode') === toolbarStyle
                              ? 'bg-teal-700 text-white'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                          onClick={() => updateLoggingShortcutPreference({ toolbarStyle })}
                        >
                          <span className="block">{label}</span>
                          <span className="mt-1 block text-[11px] font-medium normal-case opacity-80">
                            {description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Visible shortcuts
                    </p>
                    <div className="space-y-2">
                      {toolbarShortcutConfigs.map(
                        (shortcutId, index, orderedIds) => {
                          const shortcut = LOGGING_SHORTCUT_OPTIONS.find((option) => option.id === shortcutId.id)
                          if (!shortcut) {
                            return null
                          }

                          const enabled = shortcutId.visible

                          return (
                            <div
                              key={shortcutId.id}
                              className="rounded-[22px] bg-slate-50/90 px-4 py-3 dark:bg-slate-950/50"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                    {shortcut.label}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {shortcut.description}
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    className="action-button-secondary"
                                    onClick={() => moveLoggingShortcut(shortcutId.id, -1)}
                                    disabled={index === 0}
                                  >
                                    Earlier
                                  </button>
                                  <button
                                    type="button"
                                    className="action-button-secondary"
                                    onClick={() => moveLoggingShortcut(shortcutId.id, 1)}
                                    disabled={index === orderedIds.length - 1}
                                  >
                                    Later
                                  </button>
                                  <button
                                    type="button"
                                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                                      enabled
                                        ? 'bg-teal-700 text-white'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                    }`}
                                    onClick={() => toggleLoggingShortcutEnabled(shortcutId.id)}
                                  >
                                    {enabled ? 'Enabled' : 'Hidden'}
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {TOOLBAR_COLOR_TOKENS.map((colorToken) => (
                                  <button
                                    key={`${shortcutId.id}-${colorToken}`}
                                    type="button"
                                    className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                                      shortcutId.colorToken === colorToken
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                        : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                                    }`}
                                    onClick={() => updateToolbarShortcutConfig(shortcutId.id, { colorToken })}
                                  >
                                    {colorToken}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        },
                      )}
                    </div>
                  </div>
                  <button type="button" className="action-button-secondary w-full" onClick={resetLoggingShortcuts}>
                    Reset shortcut configuration
                  </button>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Top shortcut
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LOGGING_SHORTCUT_OPTIONS.map(({ id: topShortcutId, label }) => (
                        <button
                          key={topShortcutId}
                          type="button"
                          className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                            (settings.loggingShortcutPreference?.topShortcutId ?? 'scanner') === topShortcutId
                              ? 'bg-teal-700 text-white'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                          onClick={() =>
                            updateLoggingShortcutPreference({
                              topShortcutId,
                              enabledShortcutIds: Array.from(
                                new Set([
                                  ...normalizeLoggingShortcutIds(
                                    settings.loggingShortcutPreference?.enabledShortcutIds,
                                  ),
                                  topShortcutId,
                                ]),
                              ) as LoggingShortcutId[],
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {FEATURE_FLAGS.phaseTemplatesV1 ? (
            <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  Phase meal templates
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Map saved meals to serious-cut day types so add-food can offer meal-fill and day-fill actions first.
                </p>
              </div>
              <div className="space-y-3">
                {PHASE_TEMPLATE_DAY_TYPES.map(({ dayType, label, description }) => {
                  const template = settings.phaseMealTemplates?.find((entry) => entry.dayType === dayType && !entry.archivedAt)
                  return (
                    <div key={dayType} className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
                      </div>
                      <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
                        Template label
                        <input
                          className="field mt-2"
                          value={template?.label ?? DEFAULT_PHASE_TEMPLATE_LABELS[dayType]}
                          onChange={(event) => updatePhaseMealTemplateLabel(dayType, event.target.value)}
                        />
                      </label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((meal) => (
                          <label key={`${dayType}-${meal}`} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            {meal}
                            <select
                              className="field mt-2"
                              value={template?.meals.find((entry) => entry.meal === meal)?.savedMealId ?? ''}
                              onChange={(event) => updatePhaseMealTemplateMeal(dayType, meal, event.target.value)}
                            >
                              <option value="">None</option>
                              {savedMeals.map((savedMeal) => (
                                <option key={`${dayType}-${meal}-${savedMeal.id}`} value={savedMeal.id}>
                                  {savedMeal.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {FEATURE_FLAGS.garminIntelligenceV2 ? (
            <div className="space-y-3 rounded-[26px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                  Garmin history surface
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Choose the default Garmin history window for dashboard and body-weight review.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['7d', '30d', '90d'] as const).map((window) => (
                  <button
                    key={window}
                    type="button"
                    className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      (settings.garminHistoryWindow ?? '7d') === window
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() => applyAdvancedSettingsPatch({ garminHistoryWindow: window })}
                  >
                    {window}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {settingsError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {settingsError}
            </div>
          ) : null}

          <button type="button" className="action-button w-full" onClick={applySettingsUpdate}>
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
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Recovery packs include foods, logs, Garmin imports, body progress, workouts, and coaching history.
          </p>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
          <p>
            Last safety snapshot:{' '}
            {safetySummary.lastSnapshotAt ? formatLocalDateTime(safetySummary.lastSnapshotAt) : 'Not captured yet'}
          </p>
          <p className="mt-1">
            Last manual export:{' '}
            {lastExportedAt ? formatLocalDateTime(lastExportedAt) : 'Not exported yet'}
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
          aria-label="Backup import file"
          tabIndex={-1}
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
                {importPreview.counts.foods} foods | {importPreview.counts.weights} weights | {importPreview.counts.logDays} logged days | {importPreview.counts.logEntries} entries
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {importPreview.counts.foodReviewQueue} review items | {importPreview.counts.bodyProgressSnapshots} body snapshots | {importPreview.counts.workoutSessions} workout sessions | {importPreview.counts.garminImportedWeights + importPreview.counts.garminModifierRecords + importPreview.counts.garminWorkoutSummaries} Garmin records
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

        {lastImportRollbackBackup ? (
          <button type="button" className="action-button-secondary w-full" onClick={() => void handleUndoLastImport()}>
            Undo last import
          </button>
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

      <section className="app-card space-y-4 px-4 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Third-party history import
          </p>
          <p className="font-display text-2xl text-slate-900 dark:text-white">
            Backfill from other apps
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div
            ref={macroFactorImportCardRef}
            className="space-y-3 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
            data-testid="macrofactor-history-import-card"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Import MacroFactor history</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Accepts the fixture-backed MacroFactor item-level food-row and weight export shapes.
              </p>
            </div>
            <button
              ref={macroFactorImportButtonRef}
              type="button"
              className="action-button-secondary w-full gap-2"
              data-testid="macrofactor-history-import-button"
              onClick={() => {
                if (pendingAutoOpenRequestIdRef.current) {
                  recordDiagnosticsEvent({
                    eventType: 'cut_os.import_focus_user_preempted',
                    severity: 'info',
                    scope: 'diagnostics',
                    message: 'User manually opened MacroFactor import before delayed auto-open.',
                    payload: {
                      requestId: pendingAutoOpenRequestIdRef.current,
                    },
                  })
                  pendingAutoOpenRequestIdRef.current = null
                }

                macroFactorImportInputRef.current?.click()
              }}
            >
              <Upload className="h-4 w-4" />
              Select MacroFactor files
            </button>
            <input
              ref={macroFactorImportInputRef}
              data-testid="macrofactor-history-input"
              type="file"
              multiple
              accept=".csv,text/csv"
              className="hidden"
              aria-label="MacroFactor history files"
              tabIndex={-1}
              onChange={(event) => {
                const files = event.target.files
                if (!files || files.length === 0) {
                  return
                }

                void handleHistoryImportFiles('macrofactor', files)
              }}
            />
          </div>

          <div
            ref={renphoImportCardRef}
            className="space-y-3 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
            data-testid="renpho-history-import-card"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Import Renpho weights</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Imports weight history only. Body-composition columns are previewed as ignored.
              </p>
            </div>
            <button
              ref={renphoImportButtonRef}
              type="button"
              className="action-button-secondary w-full gap-2"
              data-testid="renpho-history-import-button"
              onClick={() => renphoImportInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Select Renpho file
            </button>
            <input
              ref={renphoImportInputRef}
              data-testid="renpho-history-input"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Renpho history file"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  return
                }

                void handleHistoryImportFiles('renpho', [file])
              }}
            />
          </div>
        </div>

        {historyImportPreview ? (
          <div className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {formatHistoryImportProvider(historyImportPreview.provider)} preview
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {historyImportPreview.counts.logEntries} log entries • {historyImportPreview.counts.weights} weights •{' '}
                {historyImportPreview.counts.supportedFiles} supported file{historyImportPreview.counts.supportedFiles === 1 ? '' : 's'}
              </p>
              {historyImportPreview.dateRange ? (
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {formatShortDate(historyImportPreview.dateRange.start)} to {formatShortDate(historyImportPreview.dateRange.end)}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              Detected files: {historyImportPreview.fileKinds.map((kind) => formatHistoryImportFileKind(kind)).join(', ')}
            </div>

            {FEATURE_FLAGS.paidCutOsV1 && historyImportPreview.macrofactorReplayReport ? (
              <div className="space-y-3 rounded-[24px] border border-teal-200 bg-teal-50/80 px-4 py-4 text-sm text-slate-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-slate-100">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                    Cut OS replay
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {historyImportPreview.macrofactorReplayReport.reconstructedCommands.length} reconstructed command days
                  </p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {historyImportPreview.macrofactorReplayReport.switchingPitch}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {historyImportPreview.macrofactorReplayReport.reconstructedCommands.slice(-4).map((command) => (
                    <div key={`${command.date}:${command.primaryAction}`} className="rounded-2xl bg-white/80 px-3 py-3 dark:bg-slate-950/60">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {formatShortDate(command.date)}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {command.primaryAction}
                      </p>
                    </div>
                  ))}
                </div>
                {historyImportPreview.macrofactorReplayReport.decisionDiffs.length ? (
                  <p className="rounded-2xl bg-white/80 px-3 py-3 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                    {historyImportPreview.macrofactorReplayReport.decisionDiffs.length} imported date
                    {historyImportPreview.macrofactorReplayReport.decisionDiffs.length === 1 ? '' : 's'} overlap local records; local records win in replay.
                  </p>
                ) : null}
              </div>
            ) : null}

            {historyImportPreview.warnings.length > 0 ? (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                {historyImportPreview.warnings.map((warning) => (
                  <p key={`${warning.code}:${warning.fileName ?? warning.message}`}>
                    {warning.fileName ? `${warning.fileName}: ` : ''}
                    {warning.message}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              Import to this device merges logs and weights only. Each new import replaces the single undo snapshot target.
            </div>

            <button type="button" className="action-button w-full" onClick={() => void handleApplyHistoryImport()}>
              Import to this device
            </button>
          </div>
        ) : null}

        {historyImportError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {historyImportError}
          </div>
        ) : null}

        {historyImportSuccess ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
            {historyImportSuccess}
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

      {notesEditorState ? (
        <NotesEditorSheet
          open
          title={notesEditorState.title}
          initialNotes={notesEditorState.initialNotes}
          onClose={handleCloseNotesEditor}
          onSave={handleSaveNotes}
        />
      ) : null}

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
