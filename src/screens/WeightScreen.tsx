import { useMemo, useState } from 'react'
import { WeightChart } from '../components/WeightChart'
import type {
  ActionResult,
  CheckInRecord,
  CoachingDecisionRecord,
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
  onSaveWeight: (date: string, weight: number, unit: UserSettings['weightUnit']) => ActionResult<void>
  onDeleteWeight: (date: string) => ActionResult<void>
  onApplyCheckInSuggestion: () => void
  onKeepCurrentCheckIn: () => void
  onOpenCoach?: () => void
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

function CheckInStatusBadge({ status }: { status: CheckInRecord['status'] }) {
  const tone =
    status === 'applied'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
      : status === 'kept'
        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
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

  function handleSaveWeight(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()

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

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" className="action-button flex-1" aria-label={saveLabel}>
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
  onSaveWeight,
  onDeleteWeight,
  onApplyCheckInSuggestion,
  onKeepCurrentCheckIn,
  onOpenCoach,
}: WeightScreenProps) {
  const today = getTodayDateKey()
  const todayEntry = weights.find((entry) => entry.date === today) ?? null
  const latestEntry = weights[0] ?? null
  const [selectedRange, setSelectedRange] = useState<WeightRange>('30')
  const [editorDate, setEditorDate] = useState(today)

  const chartPoints = buildWeightChartPoints(weights, selectedRange, settings.weightUnit)
  const latestTrend = [...chartPoints].reverse().find((point) => point.trend !== null)?.trend ?? null
  const editingEntry = useMemo(
    () => weights.find((entry) => entry.date === editorDate) ?? null,
    [editorDate, weights],
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

  return (
    <div className="space-y-4 pb-6">
      <section className="app-card space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              Weekly check-in
            </p>
            <p className="font-display text-2xl text-slate-900 dark:text-white">
              {currentCheckIn ? currentCheckIn.recommendationReason : 'Check-in not available yet'}
            </p>
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
              {currentCheckIn.reasonCodes?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
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
            </div>

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
              </div>
            ) : null}

            {shouldShowActionButtons ? (
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

      <section className="app-card space-y-4 px-4 py-4">
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
