import { ArrowDown, ArrowUp, EyeOff, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  ActionResult,
  BenchmarkReport,
  BodyProgressSnapshot,
  CaptureConvenienceSource,
  CheckInRecord,
  CommandConfidence,
  CoreClaimSnapshot,
  CutCockpitSnapshot,
  DashboardInsightSetting,
  DashboardSectionId,
  DashboardSectionLayout,
  FoodReviewItem,
  GarminSurfaceSnapshot,
  MealType,
  MorningPhoneSnapshot,
  NutritionOverviewBundle,
  UserSettings,
  WorkoutDashboardSnapshot,
} from '../types'
import { formatShortDate } from '../utils/dates'

interface DashboardScreenProps {
  currentCheckIn: CheckInRecord | null
  nutritionOverview: NutritionOverviewBundle | null
  foodReviewQueue: FoodReviewItem[]
  garminSurface: GarminSurfaceSnapshot
  workoutSnapshot: WorkoutDashboardSnapshot
  cutCockpit: CutCockpitSnapshot | null
  settings: UserSettings
  cutModeEnabled?: boolean
  morningSnapshot?: MorningPhoneSnapshot | null
  bodyProgressSnapshots: BodyProgressSnapshot[]
  benchmarkReports: BenchmarkReport[]
  claimSnapshot: CoreClaimSnapshot | null
  commandHomeEnabled?: boolean
  onOpenCoach: () => void
  onOpenWeight: () => void
  onOpenWorkouts: () => void
  onOpenAddFood: (meal: MealType) => void
  onOpenCaptureConvenience?: (source: CaptureConvenienceSource) => void
  onOpenLogDate: (date: string) => void
  onOpenSettings: () => void
  onRunFastCheckIn: () => void
  onDismissReviewItem: (reviewItemId: string) => void
  onUpdateSettings: (settings: UserSettings) => ActionResult<void>
}

const DEFAULT_ORDER: DashboardSectionId[] = ['coach', 'nutrition', 'food_review', 'garmin', 'workouts', 'body_progress', 'benchmark']

export function DashboardScreen({
  currentCheckIn,
  nutritionOverview,
  foodReviewQueue,
  garminSurface,
  workoutSnapshot,
  cutCockpit,
  settings,
  cutModeEnabled = false,
  morningSnapshot = null,
  bodyProgressSnapshots,
  benchmarkReports,
  claimSnapshot,
  commandHomeEnabled = false,
  onOpenCoach,
  onOpenWeight,
  onOpenWorkouts,
  onOpenAddFood,
  onOpenCaptureConvenience,
  onOpenLogDate,
  onOpenSettings,
  onRunFastCheckIn,
  onDismissReviewItem,
  onUpdateSettings,
}: DashboardScreenProps) {
  const [manageMode, setManageMode] = useState(false)
  const [showWhyToday, setShowWhyToday] = useState(false)
  const layout: DashboardSectionLayout = settings.dashboardLayout ?? {
    order: DEFAULT_ORDER,
    hiddenSectionIds: [],
    updatedAt: new Date().toISOString(),
  }
  const effectiveOrder = layout.order.length ? layout.order : DEFAULT_ORDER
  const visibleOrder = useMemo(() => effectiveOrder.filter((id) => !layout.hiddenSectionIds.includes(id)), [effectiveOrder, layout.hiddenSectionIds])
  const latestBodyProgress = bodyProgressSnapshots[0] ?? null
  const compareBodyProgress = bodyProgressSnapshots[1] ?? null
  const latestBenchmark = benchmarkReports[0] ?? null
  const latestFastCheckInRun = settings.lastFastCheckInRun ?? null
  const pendingReviewItems = foodReviewQueue.filter((item) => item.status === 'pending')
  const dashboardInsights = settings.dashboardInsights ?? []
  const insightMap = useMemo(() => {
    const map = new Map<DashboardSectionId, DashboardInsightSetting[]>()
    for (const insight of dashboardInsights) {
      const bucket = map.get(insight.sectionId) ?? []
      bucket.push(insight)
      map.set(insight.sectionId, bucket)
    }
    for (const bucket of map.values()) {
      bucket.sort((left, right) => left.order - right.order)
    }
    return map
  }, [dashboardInsights])

  function persistLayout(nextLayout: DashboardSectionLayout): void {
    void onUpdateSettings({
      ...settings,
      dashboardLayout: nextLayout,
      dashboardDefaultsVersionApplied: Math.max(settings.dashboardDefaultsVersionApplied ?? 0, 1),
    })
  }

  function moveSection(sectionId: DashboardSectionId, direction: -1 | 1): void {
    const index = layout.order.indexOf(sectionId)
    const nextIndex = index + direction
    if (index === -1 || nextIndex < 0 || nextIndex >= layout.order.length) {
      return
    }
    const nextOrder = [...layout.order]
    const [section] = nextOrder.splice(index, 1)
    nextOrder.splice(nextIndex, 0, section)
    persistLayout({ ...layout, order: nextOrder, updatedAt: new Date().toISOString() })
  }

  function toggleSectionHidden(sectionId: DashboardSectionId): void {
    persistLayout({
      ...layout,
      hiddenSectionIds: layout.hiddenSectionIds.includes(sectionId)
        ? layout.hiddenSectionIds.filter((id) => id !== sectionId)
        : [...layout.hiddenSectionIds, sectionId],
      updatedAt: new Date().toISOString(),
    })
  }

  function resetDashboard(): void {
    const nextInsights = (settings.dashboardInsights ?? []).map((insight, order) => ({
      ...insight,
      visible: true,
      order,
      updatedAt: new Date().toISOString(),
    }))
    void onUpdateSettings({
      ...settings,
      dashboardLayout: {
        order: DEFAULT_ORDER,
        hiddenSectionIds: [],
        updatedAt: new Date().toISOString(),
      },
      dashboardInsights: nextInsights,
      dashboardDefaultsVersionApplied: Math.max(settings.dashboardDefaultsVersionApplied ?? 0, 1),
    })
  }

  function updateInsight(insightId: string, patch: Partial<DashboardInsightSetting>): void {
    const nextInsights = dashboardInsights.map((insight) => insight.id === insightId ? { ...insight, ...patch, updatedAt: new Date().toISOString() } : insight)
    void onUpdateSettings({ ...settings, dashboardInsights: nextInsights })
  }

  function moveInsight(sectionId: DashboardSectionId, insightId: string, direction: -1 | 1): void {
    const sectionInsights = [...(insightMap.get(sectionId) ?? [])]
    const index = sectionInsights.findIndex((insight) => insight.id === insightId)
    const nextIndex = index + direction
    if (index === -1 || nextIndex < 0 || nextIndex >= sectionInsights.length) {
      return
    }
    const [moved] = sectionInsights.splice(index, 1)
    sectionInsights.splice(nextIndex, 0, moved)
    const updates = new Map(sectionInsights.map((insight, order) => [insight.id, order]))
    void onUpdateSettings({
      ...settings,
      dashboardInsights: dashboardInsights.map((insight) => updates.has(insight.id) ? { ...insight, order: updates.get(insight.id) ?? insight.order, updatedAt: new Date().toISOString() } : insight),
    })
  }

  function isInsightVisible(id: string): boolean {
    return dashboardInsights.find((insight) => insight.id === id)?.visible ?? true
  }

  function confidenceBadgeTone(confidence: CommandConfidence): string {
    switch (confidence) {
      case 'high':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
      case 'medium':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
    }
  }

  function statusToneClass(tone: MorningPhoneSnapshot['statusItems'][number]['tone']): string {
    return tone === 'warning'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  }

  function openMorningAction(target: MorningPhoneSnapshot['primaryTarget']): void {
    if (!morningSnapshot) {
      return
    }

    if (target === 'log') {
      onOpenAddFood(morningSnapshot.meal ?? 'breakfast')
      return
    }

    if (target === 'train') {
      onOpenWorkouts()
      return
    }

    if (target === 'review_queue') {
      const firstPendingReviewItem = pendingReviewItems[0]
      if (firstPendingReviewItem?.linkedEntryDate) {
        onOpenLogDate(firstPendingReviewItem.linkedEntryDate)
        return
      }

      onOpenSettings()
      return
    }

    onOpenWeight()
  }

  function getMorningActionEyebrow(target: MorningPhoneSnapshot['primaryTarget']): string {
    if (target === 'log') {
      return 'Primary action'
    }

    if (target === 'train') {
      return 'Training call'
    }

    if (target === 'review_queue') {
      return 'Review queue'
    }

    return 'Progress review'
  }

  function getMorningActionButtonLabel(target: MorningPhoneSnapshot['primaryTarget']): string {
    if (!morningSnapshot) {
      return 'Open command'
    }

    if (target === 'log') {
      return `Open ${morningSnapshot.meal ?? 'today'} quick log`
    }

    if (target === 'train') {
      return morningSnapshot.workoutAction?.primaryCta ?? 'Open workouts'
    }

    if (target === 'review_queue') {
      return pendingReviewItems[0]?.linkedEntryDate ? 'Open blocked log day' : 'Review in settings'
    }

    return 'Open body progress review'
  }

  function renderSectionControls(sectionId: DashboardSectionId): React.ReactNode {
    if (!manageMode) {
      return null
    }
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="icon-button" onClick={() => moveSection(sectionId, -1)} aria-label="Move section up"><ArrowUp className="h-4 w-4" /></button>
        <button type="button" className="icon-button" onClick={() => moveSection(sectionId, 1)} aria-label="Move section down"><ArrowDown className="h-4 w-4" /></button>
        <button type="button" className="icon-button" onClick={() => toggleSectionHidden(sectionId)} aria-label="Hide section"><EyeOff className="h-4 w-4" /></button>
      </div>
    )
  }

  function renderInsightManager(sectionId: DashboardSectionId): React.ReactNode {
    if (!manageMode) {
      return null
    }
    const sectionInsights = insightMap.get(sectionId) ?? []
    return (
      <div className="space-y-2 rounded-[20px] border border-dashed border-black/10 px-3 py-3 dark:border-white/10">
        {sectionInsights.map((insight) => (
          <div key={insight.id} className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span>{insight.label}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="icon-button" onClick={() => moveInsight(sectionId, insight.id, -1)} disabled={insight.required}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" className="icon-button" onClick={() => moveInsight(sectionId, insight.id, 1)} disabled={insight.required}><ArrowDown className="h-4 w-4" /></button>
              <button type="button" className="action-button-secondary" onClick={() => updateInsight(insight.id, { visible: !insight.visible })} disabled={insight.required}>
                {insight.visible ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="app-card space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Dashboard</p>
            <p className="font-display text-3xl text-slate-900 dark:text-white">{cutModeEnabled ? 'Your cut cockpit' : 'One place for the whole system'}</p>
          </div>
          <div className="flex items-center gap-2">
            {manageMode ? <button type="button" className="action-button-secondary" onClick={resetDashboard}>Reset</button> : null}
            <button type="button" className="action-button-secondary" onClick={() => setManageMode((current) => !current)}><Settings2 className="mr-2 inline h-4 w-4" />{manageMode ? 'Done' : 'Arrange'}</button>
          </div>
        </div>
      </section>

      {morningSnapshot && commandHomeEnabled ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                Command home
              </p>
              <p className="font-display text-2xl text-slate-900 dark:text-white">
                Do this now
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {morningSnapshot.meal ?? 'today'}
              </span>
              <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${confidenceBadgeTone(morningSnapshot.confidence)}`}>
                {morningSnapshot.confidence} confidence
              </span>
            </div>
          </div>

          <div className={`rounded-[24px] bg-slate-100/80 px-4 ${morningSnapshot.surfaceDensity === 'tight' ? 'py-3' : 'py-4'} dark:bg-slate-900/70`}>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {getMorningActionEyebrow(morningSnapshot.primaryTarget)}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
              {morningSnapshot.primaryLabel}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {morningSnapshot.reasonStack.slice(0, 3).map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-950/70 dark:text-slate-200"
                >
                  {reason}
                </span>
              ))}
            </div>
            {morningSnapshot.secondaryReason ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{morningSnapshot.secondaryReason}</p>
            ) : null}
            <button
              type="button"
              className="action-button mt-4 w-full"
              onClick={() => openMorningAction(morningSnapshot.deepLinkTarget)}
            >
              {getMorningActionButtonLabel(morningSnapshot.deepLinkTarget)}
            </button>
            {morningSnapshot.secondaryTarget && morningSnapshot.secondaryLabel ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  type="button"
                  className="action-button-secondary w-full"
                  onClick={() => openMorningAction(morningSnapshot.secondaryTarget!)}
                >
                  {morningSnapshot.secondaryLabel}
                </button>
                <button
                  type="button"
                  className="action-button-secondary"
                  onClick={() => setShowWhyToday((current) => !current)}
                >
                  {showWhyToday ? 'Hide why' : 'Why today'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="action-button-secondary mt-2 w-full"
                onClick={() => setShowWhyToday((current) => !current)}
              >
                {showWhyToday ? 'Hide why' : 'Why today'}
              </button>
            )}
            {showWhyToday ? (
              <div className="mt-3 rounded-[18px] bg-white/80 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
                {morningSnapshot.whyNow}
              </div>
            ) : null}
          </div>

          {onOpenCaptureConvenience ? (
            <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Global add
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Start capture without logging food automatically.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Review first
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="action-button-secondary w-full"
                  onClick={() => onOpenCaptureConvenience('voice')}
                >
                  Voice capture
                </button>
                <button
                  type="button"
                  className="action-button-secondary w-full"
                  onClick={() => onOpenCaptureConvenience('meal_photo')}
                >
                  Meal photo
                </button>
              </div>
            </div>
          ) : null}

          {morningSnapshot.statusItems.length ? (
            <div className="flex flex-wrap gap-2">
              {morningSnapshot.statusItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-[20px] px-3 py-3 text-sm ${statusToneClass(item.tone)}`}
                >
                  <p className="font-semibold">{item.label}</p>
                  <p className="mt-1 text-xs opacity-90">{item.detail}</p>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : morningSnapshot ? (
        <section className="app-card space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                Morning snapshot
              </p>
              <p className="font-display text-2xl text-slate-900 dark:text-white">
                One glance for logging, training, and visual progress
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {morningSnapshot.meal ?? 'today'}
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <div className="rounded-[20px] bg-slate-100/80 px-4 py-4 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                What should I log?
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {morningSnapshot.laneLabel}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {morningSnapshot.laneCount} quick option{morningSnapshot.laneCount === 1 ? '' : 's'} ready.
              </p>
            </div>
            <div className="rounded-[20px] bg-slate-100/80 px-4 py-4 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                How hard should I train?
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {morningSnapshot.workoutAction
                  ? morningSnapshot.workoutAction.action.replace('_', ' ')
                  : 'No action yet'}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {morningSnapshot.workoutAction?.summary ?? 'Train from your current plan until more signals arrive.'}
              </p>
            </div>
            <div className="rounded-[20px] bg-slate-100/80 px-4 py-4 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Is fat loss visible?
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {morningSnapshot.bodyProgress?.metricDeltaLabel ??
                  (morningSnapshot.bodyProgress?.latestDate ? 'Tracked' : 'No compare yet')}
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {morningSnapshot.bodyProgress?.metricLabel
                  ? `${morningSnapshot.bodyProgress.metricLabel} • ${morningSnapshot.bodyProgress.preset}`
                  : 'Open body progress to save your next compare.'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {cutModeEnabled && cutCockpit ? (
        <section className="app-card space-y-4 px-4 py-4">
          <p className="font-display text-2xl text-slate-900 dark:text-white">{cutCockpit.dailyQuestion}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cutCockpit.remainingTargets.map((target) => (
              <div key={target.key} className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{target.label}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{Math.round(target.consumed)} / {Math.round(target.target)} {target.unit}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {visibleOrder.map((sectionId) => (
        <section key={sectionId} className="app-card space-y-3 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-2xl text-slate-900 dark:text-white">{sectionId.replace('_', ' ')}</p>
            {renderSectionControls(sectionId)}
          </div>
          {renderInsightManager(sectionId)}

          {sectionId === 'coach' ? (
            currentCheckIn ? (
              <div className="space-y-3">
                {isInsightVisible('coach_summary') ? <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Status</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{currentCheckIn.status}</p></div><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Target delta</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{typeof currentCheckIn.recommendedCalorieDelta === 'number' ? `${Math.round(currentCheckIn.recommendedCalorieDelta)} kcal` : 'Hold'}</p></div><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Fast check-in</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{currentCheckIn.weeklyCheckInPacket?.fastCheckInEquivalent ? 'Equivalent' : 'Standard only'}</p></div></div> : null}
                {isInsightVisible('coach_intervention') && currentCheckIn.weeklyCheckInPacket?.interventions?.[0] ? <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"><p className="text-sm font-semibold text-slate-900 dark:text-white">{currentCheckIn.weeklyCheckInPacket.interventions[0].title}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{currentCheckIn.weeklyCheckInPacket.interventions[0].summary}</p></div> : null}
                {settings.fastCheckInPreference?.enabled ? (
                  <button type="button" className="action-button w-full" onClick={onRunFastCheckIn}>
                    Run Fast Check-In
                  </button>
                ) : null}
                {latestFastCheckInRun ? (
                  <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Latest Fast Check-In</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{latestFastCheckInRun.recommendationSummary}</p>
                    {settings.fastCheckInPreference?.postResultModuleSummary && latestFastCheckInRun.unresolvedModules.length ? (
                      <div className="mt-3 space-y-2">
                        {latestFastCheckInRun.unresolvedModules.map((module) => (
                          <div key={`${latestFastCheckInRun.id}-${module.kind}`} className="rounded-2xl bg-slate-100/80 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
                            <p className="font-semibold text-slate-900 dark:text-white">{module.title}</p>
                            <p className="mt-1">{module.reason}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button type="button" className="action-button-secondary w-full" onClick={onOpenCoach}>Open standard check-in</button>
              </div>
            ) : <p className="text-sm text-slate-600 dark:text-slate-300">Coaching appears once the current week has enough data.</p>
          ) : null}

          {sectionId === 'nutrition' ? (
            nutritionOverview ? (
              <div className="space-y-3">
                {isInsightVisible('nutrition_pins') && nutritionOverview.pinnedMetrics.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{nutritionOverview.pinnedMetrics.map((metric) => <div key={metric.key} className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{metric.label}</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{Math.round(metric.value)} {metric.unit}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{metric.goalMode ?? 'auto'} goal</p></div>)}</div> : null}
                {isInsightVisible('nutrition_windows') ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[nutritionOverview.today, nutritionOverview.trailingWeek, nutritionOverview.trailingMonth, nutritionOverview.trailingQuarter].filter(Boolean).map((window) => <div key={window!.window} className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{window!.label}</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{Math.round(window!.completenessPercent)}%</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{window!.contributors.length} contributors</p></div>)}</div> : null}
                <button type="button" className="action-button-secondary w-full" onClick={onOpenWeight}>Open weight and nutrition</button>
              </div>
            ) : <p className="text-sm text-slate-600 dark:text-slate-300">Nutrition intelligence appears once tracked days are available.</p>
          ) : null}

          {sectionId === 'food_review' ? (
            isInsightVisible('food_review_queue') ? (
              pendingReviewItems.length ? pendingReviewItems.slice(0, 4).map((item) => <div key={item.id} className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"><p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.reason}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row">{item.linkedEntryDate ? <button type="button" className="action-button-secondary flex-1" onClick={() => onOpenLogDate(item.linkedEntryDate!)}>Open {formatShortDate(item.linkedEntryDate)}</button> : <button type="button" className="action-button-secondary flex-1" onClick={onOpenSettings}>Review in settings</button>}<button type="button" className="action-button-secondary flex-1" onClick={() => onDismissReviewItem(item.id)}>Dismiss</button></div></div>) : <p className="text-sm text-slate-600 dark:text-slate-300">Nothing in the queue right now.</p>
            ) : null
          ) : null}

          {sectionId === 'garmin' ? (
            <div className="space-y-3">
              {isInsightVisible('garmin_readiness') ? <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"><p className="text-sm font-semibold text-slate-900 dark:text-white">Readiness: {garminSurface.readiness.state}</p><ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">{garminSurface.readiness.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
              {isInsightVisible('garmin_history') ? <div className="grid gap-3 sm:grid-cols-3">{garminSurface.history.map((window) => <div key={window.window} className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{window.window}</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{window.totalSteps ?? 0} steps</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{window.modifierDayCount} days, {window.workoutSummaryCount} workouts</p></div>)}</div> : null}
              {isInsightVisible('garmin_conflicts') ? <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">Sync status: {garminSurface.syncStatus ?? 'unknown'} | Ignored conflicts: {garminSurface.ignoredConflictCount} | Conflict dates: {garminSurface.visibleConflictDates.slice(0, 4).join(', ') || 'none'}</div> : null}
              <button type="button" className="action-button-secondary w-full" onClick={onOpenWeight}>Open Garmin and weight details</button>
            </div>
          ) : null}

          {sectionId === 'workouts' ? (
            <div className="space-y-3">
              {workoutSnapshot.actionCard ? (
                <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Today&apos;s action
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    {workoutSnapshot.actionCard.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {workoutSnapshot.actionCard.summary}
                  </p>
                </div>
              ) : null}
              {isInsightVisible('workouts_summary') ? <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Programs</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{workoutSnapshot.activeProgramCount}</p></div><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Sessions in 7d</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{workoutSnapshot.completedSessionCount7d}</p></div><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Volume in 7d</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{workoutSnapshot.volumeLoad7d}</p></div></div> : null}
              {isInsightVisible('workouts_strength') ? <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"><p className="text-sm font-semibold text-slate-900 dark:text-white">{workoutSnapshot.strengthRetention.anchorLiftName ?? 'Anchor lift'}: {workoutSnapshot.strengthRetention.anchorLiftTrend}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Volume floor {workoutSnapshot.strengthRetention.volumeFloorStatus} | Strength score {workoutSnapshot.strengthRetention.strengthRetentionScore}</p></div> : null}
              {isInsightVisible('workouts_analytics') ? <div className="grid gap-3 sm:grid-cols-2">{workoutSnapshot.muscleGroupSetCounts.slice(0, 4).map((entry) => <div key={entry.muscleGroup} className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.muscleGroup.replace('_', ' ')}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.setCount7d} sets in 7d</p></div>)}</div> : null}
              <button type="button" className="action-button w-full" onClick={onOpenWorkouts}>Open workouts</button>
            </div>
          ) : null}

          {sectionId === 'body_progress' ? (
            <div className="space-y-3">
              {isInsightVisible('body_progress_latest') && latestBodyProgress ? <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Latest snapshot</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{formatShortDate(latestBodyProgress.date)}</p></div><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Metrics</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{latestBodyProgress.metrics.length}</p></div><div className="rounded-[20px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70"><p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Photos</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{latestBodyProgress.photos.length}</p></div></div> : null}
              {isInsightVisible('body_progress_compare') && latestBodyProgress ? (
                <div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {morningSnapshot?.bodyProgress?.storySummary ??
                      `Compare view: ${latestBodyProgress.date}${compareBodyProgress ? ` vs ${compareBodyProgress.date}` : ' (add one more snapshot for side-by-side compare)'}`}
                  </p>
                  {morningSnapshot?.bodyProgress?.waistTrendLabel ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {morningSnapshot.bodyProgress.waistTrendLabel}
                    </p>
                  ) : null}
                  {morningSnapshot?.bodyProgress?.missingPhoto ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      Missing compare photo in the current quick review.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <button type="button" className="action-button-secondary w-full" onClick={onOpenWeight}>Open body progress</button>
            </div>
          ) : null}

          {sectionId === 'benchmark' ? (
            isInsightVisible('benchmark_latest') ? <div className="space-y-3"><div className="rounded-[20px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"><p className="text-sm font-semibold text-slate-900 dark:text-white">{claimSnapshot?.passed ? 'Live claim eligible' : 'Live claim blocked'}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{claimSnapshot?.blockedReason ?? latestBenchmark?.blockedReason ?? 'No live claim evaluation has been recorded yet.'}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Scenarios: {claimSnapshot?.scenarioCount ?? latestBenchmark?.scenarios.length ?? 0} {claimSnapshot?.latestBenchmarkCreatedAt ? `| Last benchmark ${formatShortDate(claimSnapshot.latestBenchmarkCreatedAt.slice(0, 10))}` : ''}</p></div>{claimSnapshot ? <div className="grid gap-2 sm:grid-cols-2">{Object.entries(claimSnapshot.readiness).map(([key, value]) => <div key={key} className="rounded-[18px] bg-slate-100/80 px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-950/60 dark:text-slate-200">{key.replace(/([A-Z])/g, ' $1')}: {value ? 'ready' : 'blocked'}</div>)}</div> : null}<button type="button" className="action-button-secondary w-full" onClick={onOpenSettings}>Open settings and recovery</button></div> : null
          ) : null}
        </section>
      ))}

      {layout.hiddenSectionIds.length ? (
        <section className="app-card space-y-3 px-4 py-4">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">Hidden sections</p>
          <div className="flex flex-wrap gap-2">
            {layout.hiddenSectionIds.map((sectionId) => (
              <button key={sectionId} type="button" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200" onClick={() => toggleSectionHidden(sectionId)}>
                Show {sectionId.replace('_', ' ')}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
