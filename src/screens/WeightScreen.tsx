import { useEffect, useMemo, useState } from 'react'
import { ScreenHeader } from '../components/ScreenHeader'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { buildBodyProgressQuickCompare } from '../domain/personalCut'
import { WeightChart } from '../components/WeightChart'
import type {
  ActionResult,
  BodyProgressCompareMode,
  CanonicalNutrientKey,
  BodyProgressComparePreset,
  BodyProgressGalleryMode,
  BodyMetricValue,
  BodyProgressSaveRequest,
  BodyProgressSnapshot,
  CheckInRecord,
  CoachingDecisionRecord,
  CoachingReasonCode,
  CutDayPlan,
  DeficiencyAlert,
  FoodContributionRecord,
  LegacyCoachingCode,
  NutritionOverviewBundle,
  NutritionOverviewDay,
  ProgressPhotoPose,
  UserSettings,
  WeightEntry,
  WeightRange,
} from '../types'
import { formatShortDate, getTodayDateKey } from '../utils/dates'
import { buildWeightChartPoints, convertWeight } from '../utils/macros'

interface WeightScreenProps {
  settings: UserSettings
  weights: WeightEntry[]
  currentCheckIn: CheckInRecord | null
  canApplyCheckInTargets: boolean
  checkInHistory: CheckInRecord[]
  coachingDecisionHistory: CoachingDecisionRecord[]
  nutritionOverview?: NutritionOverviewBundle | null
  nutritionOverviewV2Enabled?: boolean
  bodyProgressSnapshots?: BodyProgressSnapshot[]
  cutDayPlan?: CutDayPlan | null
  previewPsmfGarminUiState?: PreviewPsmfGarminUiState | null
  onSaveWeight: (date: string, weight: number, unit: UserSettings['weightUnit']) => ActionResult<void>
  onDeleteWeight: (date: string) => ActionResult<void>
  onApplyCheckInSuggestion: () => void
  onKeepCurrentCheckIn: () => void
  onManualOverrideTargets?: (
    nextSettings: UserSettings,
    reasonCode: CoachingReasonCode | LegacyCoachingCode,
  ) => ActionResult<void>
  onUpdateSettings?: (nextSettings: UserSettings) => ActionResult<void>
  onSaveBodyProgress?: (input: BodyProgressSaveRequest) => Promise<ActionResult<BodyProgressSnapshot>>
  onDeleteBodyProgress?: (snapshotId: string) => Promise<ActionResult<void>>
  onOpenCoach?: () => void
  onOpenSettings?: () => void
}

const RANGE_OPTIONS: WeightRange[] = ['30', '90', 'all']

function formatDisplayWeight(entry: WeightEntry | null, unit: UserSettings['weightUnit']): string {
  if (!entry) {
    return '--'
  }

  return `${convertWeight(entry.weight, entry.unit, unit)} ${unit}`
}

function formatWeeklyRate(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

function formatCalories(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unavailable'
  }

  return `${Math.round(value)} kcal/day`
}

function formatCalorieDelta(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    return 'No calorie change'
  }

  return `${value > 0 ? '+' : ''}${Math.round(value)} kcal/day`
}

function progressStoryToneClass(tone: 'on_track' | 'watch' | 'stalled'): string {
  switch (tone) {
    case 'on_track':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
    case 'stalled':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
  }
}

function formatCompareModeLabel(mode: BodyProgressCompareMode): string {
  return mode === 'overlay' ? 'Overlay' : 'Side by side'
}

function formatGalleryModeLabel(mode: BodyProgressGalleryMode): string {
  return mode === 'before_after' ? 'Before / after' : 'Latest vs compare'
}

function formatScaleContextLabel(
  context: 'neutral' | 'expected_refeed_spike' | 'expected_diet_break_spike' | undefined,
): string {
  if (context === 'expected_refeed_spike') {
    return 'Expected refeed spike'
  }
  if (context === 'expected_diet_break_spike') {
    return 'Expected diet-break spike'
  }
  return 'Neutral scale context'
}

function triggerDownloadFromDataUrl(fileName: string, dataUrl: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  link.click()
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load progress image.'))
    image.src = src
  })
}

async function buildBeforeAfterComposite(beforeSrc: string, afterSrc: string): Promise<string> {
  const [beforeImage, afterImage] = await Promise.all([
    loadImageElement(beforeSrc),
    loadImageElement(afterSrc),
  ])
  const targetWidth = 720
  const targetHeight = 960
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth * 2
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to build before-and-after export.')
  }

  context.fillStyle = '#0f172a'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const drawCover = (image: HTMLImageElement, x: number): void => {
    const imageAspect = image.width / image.height
    const frameAspect = targetWidth / targetHeight
    let sourceWidth = image.width
    let sourceHeight = image.height
    let sourceX = 0
    let sourceY = 0

    if (imageAspect > frameAspect) {
      sourceWidth = image.height * frameAspect
      sourceX = (image.width - sourceWidth) / 2
    } else {
      sourceHeight = image.width / frameAspect
      sourceY = (image.height - sourceHeight) / 2
    }

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, 0, targetWidth, targetHeight)
  }

  drawCover(beforeImage, 0)
  drawCover(afterImage, targetWidth)
  context.fillStyle = 'rgba(15, 23, 42, 0.72)'
  context.fillRect(0, 0, targetWidth, 68)
  context.fillRect(targetWidth, 0, targetWidth, 68)
  context.fillStyle = '#f8fafc'
  context.font = '600 28px ui-sans-serif, system-ui, sans-serif'
  context.fillText('Before', 28, 44)
  context.fillText('After', targetWidth + 28, 44)

  return canvas.toDataURL('image/png')
}

function buildScaleContextFromCutDayPlan(
  cutDayPlan: CutDayPlan | null | undefined,
): 'neutral' | 'expected_refeed_spike' | 'expected_diet_break_spike' {
  if (cutDayPlan?.dayType === 'refeed_day') {
    return 'expected_refeed_spike'
  }
  if (cutDayPlan?.dayType === 'diet_break_day') {
    return 'expected_diet_break_spike'
  }
  return 'neutral'
}

function evidenceToneClass(
  tone: NonNullable<CheckInRecord['weeklyCheckInPacket']>['evidenceCards'][number]['tone'],
): string {
  switch (tone) {
    case 'positive':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
    case 'caution':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function formatDecisionLabel(decisionType: CheckInRecord['decisionType'] | CoachingDecisionRecord['decisionType'] | undefined): string {
  switch (decisionType) {
    case 'increase_calories':
      return 'Increase calories'
    case 'decrease_calories':
      return 'Decrease calories'
    case 'keep_targets':
      return 'Keep targets'
    case 'ignore_period_due_to_confounders':
      return 'Ignore period'
    case 'hold_for_more_data':
      return 'Hold for more data'
    default:
      return 'Decision pending'
  }
}

function formatConfidenceSummary(
  confidenceBand: CheckInRecord['confidenceBand'] | CoachingDecisionRecord['confidenceBand'] | undefined,
  confidenceScore: CheckInRecord['confidenceScore'] | CoachingDecisionRecord['confidenceScore'] | undefined,
): string {
  if (!confidenceBand) {
    return 'Confidence unavailable'
  }

  if (typeof confidenceScore === 'number') {
    return `${confidenceBand} (${confidenceScore}/100)`
  }

  return confidenceBand
}

function hasReasonCode(
  codes: ReadonlyArray<CoachingReasonCode | LegacyCoachingCode> | undefined,
  target: CoachingReasonCode,
): boolean {
  return codes?.includes(target) ?? false
}

function formatDecisionNote(
  codes: ReadonlyArray<CoachingReasonCode | LegacyCoachingCode> | undefined,
  calories?: number,
): string | null {
  if (hasReasonCode(codes, 'personal_floor_applied') && typeof calories === 'number') {
    return `Clamped to your coach minimum: ${calories} kcal`
  }

  if (hasReasonCode(codes, 'psmf_no_further_decrease')) {
    return 'PSMF mode active: no further automatic calorie decrease applied.'
  }

  return null
}

function CheckInStatusBadge({ status }: { status: CheckInRecord['status'] }) {
  const tone =
    status === 'applied'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
      : status === 'kept'
        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
        : status === 'overridden'
          ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200'
        : status === 'ready'
          ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/10 dark:text-teal-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {status}
    </span>
  )
}

interface WeightEntryFormProps {
  date: string
  isToday: boolean
  unit: UserSettings['weightUnit']
  entry: WeightEntry | null
  onSaveWeight: (date: string, weight: number, unit: UserSettings['weightUnit']) => ActionResult<void>
  onDeleteWeight: (date: string) => ActionResult<void>
}

interface PreviewPsmfGarminUiState {
  weight?: {
    supplementalLines?: string[]
    blockedReasonLabels?: string[]
  }
}

type DefaultBodyMetricKey = 'waist' | 'hips' | 'chest' | 'thigh' | 'arm' | 'bodyFatPercent'

interface CustomMetricDraft {
  id: string
  label: string
  value: string
  unit: string
}

const DEFAULT_BODY_METRICS: Array<{
  key: DefaultBodyMetricKey
  label: string
  unit: string
}> = [
  { key: 'waist', label: 'Waist', unit: 'cm' },
  { key: 'hips', label: 'Hips', unit: 'cm' },
  { key: 'chest', label: 'Chest', unit: 'cm' },
  { key: 'thigh', label: 'Thigh', unit: 'cm' },
  { key: 'arm', label: 'Arm', unit: 'cm' },
  { key: 'bodyFatPercent', label: 'Body fat', unit: '%' },
]

const PROGRESS_PHOTO_POSES: ProgressPhotoPose[] = ['front', 'side', 'back']

function formatMetricValue(value: number, unit: NutritionOverviewDay['metrics'][number]['unit']): string {
  if (unit === 'mcg') {
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
  }

  if (unit === 'mg') {
    return `${Math.round(value)} ${unit}`
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
}

function formatCoverageSummary(coveragePercent: number): string {
  return `${Math.round(coveragePercent)}% label coverage`
}

function formatCompletenessSummary(completenessPercent: number): string {
  return `${Math.round(completenessPercent)}% micronutrient completeness`
}

function formatContributionShare(sharePercent: number, calories: number): string {
  return `${Math.round(sharePercent)}% of logged calories • ${Math.round(calories)} kcal`
}

function metricStatusTone(status: NutritionOverviewDay['metrics'][number]['status']): string {
  switch (status) {
    case 'adequate':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
    case 'high':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
    case 'limited':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    default:
      return 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
  }
}

function deficiencyAlertTone(
  severity: DeficiencyAlert['severity'],
): string {
  return severity === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100'
    : 'border-slate-200 bg-slate-50 text-slate-900 dark:border-white/10 dark:bg-slate-950/40 dark:text-white'
}

function createEmptyBodyMetricInputs(): Record<DefaultBodyMetricKey, string> {
  return {
    waist: '',
    hips: '',
    chest: '',
    thigh: '',
    arm: '',
    bodyFatPercent: '',
  }
}

function buildDefaultMetricRecord(snapshot: BodyProgressSnapshot | null): Record<DefaultBodyMetricKey, string> {
  const nextInputs = createEmptyBodyMetricInputs()
  for (const metric of snapshot?.metrics ?? []) {
    if (metric.key in nextInputs) {
      nextInputs[metric.key as DefaultBodyMetricKey] = `${metric.value}`
    }
  }

  return nextInputs
}

function addDays(date: string, delta: number): string {
  const next = new Date(`${date}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + delta)
  return next.toISOString().slice(0, 10)
}

function formatBodyMetricDelta(currentValue: number, compareValue: number, unit: string): string {
  const delta = currentValue - compareValue
  const rounded = Math.abs(delta) >= 10 ? Math.round(delta) : Math.round(delta * 10) / 10
  return `${delta > 0 ? '+' : ''}${rounded} ${unit}`
}

function findClosestSnapshot(
  snapshots: BodyProgressSnapshot[],
  targetDate: string,
): BodyProgressSnapshot | null {
  const sorted = [...snapshots].sort((left, right) =>
    Math.abs(new Date(`${left.date}T00:00:00.000Z`).getTime() - new Date(`${targetDate}T00:00:00.000Z`).getTime()) -
    Math.abs(new Date(`${right.date}T00:00:00.000Z`).getTime() - new Date(`${targetDate}T00:00:00.000Z`).getTime()),
  )
  return sorted[0] ?? null
}

function WeightEntryForm({
  date,
  isToday,
  unit,
  entry,
  onSaveWeight,
  onDeleteWeight,
}: WeightEntryFormProps) {
  const [weightInput, setWeightInput] = useState(() =>
    entry ? `${convertWeight(entry.weight, entry.unit, unit)}` : '',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const saveLabel = isToday ? "Save today's weight" : `Save weight for ${date}`
  const deleteLabel = isToday ? 'Clear today' : `Delete ${date}`

  function saveCurrentWeight(): void {
    const parsedWeight = Number.parseFloat(weightInput)
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setErrorMessage('Enter a valid weight before saving.')
      return
    }

    const saveResult = onSaveWeight(date, parsedWeight, unit)
    if (!saveResult.ok) {
      setErrorMessage(saveResult.error.message)
      return
    }

    setErrorMessage(null)
  }

  function handleSaveWeight(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    saveCurrentWeight()
  }

  return (
    <form className="space-y-3" onSubmit={handleSaveWeight}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Weight ({unit})
        <input
          className="field mt-2"
          inputMode="decimal"
          value={weightInput}
          onChange={(event) => setWeightInput(event.target.value)}
          placeholder={`Enter ${unit}`}
        />
      </label>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <div
        className="flex flex-col gap-3 sm:flex-row"
        style={{ scrollMarginBottom: 'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 8.5rem))' }}
      >
        <button type="button" className="action-button flex-1" aria-label={saveLabel} onClick={saveCurrentWeight}>
          {saveLabel}
        </button>
        <button
          type="button"
          className="action-button-secondary flex-1"
          onClick={() => {
            const deleteResult = onDeleteWeight(date)
            if (!deleteResult.ok) {
              setErrorMessage(deleteResult.error.message)
              return
            }

            setErrorMessage(null)
            setWeightInput('')
          }}
          disabled={!entry}
          aria-label={deleteLabel}
        >
          {deleteLabel}
        </button>
      </div>
    </form>
  )
}

export function WeightScreen({
  settings,
  weights,
  currentCheckIn,
  canApplyCheckInTargets,
  checkInHistory,
  coachingDecisionHistory,
  nutritionOverview,
  nutritionOverviewV2Enabled = false,
  bodyProgressSnapshots = [],
  cutDayPlan = null,
  previewPsmfGarminUiState,
  onSaveWeight,
  onDeleteWeight,
  onApplyCheckInSuggestion,
  onKeepCurrentCheckIn,
  onManualOverrideTargets,
  onUpdateSettings,
  onSaveBodyProgress,
  onDeleteBodyProgress,
  onOpenCoach,
  onOpenSettings,
}: WeightScreenProps) {
  const today = getTodayDateKey()
  const todayEntry = weights.find((entry) => entry.date === today) ?? null
  const latestEntry = weights[0] ?? null
  const [selectedRange, setSelectedRange] = useState<WeightRange>('30')
  const [editorDate, setEditorDate] = useState(today)
  const [showOverrideEditor, setShowOverrideEditor] = useState(false)
  const [overrideCalorieTarget, setOverrideCalorieTarget] = useState(`${settings.calorieTarget}`)
  const [overrideProteinTarget, setOverrideProteinTarget] = useState(`${settings.proteinTarget}`)
  const [overrideCarbTarget, setOverrideCarbTarget] = useState(`${settings.carbTarget}`)
  const [overrideFatTarget, setOverrideFatTarget] = useState(`${settings.fatTarget}`)
  const [overrideReasonCode, setOverrideReasonCode] = useState<CoachingReasonCode | LegacyCoachingCode>('coach_override')
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [bodyMetricInputs, setBodyMetricInputs] = useState<Record<DefaultBodyMetricKey, string>>(
    createEmptyBodyMetricInputs,
  )
  const [customMetrics, setCustomMetrics] = useState<CustomMetricDraft[]>([])
  const [bodyProgressNote, setBodyProgressNote] = useState('')
  const [pendingPhotoFiles, setPendingPhotoFiles] = useState<Partial<Record<ProgressPhotoPose, File>>>({})
  const [clearedPhotoPoses, setClearedPhotoPoses] = useState<ProgressPhotoPose[]>([])
  const [bodyProgressSaving, setBodyProgressSaving] = useState(false)
  const [bodyProgressError, setBodyProgressError] = useState<string | null>(null)
  const [bodyProgressComparePreset, setBodyProgressComparePreset] =
    useState<BodyProgressComparePreset>(settings.bodyProgressFocusState?.comparePreset ?? 'same_day')
  const [bodyProgressCompareMode, setBodyProgressCompareMode] = useState<BodyProgressCompareMode>(
    settings.bodyProgressFocusState?.compareMode ?? 'side_by_side',
  )
  const [bodyProgressGalleryMode, setBodyProgressGalleryMode] = useState<BodyProgressGalleryMode>(
    settings.bodyProgressFocusState?.galleryMode ?? 'latest_vs_compare',
  )
  const [selectedCapturePose, setSelectedCapturePose] = useState<ProgressPhotoPose>(
    settings.bodyProgressFocusState?.lastSelectedPose ?? 'front',
  )
  const [customCompareDate, setCustomCompareDate] = useState('')
  const [showAdvancedBodyProgress, setShowAdvancedBodyProgress] = useState(false)

  const chartPoints = buildWeightChartPoints(weights, selectedRange, settings.weightUnit)
  const latestTrend = [...chartPoints].reverse().find((point) => point.trend !== null)?.trend ?? null
  const editingEntry = useMemo(
    () => weights.find((entry) => entry.date === editorDate) ?? null,
    [editorDate, weights],
  )
  const editingBodyProgressSnapshot = useMemo(
    () => bodyProgressSnapshots.find((snapshot) => snapshot.date === editorDate) ?? null,
    [bodyProgressSnapshots, editorDate],
  )
  const hiddenMetricKeys = useMemo(
    () =>
      new Set(
        (settings.bodyMetricVisibility ?? [])
          .filter((entry) => entry.visible === false)
          .map((entry) => entry.key),
      ),
    [settings.bodyMetricVisibility],
  )
  const photoVisibility = settings.progressPhotoVisibility ?? {
    front: true,
    side: true,
    back: true,
  }
  const visibleBodyProgressSnapshots = useMemo(
    () =>
      bodyProgressSnapshots.map((snapshot) => ({
        ...snapshot,
        metrics: snapshot.metrics.filter((metric) => !hiddenMetricKeys.has(metric.key)),
        photos: snapshot.photos.filter((photo) => photoVisibility[photo.pose] !== false),
      })),
    [bodyProgressSnapshots, hiddenMetricKeys, photoVisibility],
  )
  const latestBodyProgressSnapshot = visibleBodyProgressSnapshots[0] ?? null
  const bodyProgressGallery = useMemo(
    () =>
      visibleBodyProgressSnapshots.flatMap((snapshot) =>
        snapshot.photos.map((photo) => ({
          snapshotId: snapshot.id,
          photoId: photo.id,
          pose: photo.pose,
          date: snapshot.date,
          fileName: photo.fileName,
          dataUrl: photo.dataUrl,
        })),
      ),
    [visibleBodyProgressSnapshots],
  )
  const visibleBodyMetricCatalog = useMemo(() => {
    const metricMap = new Map<string, string>()
    for (const metric of DEFAULT_BODY_METRICS) {
      metricMap.set(metric.key, metric.label)
    }
    for (const snapshot of bodyProgressSnapshots) {
      for (const metric of snapshot.metrics) {
        if (!metricMap.has(metric.key)) {
          metricMap.set(metric.key, metric.label)
        }
      }
    }

    return [...metricMap.entries()].map(([key, label]) => ({ key, label }))
  }, [bodyProgressSnapshots])
  const focusedBodyMetricKey =
    settings.bodyProgressFocusState?.focusedMetricKey ??
    visibleBodyMetricCatalog.find((metric) => !hiddenMetricKeys.has(metric.key))?.key
  const focusedBodyMetricTrend = useMemo(
    () =>
      focusedBodyMetricKey
        ? visibleBodyProgressSnapshots
            .flatMap((snapshot) => {
              const metric = snapshot.metrics.find((entry) => entry.key === focusedBodyMetricKey)
              return metric
                ? [
                    {
                      snapshotId: snapshot.id,
                      date: snapshot.date,
                      label: metric.label,
                      unit: metric.unit,
                      value: metric.value,
                    },
                  ]
                : []
            })
        : [],
    [focusedBodyMetricKey, visibleBodyProgressSnapshots],
  )
  const focusedNutrientDrilldown = useMemo(
    () =>
      nutritionOverview?.drilldowns.find(
        (drilldown) =>
          drilldown.key === (settings.focusedNutrientKey ?? nutritionOverview.focusedNutrientKey),
      ) ?? null,
    [nutritionOverview, settings.focusedNutrientKey],
  )
  const compareBodyProgressSnapshot = useMemo(() => {
    if (!latestBodyProgressSnapshot) {
      return null
    }

    if (bodyProgressComparePreset === 'same_day') {
      return latestBodyProgressSnapshot
    }

    if (bodyProgressComparePreset === 'custom') {
      return customCompareDate
        ? visibleBodyProgressSnapshots.find((snapshot) => snapshot.date === customCompareDate) ?? null
        : null
    }

    const offset = bodyProgressComparePreset === '7d' ? -7 : -30
    return findClosestSnapshot(visibleBodyProgressSnapshots.slice(1), addDays(latestBodyProgressSnapshot.date, offset))
  }, [bodyProgressComparePreset, customCompareDate, latestBodyProgressSnapshot, visibleBodyProgressSnapshots])
  const compareMetricDeltas = useMemo(() => {
    if (!latestBodyProgressSnapshot || !compareBodyProgressSnapshot || latestBodyProgressSnapshot.id === compareBodyProgressSnapshot.id) {
      return []
    }

    return latestBodyProgressSnapshot.metrics
      .map((metric) => {
        const compareMetric = compareBodyProgressSnapshot.metrics.find(
          (entry) => entry.key === metric.key && entry.unit === metric.unit,
        )
        if (!compareMetric) {
          return null
        }

        return {
          key: metric.key,
          label: metric.label,
          unit: metric.unit,
          currentValue: metric.value,
          compareValue: compareMetric.value,
          deltaLabel: formatBodyMetricDelta(metric.value, compareMetric.value, metric.unit),
        }
      })
      .filter((metric): metric is NonNullable<typeof metric> => metric !== null)
  }, [compareBodyProgressSnapshot, latestBodyProgressSnapshot])
  const bodyProgressQuickCompare = useMemo(
    () =>
      FEATURE_FLAGS.progressStoryV1
        ? buildBodyProgressQuickCompare({
            latestSnapshot: latestBodyProgressSnapshot,
            compareSnapshot: compareBodyProgressSnapshot,
            pose: selectedCapturePose,
            preset: bodyProgressComparePreset,
            compareMode: bodyProgressCompareMode,
            galleryMode: bodyProgressGalleryMode,
            focusedMetricKey: focusedBodyMetricKey,
            scaleContext: buildScaleContextFromCutDayPlan(cutDayPlan),
            weights,
          })
        : null,
    [
      bodyProgressCompareMode,
      bodyProgressGalleryMode,
      bodyProgressComparePreset,
      compareBodyProgressSnapshot,
      cutDayPlan,
      focusedBodyMetricKey,
      latestBodyProgressSnapshot,
      selectedCapturePose,
      weights,
    ],
  )
  const recentDelta =
    weights.length >= 2
      ? Math.round(
          (convertWeight(weights[0].weight, weights[0].unit, settings.weightUnit) -
            convertWeight(
              weights[Math.min(6, weights.length - 1)].weight,
              weights[Math.min(6, weights.length - 1)].unit,
              settings.weightUnit,
            )) *
            100,
        ) / 100
      : null
  const shouldShowActionButtons =
    currentCheckIn && (currentCheckIn.status === 'ready' || currentCheckIn.status === 'insufficientData')
  const renderLegacyWeeklyCheckInBlocks = false

  // Reset the editor draft whenever the selected snapshot or persisted compare preferences change.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setBodyMetricInputs(buildDefaultMetricRecord(editingBodyProgressSnapshot))
    setCustomMetrics(
      (editingBodyProgressSnapshot?.metrics ?? [])
        .filter((metric) => !DEFAULT_BODY_METRICS.some((defaultMetric) => defaultMetric.key === metric.key))
        .map((metric) => ({
          id: crypto.randomUUID(),
          label: metric.label,
          value: `${metric.value}`,
          unit: metric.unit,
        })),
    )
    setBodyProgressNote(editingBodyProgressSnapshot?.note ?? '')
    setPendingPhotoFiles({})
    setClearedPhotoPoses([])
    setBodyProgressError(null)
  }, [editingBodyProgressSnapshot, editorDate])

  useEffect(() => {
    setBodyProgressComparePreset(settings.bodyProgressFocusState?.comparePreset ?? 'same_day')
  }, [settings.bodyProgressFocusState?.comparePreset])

  useEffect(() => {
    setBodyProgressCompareMode(settings.bodyProgressFocusState?.compareMode ?? 'side_by_side')
  }, [settings.bodyProgressFocusState?.compareMode])

  useEffect(() => {
    setBodyProgressGalleryMode(settings.bodyProgressFocusState?.galleryMode ?? 'latest_vs_compare')
  }, [settings.bodyProgressFocusState?.galleryMode])

  useEffect(() => {
    setSelectedCapturePose(settings.bodyProgressFocusState?.lastSelectedPose ?? 'front')
  }, [settings.bodyProgressFocusState?.lastSelectedPose])
  /* eslint-enable react-hooks/set-state-in-effect */

  function openOverrideEditor(): void {
    setOverrideCalorieTarget(`${settings.calorieTarget}`)
    setOverrideProteinTarget(`${settings.proteinTarget}`)
    setOverrideCarbTarget(`${settings.carbTarget}`)
    setOverrideFatTarget(`${settings.fatTarget}`)
    setOverrideReasonCode('coach_override')
    setOverrideError(null)
    setShowOverrideEditor(true)
  }

  function closeOverrideEditor(): void {
    setShowOverrideEditor(false)
    setOverrideError(null)
  }

  function updateSurfaceSettings(patch: Partial<UserSettings>): void {
    if (!onUpdateSettings) {
      return
    }

    const result = onUpdateSettings({
      ...settings,
      ...patch,
    })
    if (!result.ok) {
      setBodyProgressError(result.error.message)
      return
    }

    setBodyProgressError(null)
  }

  function buildBodyProgressFocusPatch(
    patch: Partial<NonNullable<UserSettings['bodyProgressFocusState']>>,
  ): NonNullable<UserSettings['bodyProgressFocusState']> {
    return {
      focusedMetricKey: settings.bodyProgressFocusState?.focusedMetricKey,
      comparePreset: bodyProgressComparePreset,
      lastSelectedPose: settings.bodyProgressFocusState?.lastSelectedPose ?? selectedCapturePose,
      compareMode: settings.bodyProgressFocusState?.compareMode ?? bodyProgressCompareMode,
      galleryMode: settings.bodyProgressFocusState?.galleryMode ?? bodyProgressGalleryMode,
      ...patch,
    }
  }

  function toggleBodyMetricVisibility(metricKey: string): void {
    const currentVisibility = settings.bodyMetricVisibility ?? []
    const existing = currentVisibility.find((entry) => entry.key === metricKey)
    const nextVisible = !(existing?.visible ?? true)
    const nextVisibility = existing
      ? currentVisibility.map((entry) =>
          entry.key === metricKey
            ? {
                ...entry,
                visible: nextVisible,
                updatedAt: new Date().toISOString(),
              }
            : entry,
        )
      : [
          ...currentVisibility,
          {
            key: metricKey,
            visible: nextVisible,
            updatedAt: new Date().toISOString(),
          },
        ]

    updateSurfaceSettings({ bodyMetricVisibility: nextVisibility })
  }

  function toggleProgressPhotoVisibility(pose: ProgressPhotoPose): void {
    updateSurfaceSettings({
      progressPhotoVisibility: {
        ...(settings.progressPhotoVisibility ?? { front: true, side: true, back: true }),
        [pose]: photoVisibility[pose] === false,
      },
    })
  }

  function handleSetBodyProgressComparePreset(nextPreset: BodyProgressComparePreset): void {
    setBodyProgressComparePreset(nextPreset)
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        comparePreset: nextPreset,
      }),
    })
  }

  function handleSetFocusedBodyMetric(metricKey: string): void {
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        focusedMetricKey: metricKey,
      }),
    })
  }

  function handleSetFocusedNutrient(metricKey: CanonicalNutrientKey): void {
    updateSurfaceSettings({
      focusedNutrientKey: metricKey,
    })
  }

  function setCapturePoseFocus(pose: ProgressPhotoPose): void {
    setSelectedCapturePose(pose)
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        lastSelectedPose: pose,
      }),
    })
  }

  function handleSetCompareMode(compareMode: BodyProgressCompareMode): void {
    setBodyProgressCompareMode(compareMode)
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        compareMode,
      }),
    })
  }

  function handleSetGalleryMode(galleryMode: BodyProgressGalleryMode): void {
    setBodyProgressGalleryMode(galleryMode)
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        galleryMode,
      }),
    })
  }

  async function handleShareBeforeAfter(): Promise<void> {
    if (
      !bodyProgressQuickCompare?.shareEnabled ||
      !bodyProgressQuickCompare.comparePhotoDataUrl ||
      !bodyProgressQuickCompare.latestPhotoDataUrl
    ) {
      setBodyProgressError(`Before-and-after share needs a matching ${selectedCapturePose} photo.`)
      return
    }

    try {
      const compositeDataUrl = await buildBeforeAfterComposite(
        bodyProgressQuickCompare.comparePhotoDataUrl,
        bodyProgressQuickCompare.latestPhotoDataUrl,
      )
      const fileName = `before-after-${selectedCapturePose}-${bodyProgressQuickCompare.compareDate ?? 'compare'}-${bodyProgressQuickCompare.latestDate ?? 'latest'}.png`
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof fetch === 'function'
      ) {
        const response = await fetch(compositeDataUrl)
        const blob = await response.blob()
        const file = new File([blob], fileName, { type: 'image/png' })
        const canShare =
          typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
        if (canShare) {
          await navigator.share({
            files: [file],
            title: 'Before and after',
            text: 'Body progress before-and-after compare',
          })
          setBodyProgressError(null)
          return
        }
      }

      triggerDownloadFromDataUrl(fileName, compositeDataUrl)
      setBodyProgressError(null)
    } catch (error) {
      setBodyProgressError(error instanceof Error ? error.message : 'Unable to build before-and-after export.')
    }
  }

  function renderContributorRecord(contributor: FoodContributionRecord): React.ReactNode {
    return (
      <div
        key={contributor.id}
        className="rounded-[22px] border border-black/5 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{contributor.name}</p>
            {contributor.brand ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">{contributor.brand}</p>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatContributionShare(contributor.sharePercent, contributor.calories)}
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Covers {contributor.nutrientLabels.slice(0, 4).join(', ') || 'no labeled micronutrients'}
        </p>
      </div>
    )
  }

  function renderDeficiencyAlert(alert: DeficiencyAlert): React.ReactNode {
    return (
      <div
        key={alert.id}
        className={`rounded-[22px] border px-4 py-3 ${deficiencyAlertTone(alert.severity)}`}
      >
        <p className="text-xs uppercase tracking-[0.14em] opacity-80">{alert.window}</p>
        <p className="mt-1 text-sm font-semibold">{alert.title}</p>
        <p className="mt-1 text-xs opacity-90">{alert.message}</p>
      </div>
    )
  }

  function renderNutritionOverviewWindow(window: NutritionOverviewDay): React.ReactNode {
    if (window.trackedDays === 0) {
      return (
        <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {window.label}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            No logged intake or explicit fasting data was available in this window yet.
          </p>
        </div>
      )
    }

    return (
      <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {window.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {window.trackedDays} tracked day{window.trackedDays === 1 ? '' : 's'}
            </p>
            {nutritionOverviewV2Enabled ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatCompletenessSummary(window.completenessPercent)}
              </p>
            ) : null}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{window.totalCalories} kcal</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {window.metrics.map((metric) => (
            <div
              key={`${window.label}-${metric.key}`}
              className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-950/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                    {formatMetricValue(metric.value, metric.unit)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${metricStatusTone(metric.status)}`}
                >
                  {metric.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Target {formatMetricValue(metric.target, metric.unit)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatCoverageSummary(metric.coveragePercent)}
              </p>
            </div>
          ))}
        </div>
        {nutritionOverviewV2Enabled && window.deficiencyAlerts.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Deficiency alerts
            </p>
            <div className="space-y-2">{window.deficiencyAlerts.map((alert) => renderDeficiencyAlert(alert))}</div>
          </div>
        ) : null}
        {nutritionOverviewV2Enabled && window.contributors.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Top contributors
            </p>
            <div className="space-y-2">
              {window.contributors.map((contributor) => renderContributorRecord(contributor))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  function renderPinnedNutrientCard(metric: NutritionOverviewBundle['pinnedMetrics'][number]): React.ReactNode {
    const goalSummary =
      metric.goalMode === 'custom'
        ? [metric.floor ? `floor ${formatMetricValue(metric.floor, metric.unit)}` : null, metric.target ? `target ${formatMetricValue(metric.target, metric.unit)}` : null, metric.ceiling ? `ceiling ${formatMetricValue(metric.ceiling, metric.unit)}` : null]
            .filter(Boolean)
            .join(' • ')
        : metric.goalMode === 'none'
          ? 'Tracking only'
          : metric.target
            ? `Auto target ${formatMetricValue(metric.target, metric.unit)}`
            : 'Auto goal'

    return (
      <div key={metric.key} className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {metric.label}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
              {formatMetricValue(metric.value, metric.unit)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${metricStatusTone(metric.status)}`}>
            {metric.status}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{goalSummary}</p>
      </div>
    )
  }

  function renderWeeklyCheckInPacket(): React.ReactNode {
    if (!currentCheckIn?.weeklyCheckInPacket) {
      return null
    }

    const packet = currentCheckIn.weeklyCheckInPacket

    return (
      <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Recommendation evidence
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Structured coach packet for this completed check-in window.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {packet.source}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-950/60">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Estimated TDEE
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {formatCalories(packet.energyModel.estimatedTdee)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-950/60">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Average intake
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {formatCalories(packet.energyModel.averageLoggedCalories)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-950/60">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Target delta
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {formatCalorieDelta(packet.targetDelta)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {packet.interventions?.length ? (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                    Intervention
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {packet.interventions[0]?.title}
                  </p>
                </div>
                <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:bg-slate-950/60 dark:text-amber-300">
                  {packet.interventions[0]?.severity}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {packet.interventions[0]?.summary}
              </p>
              {packet.interventions[0]?.reasons.length ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {packet.interventions[0].reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {packet.evidenceCards.map((card) => (
            <div
              key={card.id}
              className="rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {card.title}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {card.summary}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${evidenceToneClass(card.tone)}`}
                >
                  {card.tone}
                </span>
              </div>
              {card.details.length ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {card.details.map((detail) => (
                    <li key={`${card.id}-${detail}`}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    )
  }

  function updateBodyMetricInput(key: DefaultBodyMetricKey, value: string): void {
    setBodyMetricInputs((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function addCustomMetricRow(): void {
    setCustomMetrics((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: '',
        value: '',
        unit: 'cm',
      },
    ])
  }

  function updateCustomMetricRow(
    metricId: string,
    field: keyof CustomMetricDraft,
    value: string,
  ): void {
    setCustomMetrics((current) =>
      current.map((metric) =>
        metric.id === metricId
          ? {
              ...metric,
              [field]: value,
            }
          : metric,
      ),
    )
  }

  function removeCustomMetricRow(metricId: string): void {
    setCustomMetrics((current) => current.filter((metric) => metric.id !== metricId))
  }

  function setPendingPhotoFile(pose: ProgressPhotoPose, file: File | null): void {
    setSelectedCapturePose(pose)
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        lastSelectedPose: pose,
      }),
    })
    setPendingPhotoFiles((current) => {
      const nextFiles = { ...current }
      if (file) {
        nextFiles[pose] = file
      } else {
        delete nextFiles[pose]
      }
      return nextFiles
    })
    setClearedPhotoPoses((current) => current.filter((currentPose) => currentPose !== pose))
  }

  function toggleClearedPhotoPose(pose: ProgressPhotoPose): void {
    setSelectedCapturePose(pose)
    updateSurfaceSettings({
      bodyProgressFocusState: buildBodyProgressFocusPatch({
        lastSelectedPose: pose,
      }),
    })
    setClearedPhotoPoses((current) =>
      current.includes(pose)
        ? current.filter((currentPose) => currentPose !== pose)
        : [...current, pose],
    )
    setPendingPhotoFiles((current) => {
      const nextFiles = { ...current }
      delete nextFiles[pose]
      return nextFiles
    })
  }

  function buildBodyMetricPayload(): BodyMetricValue[] {
    const defaultMetrics = DEFAULT_BODY_METRICS.flatMap((metric) => {
      const rawValue = bodyMetricInputs[metric.key].trim()
      if (!rawValue) {
        return []
      }

      const parsedValue = Number.parseFloat(rawValue)
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return []
      }

      return [
        {
          key: metric.key,
          label: metric.label,
          unit: metric.unit,
          value: parsedValue,
        } satisfies BodyMetricValue,
      ]
    })

    const customMetricValues = customMetrics.flatMap((metric) => {
      const label = metric.label.trim()
      const unit = metric.unit.trim()
      const parsedValue = Number.parseFloat(metric.value)
      if (!label || !unit || !Number.isFinite(parsedValue) || parsedValue <= 0) {
        return []
      }

      return [
        {
          key: `custom:${label.toLowerCase().replace(/\s+/g, '_')}`,
          label,
          unit,
          value: parsedValue,
        } satisfies BodyMetricValue,
      ]
    })

    return [...defaultMetrics, ...customMetricValues]
  }

  async function handleSaveBodyProgress(): Promise<void> {
    if (!onSaveBodyProgress) {
      return
    }

    const metrics = buildBodyMetricPayload()
    const hasExistingPhotos = Boolean(editingBodyProgressSnapshot?.photos.length)
    const hasPendingPhotos = Object.values(pendingPhotoFiles).some((file) => file instanceof File)
    if (!metrics.length && !bodyProgressNote.trim() && !hasExistingPhotos && !hasPendingPhotos) {
      setBodyProgressError('Add at least one metric, note, or progress photo before saving.')
      return
    }

    setBodyProgressSaving(true)
    const result = await onSaveBodyProgress({
      date: editorDate,
      metrics,
      note: bodyProgressNote.trim() || undefined,
      clearedPoses: clearedPhotoPoses,
      photosByPose: pendingPhotoFiles,
    })
    setBodyProgressSaving(false)
    if (!result.ok) {
      setBodyProgressError(result.error.message)
      return
    }

    setBodyProgressError(null)
    setPendingPhotoFiles({})
    setClearedPhotoPoses([])
  }

  async function handleDeleteBodyProgressSnapshot(): Promise<void> {
    if (!editingBodyProgressSnapshot || !onDeleteBodyProgress) {
      return
    }

    setBodyProgressSaving(true)
    const result = await onDeleteBodyProgress(editingBodyProgressSnapshot.id)
    setBodyProgressSaving(false)
    if (!result.ok) {
      setBodyProgressError(result.error.message)
      return
    }

    setBodyProgressError(null)
  }

  function renderBodyProgressSection(): React.ReactNode {
    if (!onSaveBodyProgress) {
      return null
    }

    const capturePoseOrder = [
      selectedCapturePose,
      ...PROGRESS_PHOTO_POSES.filter((pose) => pose !== selectedCapturePose),
    ]
    const waistTrend = visibleBodyProgressSnapshots.flatMap((snapshot) => {
      const metric = snapshot.metrics.find((entry) => entry.key === 'waist')
      return metric
        ? [
            {
              snapshotId: snapshot.id,
              date: snapshot.date,
              label: metric.label,
              unit: metric.unit,
              value: metric.value,
            },
          ]
        : []
    })
    const comparePresetLabel =
      bodyProgressComparePreset === 'same_day'
        ? 'Same day'
        : bodyProgressComparePreset === '7d'
          ? '7 days'
          : bodyProgressComparePreset === '30d'
            ? '30 days'
            : 'Custom'
    const showAdvancedBodyProgressControls =
      !FEATURE_FLAGS.quietSettingsV1 || showAdvancedBodyProgress

    return (
      <section className="app-card space-y-4 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Body progress
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              Metrics and progress photos
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Save measurements and front, side, and back photos for the date in the editor above.
            </p>
          </div>
          {editingBodyProgressSnapshot ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Saved {formatShortDate(editingBodyProgressSnapshot.date)}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[22px] bg-slate-50/90 px-4 py-3 text-sm text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
          <span className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Capture focus
          </span>
          {capturePoseOrder.map((pose) => {
            const active = pose === selectedCapturePose
            return (
              <button
                key={pose}
                type="button"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-white/10'
                }`}
                onClick={() => setCapturePoseFocus(pose)}
              >
                {pose}
              </button>
            )
          })}
          <span>Remembered for the next capture.</span>
        </div>

        {FEATURE_FLAGS.quietSettingsV1 ? (
          <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Advanced body-progress controls
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Keep visibility, custom metrics, and focus tuning tucked away until you need them.
                </p>
              </div>
              <button
                type="button"
                className="action-button-secondary"
                onClick={() => setShowAdvancedBodyProgress((current) => !current)}
              >
                {showAdvancedBodyProgressControls ? 'Hide advanced controls' : 'Show advanced controls'}
              </button>
            </div>
          </div>
        ) : null}

        {showAdvancedBodyProgressControls && FEATURE_FLAGS.bodyMetricVisibilityV1 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Visible metrics
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Hide or restore any body metric from compare, history, and trend review surfaces.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleBodyMetricCatalog.map((metric) => {
                  const visible = !hiddenMetricKeys.has(metric.key)
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        visible
                          ? 'bg-teal-700 text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                      onClick={() => toggleBodyMetricVisibility(metric.key)}
                    >
                      {metric.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Visible photo poses
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Control which photo poses appear in compare, history, and gallery views.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {PROGRESS_PHOTO_POSES.map((pose) => {
                  const visible = photoVisibility[pose] !== false
                  return (
                    <button
                      key={pose}
                      type="button"
                      className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        visible
                          ? 'bg-teal-700 text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                      onClick={() => toggleProgressPhotoVisibility(pose)}
                    >
                      {pose}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}

        {showAdvancedBodyProgressControls &&
        FEATURE_FLAGS.bodyMetricVisibilityV1 &&
        focusedBodyMetricTrend.length ? (
          <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Metric focus
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Review one metric over time without digging through every snapshot manually.
                </p>
              </div>
              <select
                className="field sm:max-w-xs"
                value={focusedBodyMetricKey ?? ''}
                onChange={(event) => handleSetFocusedBodyMetric(event.target.value)}
              >
                {visibleBodyMetricCatalog
                  .filter((metric) => !hiddenMetricKeys.has(metric.key))
                  .map((metric) => (
                    <option key={metric.key} value={metric.key}>
                      {metric.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-3 lg:grid-cols-4">
              {focusedBodyMetricTrend.slice(0, 8).map((point) => (
                <div key={point.snapshotId} className="rounded-[22px] bg-slate-50/90 px-4 py-3 dark:bg-slate-950/50">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {formatShortDate(point.date)}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {point.value} {point.unit}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {DEFAULT_BODY_METRICS.map((metric) => (
            <label key={metric.key} className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {metric.label} ({metric.unit})
              <input
                className="field mt-2"
                inputMode="decimal"
                value={bodyMetricInputs[metric.key]}
                onChange={(event) => updateBodyMetricInput(metric.key, event.target.value)}
                placeholder={`Enter ${metric.label.toLowerCase()}`}
              />
            </label>
          ))}
        </div>

        {showAdvancedBodyProgressControls ? (
          <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Custom metrics
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Add any extra tape, skinfold, or physique metrics you want to keep alongside your weigh-ins.
                </p>
              </div>
              <button type="button" className="action-button-secondary" onClick={addCustomMetricRow}>
                Add custom metric
              </button>
            </div>

            {customMetrics.length ? (
              <div className="space-y-3">
                {customMetrics.map((metric) => (
                  <div key={metric.id} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Label
                      <input
                        className="field mt-2"
                        value={metric.label}
                        onChange={(event) => updateCustomMetricRow(metric.id, 'label', event.target.value)}
                        placeholder="Example: Lower waist"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Value
                      <input
                        className="field mt-2"
                        inputMode="decimal"
                        value={metric.value}
                        onChange={(event) => updateCustomMetricRow(metric.id, 'value', event.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Unit
                      <input
                        className="field mt-2"
                        value={metric.unit}
                        onChange={(event) => updateCustomMetricRow(metric.id, 'unit', event.target.value)}
                        placeholder="cm"
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="action-button-secondary w-full"
                        onClick={() => removeCustomMetricRow(metric.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No custom metrics added yet.</p>
            )}
          </div>
        ) : null}

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes
          <textarea
            className="field mt-2 min-h-24"
            value={bodyProgressNote}
            onChange={(event) => setBodyProgressNote(event.target.value)}
            placeholder="Lighting, pump, soreness, travel, or anything else worth remembering for this snapshot."
          />
        </label>

        <div className="grid gap-3 lg:grid-cols-3">
          {capturePoseOrder.map((pose) => {
            const existingPhoto = editingBodyProgressSnapshot?.photos.find((photo) => photo.pose === pose) ?? null
            const isCleared = clearedPhotoPoses.includes(pose)
            return (
              <div
                key={pose}
                className={`rounded-[24px] border px-4 py-4 dark:bg-slate-900/70 ${
                  pose === selectedCapturePose
                    ? 'border-teal-400 bg-teal-50/70 dark:border-teal-500/40'
                    : 'border-black/5 bg-white/70 dark:border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {pose} photo
                    </p>
                    {pose === selectedCapturePose ? (
                      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
                        Capture focus
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {pendingPhotoFiles[pose]
                        ? pendingPhotoFiles[pose]?.name
                        : existingPhoto && !isCleared
                          ? existingPhoto.fileName
                          : 'No photo saved yet'}
                    </p>
                  </div>
                  {existingPhoto && !isCleared ? (
                    <button
                      type="button"
                      className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300"
                      onClick={() => toggleClearedPhotoPose(pose)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                {existingPhoto && !isCleared ? (
                  <img
                    src={existingPhoto.dataUrl}
                    alt={`${pose} progress`}
                    className="mt-3 h-48 w-full rounded-[20px] object-cover"
                  />
                ) : (
                  <div className="mt-3 flex h-48 items-center justify-center rounded-[20px] border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {pendingPhotoFiles[pose] ? 'Ready to save' : 'No saved image'}
                  </div>
                )}
                <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Replace {pose} image
                  <input
                    type="file"
                    className="field mt-2"
                    accept="image/*"
                    onChange={(event) => setPendingPhotoFile(pose, event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            )
          })}
        </div>

        {bodyProgressError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {bodyProgressError}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="action-button flex-1"
            onClick={() => {
              void handleSaveBodyProgress()
            }}
            disabled={bodyProgressSaving}
          >
            {bodyProgressSaving ? 'Saving...' : `Save ${editorDate === today ? "today's" : 'dated'} snapshot`}
          </button>
          {editingBodyProgressSnapshot && onDeleteBodyProgress ? (
            <button
              type="button"
              className="action-button-secondary flex-1"
              onClick={() => {
                void handleDeleteBodyProgressSnapshot()
              }}
              disabled={bodyProgressSaving}
            >
              Delete snapshot
            </button>
          ) : null}
        </div>

        {FEATURE_FLAGS.bodyProgressCompareV1 && latestBodyProgressSnapshot ? (
          <div className="space-y-4 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Quick review
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    One tap same-day, 7-day, or 30-day review keeps waist trend and photo compare together.
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    Capture focus {selectedCapturePose}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex">
                  {(['same_day', '7d', '30d'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                        bodyProgressComparePreset === preset
                          ? 'bg-teal-700 text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                      onClick={() => handleSetBodyProgressComparePreset(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['side_by_side', 'overlay'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      bodyProgressCompareMode === mode
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() => handleSetCompareMode(mode)}
                  >
                    {formatCompareModeLabel(mode)}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['latest_vs_compare', 'before_after'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      bodyProgressGalleryMode === mode
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                    onClick={() => handleSetGalleryMode(mode)}
                  >
                    {formatGalleryModeLabel(mode)}
                  </button>
                ))}
              </div>
            </div>

            {FEATURE_FLAGS.progressStoryV1 && bodyProgressQuickCompare ? (
              <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Progress story
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {bodyProgressQuickCompare.storySummary}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${progressStoryToneClass(
                      bodyProgressQuickCompare.storyTone,
                    )}`}
                  >
                    {bodyProgressQuickCompare.storyTone.replace('_', ' ')}
                  </span>
                </div>
                {bodyProgressQuickCompare.waistTrendLabel ? (
                  <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                    {bodyProgressQuickCompare.waistTrendLabel}
                  </p>
                ) : null}
                {bodyProgressQuickCompare.nextActionPrompt ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {bodyProgressQuickCompare.nextActionPrompt}
                  </p>
                ) : null}
                {bodyProgressQuickCompare.missingPhoto ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    Missing compare photo for {selectedCapturePose}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {formatGalleryModeLabel(bodyProgressQuickCompare.galleryMode)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {formatCompareModeLabel(bodyProgressQuickCompare.compareMode)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {bodyProgressQuickCompare.captureConsistency} capture
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {formatScaleContextLabel(bodyProgressQuickCompare.scaleContext)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bodyProgressQuickCompare.captureChecklist.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[18px] bg-white/80 px-3 py-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-1 font-medium">{item.status}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
                {bodyProgressQuickCompare.galleryMode === 'before_after' ? (
                  <button
                    type="button"
                    className="action-button-secondary mt-3 w-full"
                    disabled={!bodyProgressQuickCompare.shareEnabled}
                    onClick={() => {
                      void handleShareBeforeAfter()
                    }}
                  >
                    {bodyProgressQuickCompare.shareEnabled
                      ? 'Share or export before / after'
                      : `Before / after needs a matching ${selectedCapturePose} photo`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {bodyProgressQuickCompare?.compareMode === 'overlay' ? (
              <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Overlay compare
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Current {selectedCapturePose} pose over the selected comparison image.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {bodyProgressQuickCompare.captureConsistency}
                  </span>
                </div>
                {bodyProgressQuickCompare.latestPhotoDataUrl && bodyProgressQuickCompare.comparePhotoDataUrl ? (
                  <div className="relative mt-3 aspect-[3/4] overflow-hidden rounded-[20px] bg-slate-950">
                    <img
                      src={bodyProgressQuickCompare.comparePhotoDataUrl}
                      alt={`${selectedCapturePose} comparison overlay base`}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <img
                      src={bodyProgressQuickCompare.latestPhotoDataUrl}
                      alt={`${selectedCapturePose} comparison overlay latest`}
                      className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-screen"
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex h-56 items-center justify-center rounded-[20px] border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Overlay needs a matching compare photo for {selectedCapturePose}.
                  </div>
                )}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Latest</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {formatShortDate(latestBodyProgressSnapshot.date)}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PROGRESS_PHOTO_POSES.map((pose) => {
                    const photo = latestBodyProgressSnapshot.photos.find((entry) => entry.pose === pose)
                    return photo ? (
                      <img
                        key={`latest-${pose}`}
                        src={photo.dataUrl}
                        alt={`${pose} progress latest`}
                        className="h-24 w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <div
                        key={`latest-${pose}`}
                        className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:border-slate-700"
                      >
                        No {pose} photo
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Compare</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {compareBodyProgressSnapshot ? formatShortDate(compareBodyProgressSnapshot.date) : comparePresetLabel}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PROGRESS_PHOTO_POSES.map((pose) => {
                    const photo = compareBodyProgressSnapshot?.photos.find((entry) => entry.pose === pose)
                    return photo ? (
                      <img
                        key={`compare-${pose}`}
                        src={photo.dataUrl}
                        alt={`${pose} progress comparison`}
                        className="h-24 w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <div
                        key={`compare-${pose}`}
                        className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-[11px] uppercase tracking-[0.14em] text-slate-400 dark:border-slate-700"
                      >
                        No {pose} photo
                      </div>
                    )
                  })}
                </div>
                {!compareBodyProgressSnapshot ? (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    No comparison snapshot is available yet for this preset.
                  </p>
                ) : null}
              </div>

              <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Waist trend</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {waistTrend.length ? `${waistTrend[0].value} ${waistTrend[0].unit}` : 'Unavailable'}
                </p>
                <div className="mt-3 space-y-2">
                  {waistTrend.slice(0, 3).map((entry) => (
                    <div
                      key={entry.snapshotId}
                      className="flex items-center justify-between rounded-2xl bg-white/80 px-3 py-2 text-sm dark:bg-slate-900"
                    >
                      <span className="text-slate-700 dark:text-slate-300">{formatShortDate(entry.date)}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {entry.value} {entry.unit}
                      </span>
                    </div>
                  ))}
                  {!waistTrend.length ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Save a waist measurement to see the quick review trend.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {bodyProgressComparePreset === 'custom' ? (
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Compare against date
                <select
                  className="field mt-2"
                  value={customCompareDate}
                  onChange={(event) => setCustomCompareDate(event.target.value)}
                >
                  <option value="">Select a snapshot date</option>
                  {visibleBodyProgressSnapshots.slice(1).map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.date}>
                      {formatShortDate(snapshot.date)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {compareMetricDeltas.length ? (
              <div className="grid gap-3 lg:grid-cols-3">
                {compareMetricDeltas.slice(0, 6).map((metric) => (
                  <div key={metric.key} className="rounded-[22px] bg-slate-50/90 px-4 py-3 dark:bg-slate-950/50">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{metric.label}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {metric.currentValue} {metric.unit} vs {metric.compareValue} {metric.unit}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-teal-700 dark:text-teal-300">{metric.deltaLabel}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Save at least two snapshots with shared metrics to unlock deltas.
              </p>
            )}
          </div>
        ) : null}

        {visibleBodyProgressSnapshots.length ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Recent body progress
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleBodyProgressSnapshots.slice(0, 4).map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatShortDate(snapshot.date)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {snapshot.metrics.length} metric{snapshot.metrics.length === 1 ? '' : 's'} • {snapshot.photos.length} photo{snapshot.photos.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-sm font-semibold text-teal-700 dark:text-teal-300"
                      onClick={() => setEditorDate(snapshot.date)}
                    >
                      Edit
                    </button>
                  </div>
                  {snapshot.metrics.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {snapshot.metrics.slice(0, 4).map((metric) => (
                        <span
                          key={`${snapshot.id}-${metric.key}`}
                          className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {metric.label}: {metric.value} {metric.unit}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {snapshot.photos.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {snapshot.photos.map((photo) => (
                        <img
                          key={photo.id}
                          src={photo.dataUrl}
                          alt={`${photo.pose} progress`}
                          className="h-24 w-full rounded-2xl object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {FEATURE_FLAGS.bodyProgressGalleryV2 && bodyProgressGallery.length ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Gallery
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {bodyProgressGallery.slice(0, 9).map((photo) => (
                <div key={photo.photoId} className="rounded-[24px] border border-black/5 bg-white/70 px-3 py-3 dark:border-white/10 dark:bg-slate-900/70">
                  <img src={photo.dataUrl} alt={`${photo.pose} progress on ${photo.date}`} className="h-40 w-full rounded-2xl object-cover" />
                  <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    {photo.pose} • {formatShortDate(photo.date)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  function handleSubmitManualOverride(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!onManualOverrideTargets) {
      return
    }

    const nextCalorieTarget = Number.parseInt(overrideCalorieTarget, 10)
    const nextProteinTarget = Number.parseInt(overrideProteinTarget, 10)
    const nextCarbTarget = Number.parseInt(overrideCarbTarget, 10)
    const nextFatTarget = Number.parseInt(overrideFatTarget, 10)

    if (
      !Number.isFinite(nextCalorieTarget) ||
      !Number.isFinite(nextProteinTarget) ||
      !Number.isFinite(nextCarbTarget) ||
      !Number.isFinite(nextFatTarget)
    ) {
      setOverrideError('Enter valid whole-number targets before saving the override.')
      return
    }

    if (
      nextCalorieTarget === settings.calorieTarget &&
      nextProteinTarget === settings.proteinTarget &&
      nextCarbTarget === settings.carbTarget &&
      nextFatTarget === settings.fatTarget
    ) {
      setOverrideError('Change at least one target before submitting a manual override.')
      return
    }

    const result = onManualOverrideTargets(
      {
        ...settings,
        calorieTarget: nextCalorieTarget,
        proteinTarget: nextProteinTarget,
        carbTarget: nextCarbTarget,
        fatTarget: nextFatTarget,
      },
      overrideReasonCode,
    )
    if (!result.ok) {
      setOverrideError(result.error.message)
      return
    }

    setOverrideError(null)
    setShowOverrideEditor(false)
  }

  function renderTodayWeighInSection(): React.ReactNode {
    const isCompact = !currentCheckIn
    const showSideRail = Boolean(latestTrend) || (!isCompact && Boolean(onOpenCoach))

    return (
      <section
        className={`app-card px-4 py-4 ${isCompact ? 'space-y-3' : 'space-y-4'}`}
        style={{ scrollMarginBottom: 'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 8.5rem))' }}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Today&apos;s weigh-in
            </p>
            <p className="font-display text-3xl text-slate-900 dark:text-white">
              {formatDisplayWeight(todayEntry, settings.weightUnit)}
            </p>
          </div>
          {showSideRail ? (
            <div className="space-y-2 text-right">
            {latestTrend ? (
              <div className="rounded-2xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  7-day avg
                </p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {latestTrend} {settings.weightUnit}
                </p>
              </div>
            ) : null}
            {!isCompact && onOpenCoach ? (
              <button type="button" className="action-button-secondary" onClick={onOpenCoach}>
                Ask coach
              </button>
            ) : null}
            </div>
          ) : null}
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Edit date
          <input
            type="date"
            className="field mt-2"
            value={editorDate}
            max={today}
            onChange={(event) => setEditorDate(event.target.value)}
          />
        </label>

        <WeightEntryForm
          key={`${editorDate}-${settings.weightUnit}-${editingEntry?.id ?? 'none'}-${editingEntry?.weight ?? 'empty'}-${editingEntry?.unit ?? 'none'}`}
          date={editorDate}
          isToday={editorDate === today}
          unit={settings.weightUnit}
          entry={editingEntry}
          onSaveWeight={onSaveWeight}
          onDeleteWeight={onDeleteWeight}
        />

        {!isCompact ? <p className="text-xs text-slate-500 dark:text-slate-300">
          {editorDate === today
            ? 'Today stays as the quick default, but you can backfill or correct any prior date from this editor.'
            : `Editing ${editorDate}. Saving replaces that day’s stored weight and keeps its original unit history intact.`}
        </p> : null}
      </section>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <ScreenHeader
        eyebrow="Weight"
        title="Progress proof"
        description="Keep the first view anchored on whether the cut is still working, then drop into weigh-ins and longer history only after that."
        onOpenSettings={onOpenSettings}
      />
      <section className="app-card space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Weekly check-in
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              {currentCheckIn ? currentCheckIn.recommendationReason : 'Check-in not available yet'}
            </p>
            {cutDayPlan ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {cutDayPlan.dayType.replaceAll('_', ' ')}
                </span>
                <span>{cutDayPlan.whyToday}</span>
              </div>
            ) : null}
          </div>
          {currentCheckIn ? <CheckInStatusBadge status={currentCheckIn.status} /> : null}
        </div>

        {currentCheckIn ? (
          <>
            <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Confidence
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {formatConfidenceSummary(
                      currentCheckIn.confidenceBand,
                      currentCheckIn.confidenceScore,
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Decision
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatDecisionLabel(currentCheckIn.decisionType)}
                  </p>
                </div>
              </div>
              {currentCheckIn.blockedReasons?.length ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  <p className="font-semibold">Blocked reasons</p>
                  <ul className="mt-2 space-y-1">
                    {currentCheckIn.blockedReasons.map((reason) => (
                      <li key={reason.code}>{reason.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {shouldShowActionButtons ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {canApplyCheckInTargets ? (
                  <button type="button" className="action-button" onClick={onApplyCheckInSuggestion}>
                    Apply suggestion
                  </button>
                ) : null}
                {currentCheckIn.status === 'ready' ? (
                  <button type="button" className="action-button-secondary" onClick={onKeepCurrentCheckIn}>
                    Keep current
                  </button>
                ) : null}
                {onManualOverrideTargets ? (
                  <button
                    type="button"
                    className="action-button-secondary"
                    onClick={() => {
                      if (showOverrideEditor) {
                        closeOverrideEditor()
                        return
                      }

                      openOverrideEditor()
                    }}
                  >
                    {showOverrideEditor ? 'Close override' : 'Manual override'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {currentCheckIn.reasonCodes?.length ? (
              <div className="flex flex-wrap gap-2">
                {currentCheckIn.reasonCodes.map((code) => (
                  <span
                    key={code}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {code}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-950/60">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Next check-in
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {formatShortDate(currentCheckIn.nextCheckInDate ?? currentCheckIn.weekEndDate)}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-100/80 px-3 py-3 dark:bg-slate-950/60">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Active target source
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.status === 'overridden' ? 'Manual override' : 'Weekly recommendation'}
                </p>
              </div>
            </div>

            {currentCheckIn.status === 'overridden' ? (
              <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                Manual targets are now authoritative for this coaching window. The weekly recommendation is kept for history only until the next check-in lands.
              </div>
            ) : null}

            {previewPsmfGarminUiState?.weight ? (
              <div
                className="rounded-[24px] border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-slate-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-slate-200"
                data-testid="weight-preview-supplemental"
              >
                <div className="space-y-2">
                  {previewPsmfGarminUiState.weight.supplementalLines?.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
                {previewPsmfGarminUiState.weight.blockedReasonLabels?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewPsmfGarminUiState.weight.blockedReasonLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {currentCheckIn.recommendedCalorieTarget !== undefined &&
            formatDecisionNote(currentCheckIn.reasonCodes, currentCheckIn.recommendedCalorieTarget) ? (
              <div className="rounded-[24px] border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200">
                {formatDecisionNote(currentCheckIn.reasonCodes, currentCheckIn.recommendedCalorieTarget)}
              </div>
            ) : null}

            {currentCheckIn.recommendedCalorieTarget === undefined &&
            formatDecisionNote(currentCheckIn.reasonCodes, currentCheckIn.recommendedCalorieTarget) ? (
              <div className="rounded-[24px] border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200">
                {formatDecisionNote(currentCheckIn.reasonCodes, currentCheckIn.recommendedCalorieTarget)}
              </div>
            ) : null}

            {renderLegacyWeeklyCheckInBlocks ? (
              <div className="rounded-[24px] border border-teal-200 bg-teal-50/80 px-4 py-3 dark:border-teal-500/30 dark:bg-teal-500/10">
                <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                  Suggested target
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.recommendedCalorieTarget} cal/day
                </p>
                {currentCheckIn.recommendedMacroTargets ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {currentCheckIn.recommendedMacroTargets.protein}P • {currentCheckIn.recommendedMacroTargets.carbs}C •{' '}
                    {currentCheckIn.recommendedMacroTargets.fat}F
                  </p>
                ) : null}
                {formatDecisionNote(
                  currentCheckIn.reasonCodes,
                  currentCheckIn.recommendedCalorieTarget,
                ) ? (
                  <p className="mt-2 text-sm text-teal-800 dark:text-teal-200">
                    {formatDecisionNote(
                      currentCheckIn.reasonCodes,
                      currentCheckIn.recommendedCalorieTarget,
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

            {showOverrideEditor && onManualOverrideTargets ? (
              <form
                className="space-y-3 rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10"
                onSubmit={handleSubmitManualOverride}
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                    Manual override
                  </p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                    Override this week&apos;s targets directly from the coaching surface.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Calories
                    <input
                      className="field mt-2"
                      inputMode="numeric"
                      value={overrideCalorieTarget}
                      onChange={(event) => setOverrideCalorieTarget(event.target.value)}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Protein
                    <input
                      className="field mt-2"
                      inputMode="numeric"
                      value={overrideProteinTarget}
                      onChange={(event) => setOverrideProteinTarget(event.target.value)}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Carbs
                    <input
                      className="field mt-2"
                      inputMode="numeric"
                      value={overrideCarbTarget}
                      onChange={(event) => setOverrideCarbTarget(event.target.value)}
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Fat
                    <input
                      className="field mt-2"
                      inputMode="numeric"
                      value={overrideFatTarget}
                      onChange={(event) => setOverrideFatTarget(event.target.value)}
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Reason code
                  <select
                    className="field mt-2"
                    value={overrideReasonCode}
                    onChange={(event) =>
                      setOverrideReasonCode(event.target.value as CoachingReasonCode | LegacyCoachingCode)
                    }
                  >
                    <option value="coach_override">Coach override</option>
                    <option value="diet_break">Diet break</option>
                    <option value="recovery_adjustment">Recovery adjustment</option>
                    <option value="travel_reset">Travel reset</option>
                    <option value="adherence_reset">Adherence reset</option>
                  </select>
                </label>
                {overrideError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                    {overrideError}
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button type="submit" className="action-button flex-1">
                    Save override
                  </button>
                  <button
                    type="button"
                    className="action-button-secondary flex-1"
                    onClick={closeOverrideEditor}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Target rate
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {formatWeeklyRate(currentCheckIn.targetWeeklyRatePercent)}
                </p>
              </div>
              <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Actual rate
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.status === 'insufficientData'
                    ? '--'
                    : formatWeeklyRate(currentCheckIn.actualWeeklyRatePercent)}
                </p>
              </div>
              <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Avg calories
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.status === 'insufficientData' ? '--' : currentCheckIn.avgCalories}
                </p>
              </div>
              <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Avg protein
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.status === 'insufficientData' ? '--' : `${currentCheckIn.avgProtein} g`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Steps adherence
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.avgSteps} avg/day
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {settings.dailyStepTarget
                    ? `${currentCheckIn.stepAdherencePercent}% of ${settings.dailyStepTarget} target`
                    : 'No daily step target set'}
                </p>
              </div>
              <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Cardio adherence
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.weeklyCardioMinutes} min/week
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {settings.weeklyCardioMinuteTarget
                    ? `${currentCheckIn.cardioAdherencePercent}% of ${settings.weeklyCardioMinuteTarget} target`
                    : 'No weekly cardio target set'}
                </p>
              </div>
            </div>

            {currentCheckIn.recommendedCalorieTarget !== undefined ? (
              <div className="rounded-[24px] border border-teal-200 bg-teal-50/80 px-4 py-3 dark:border-teal-500/30 dark:bg-teal-500/10">
                <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                  Suggested target
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {currentCheckIn.recommendedCalorieTarget} cal/day
                </p>
                {currentCheckIn.recommendedMacroTargets ? (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {currentCheckIn.recommendedMacroTargets.protein}P • {currentCheckIn.recommendedMacroTargets.carbs}C •{' '}
                    {currentCheckIn.recommendedMacroTargets.fat}F
                  </p>
                ) : null}
              </div>
            ) : null}

            {renderWeeklyCheckInPacket()}

            {renderLegacyWeeklyCheckInBlocks ? (
              <div className="grid grid-cols-2 gap-3">
                {canApplyCheckInTargets ? (
                  <button type="button" className="action-button" onClick={onApplyCheckInSuggestion}>
                    Apply suggestion
                  </button>
                ) : null}
                {currentCheckIn.status === 'ready' ? (
                  <button type="button" className="action-button-secondary" onClick={onKeepCurrentCheckIn}>
                    Keep current
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Log at least two weeks of weigh-ins plus five eligible intake days in the completed week to unlock athlete check-ins.
          </p>
        )}
      </section>
      {renderBodyProgressSection()}
      {!currentCheckIn ? renderTodayWeighInSection() : null}

      {nutritionOverview ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Nutrition overview
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              {nutritionOverviewV2Enabled ? 'Nutrition intelligence' : 'Daily sufficiency'}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {nutritionOverviewV2Enabled
                ? 'Daily through yearly micronutrient sufficiency with top contributors and deficiency alerts.'
                : 'Daily and 7-day micronutrient sufficiency from logged foods with label data.'}
            </p>
          </div>
          {nutritionOverviewV2Enabled && nutritionOverview.pinnedMetrics.length ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
              {nutritionOverview.pinnedMetrics.map((metric) => renderPinnedNutrientCard(metric))}
            </div>
          ) : null}
          <div className={`grid gap-3 ${nutritionOverviewV2Enabled ? 'xl:grid-cols-5' : 'lg:grid-cols-2'}`}>
            {renderNutritionOverviewWindow(nutritionOverview.today)}
            {renderNutritionOverviewWindow(nutritionOverview.trailingWeek)}
            {nutritionOverviewV2Enabled && nutritionOverview.trailingMonth
              ? renderNutritionOverviewWindow(nutritionOverview.trailingMonth)
              : null}
            {nutritionOverviewV2Enabled && nutritionOverview.trailingQuarter
              ? renderNutritionOverviewWindow(nutritionOverview.trailingQuarter)
              : null}
            {nutritionOverviewV2Enabled && nutritionOverview.trailingYear
              ? renderNutritionOverviewWindow(nutritionOverview.trailingYear)
              : null}
          </div>
          {nutritionOverviewV2Enabled && nutritionOverview.supportedNutrients.length ? (
            <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Nutrient focus
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Pick a nutrient to inspect its current range coverage, contributor mix, and goal status across windows.
                  </p>
                </div>
                <select
                  className="field lg:max-w-xs"
                  value={settings.focusedNutrientKey ?? nutritionOverview.focusedNutrientKey ?? ''}
                  onChange={(event) => handleSetFocusedNutrient(event.target.value as CanonicalNutrientKey)}
                >
                  {nutritionOverview.supportedNutrients.map((nutrient) => (
                    <option key={nutrient.key} value={nutrient.key}>
                      {nutrient.label}
                    </option>
                  ))}
                </select>
              </div>
              {focusedNutrientDrilldown ? (
                <div className="space-y-3">
                  <div className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{focusedNutrientDrilldown.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Goal mode: {focusedNutrientDrilldown.goalMode}
                    </p>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
                    {focusedNutrientDrilldown.points.map((point) => (
                      <div key={`${focusedNutrientDrilldown.key}-${point.window}`} className="rounded-[22px] bg-slate-50/90 px-4 py-4 dark:bg-slate-950/50">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Focus {point.window}</p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                          {formatMetricValue(point.value, focusedNutrientDrilldown.unit)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Target {formatMetricValue(point.target, focusedNutrientDrilldown.unit)} • {formatCoverageSummary(point.coveragePercent)}
                        </p>
                        {point.contributors[0] ? (
                          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            Top contributor: {point.contributors[0].name}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {currentCheckIn ? (
        <section
        className="app-card space-y-4 px-4 py-4"
        style={{ scrollMarginBottom: 'var(--app-bottom-clearance, calc(env(safe-area-inset-bottom) + 8.5rem))' }}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Today&apos;s weigh-in
            </p>
            <p className="font-display text-3xl text-slate-900 dark:text-white">
              {formatDisplayWeight(todayEntry, settings.weightUnit)}
            </p>
          </div>
          <div className="space-y-2 text-right">
            {latestTrend ? (
              <div className="rounded-2xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                <p className="text-xs uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                  7-day avg
                </p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {latestTrend} {settings.weightUnit}
                </p>
              </div>
            ) : null}
            {onOpenCoach ? (
              <button type="button" className="action-button-secondary" onClick={onOpenCoach}>
                Ask coach
              </button>
            ) : null}
          </div>
        </div>

        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Edit date
          <input
            type="date"
            className="field mt-2"
            value={editorDate}
            max={today}
            onChange={(event) => setEditorDate(event.target.value)}
          />
        </label>

        <WeightEntryForm
          key={`${editorDate}-${settings.weightUnit}-${editingEntry?.id ?? 'none'}-${editingEntry?.weight ?? 'empty'}-${editingEntry?.unit ?? 'none'}`}
          date={editorDate}
          isToday={editorDate === today}
          unit={settings.weightUnit}
          entry={editingEntry}
          onSaveWeight={onSaveWeight}
          onDeleteWeight={onDeleteWeight}
        />

        <p className="text-xs text-slate-500 dark:text-slate-300">
          {editorDate === today
            ? 'Today stays as the quick default, but you can backfill or correct any prior date from this editor.'
            : `Editing ${editorDate}. Saving replaces that day’s stored weight and keeps its original unit history intact.`}
        </p>
      </section>
      ) : null}

      <section className="app-card space-y-4 px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Weight trend
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              {formatDisplayWeight(latestEntry, settings.weightUnit)}
            </p>
          </div>
          <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {RANGE_OPTIONS.map((range) => (
              <button
                key={range}
                type="button"
                className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                  selectedRange === range
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                onClick={() => setSelectedRange(range)}
              >
                {range === 'all' ? 'All' : `${range}d`}
              </button>
            ))}
          </div>
        </div>

        <WeightChart points={chartPoints} weightUnit={settings.weightUnit} />
      </section>

      <section className="app-card space-y-4 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Review
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">Recent trend context</p>
          </div>
          {onOpenCoach ? (
            <button type="button" className="action-button-secondary" onClick={onOpenCoach}>
              Ask coach
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Latest</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {formatDisplayWeight(latestEntry, settings.weightUnit)}
            </p>
          </div>
          <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">7-day avg</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {latestTrend ? `${latestTrend} ${settings.weightUnit}` : '--'}
            </p>
          </div>
          <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Approx weekly delta</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {recentDelta === null ? '--' : `${Math.round(recentDelta * 100) / 100} ${settings.weightUnit}`}
            </p>
          </div>
        </div>
      </section>

      <section className="app-card px-4 py-4">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Decision history
          </p>
          {coachingDecisionHistory.length ? (
            <div className="space-y-2">
              {coachingDecisionHistory.slice(0, 6).map((record) => (
                <div
                  key={record.id}
                  className="rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {formatDecisionLabel(record.decisionType)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatShortDate(record.windowEnd)} • {record.source === 'manual_override' ? 'manual override' : 'engine'}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {record.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {formatConfidenceSummary(record.confidenceBand, record.confidenceScore)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {record.previousTargets.calorieTarget} → {record.proposedTargets?.calorieTarget ?? record.previousTargets.calorieTarget} cal
                  </p>
                  {formatDecisionNote(record.reasonCodes, record.proposedTargets?.calorieTarget) ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {formatDecisionNote(record.reasonCodes, record.proposedTargets?.calorieTarget)}
                    </p>
                  ) : null}
                  {record.reasonCodes.length ? (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Reason codes: {record.reasonCodes.join(', ')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Coaching decisions will appear here once the weekly engine has enough data.
            </p>
          )}
        </div>
      </section>

      <section className="app-card px-4 py-4">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Check-in history
          </p>
          {checkInHistory.length ? (
            <div className="space-y-2">
              {checkInHistory.slice(0, 6).map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      Week ending {formatShortDate(record.weekEndDate)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDecisionLabel(record.decisionType)} •{' '}
                      {record.status === 'insufficientData'
                        ? 'Insufficient data'
                        : `${formatWeeklyRate(record.actualWeeklyRatePercent)} actual vs ${formatWeeklyRate(record.targetWeeklyRatePercent)} target`}
                    </p>
                  </div>
                  <CheckInStatusBadge status={record.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Completed weekly check-ins will appear here.
            </p>
          )}
        </div>
      </section>

      <section className="app-card px-4 py-4">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Recent entries
          </p>
          {weights.length ? (
            <div className="space-y-2">
              {weights.slice(0, 7).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => setEditorDate(entry.date)}
                  >
                    <p className="font-medium text-slate-900 dark:text-white">{entry.date}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Tap to edit this day</p>
                  </button>
                  <div className="text-right">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {convertWeight(entry.weight, entry.unit, settings.weightUnit)} {settings.weightUnit}
                    </p>
                    {entry.unit !== settings.weightUnit ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Saved as {entry.weight} {entry.unit}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Save your first weigh-in to start the chart.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
