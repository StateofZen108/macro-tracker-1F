import type { CoachingInsight, UserSettings } from '../types'

interface CoachingCardProps {
  insight: CoachingInsight
  settings: UserSettings
  recommendationDismissed: boolean
  onOpenCoach?: () => void
  onApplyRecommendation: () => void
  onKeepCurrent: () => void
  onDismiss: () => void
}

function confidenceTone(confidence: CoachingInsight['confidenceBand']): string {
  if (confidence === 'high') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
  }

  if (confidence === 'medium') {
    return 'bg-teal-100 text-teal-800 dark:bg-teal-500/10 dark:text-teal-200'
  }

  if (confidence === 'low') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function toneMessage(insight: CoachingInsight): string {
  if (insight.adherenceTone === 'over') {
    return 'Eligible-day intake is trending above the current recommendation.'
  }

  if (insight.adherenceTone === 'under') {
    return 'Eligible-day intake is trending below the current recommendation.'
  }

  if (insight.adherenceTone === 'onTrack') {
    return 'Eligible-day intake is tracking close to the current recommendation.'
  }

  return 'Keep logging complete or fasting days to strengthen the model.'
}

export function CoachingCard({
  insight,
  settings,
  recommendationDismissed,
  onOpenCoach,
  onApplyRecommendation,
  onKeepCurrent,
  onDismiss,
}: CoachingCardProps) {
  return (
    <section className="app-card space-y-4 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Coaching
          </p>
          <p className="font-display text-2xl text-slate-900 dark:text-white">{insight.reason}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${confidenceTone(insight.confidenceBand)}`}
        >
          {insight.confidenceBand}
        </span>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">{insight.explanation}</p>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Confidence score</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {insight.confidenceScore ?? '--'}/100
          </p>
        </div>
        <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Avg calories</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {insight.avgDailyCalories ?? '--'}
          </p>
        </div>
        <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Estimated TDEE</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {insight.estimatedTdee ?? '--'}
          </p>
        </div>
        <div className="rounded-[22px] bg-slate-100/80 px-4 py-3 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Weight trend</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            {insight.weightChange === null ? '--' : `${insight.weightChange} ${insight.weightChangeUnit}`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[22px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-slate-900/50">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Eligible days</p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
            {insight.eligibleDays}/{insight.windowDays}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            {insight.completeDays} complete • {insight.fastingDays} fasting • {insight.partialDays} partial
          </p>
        </div>
        <div className="rounded-[22px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-slate-900/50">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Weigh-ins</p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
            {insight.weighInDays}/{insight.windowDays}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            {insight.unmarkedLoggedDays} unmarked logged day{insight.unmarkedLoggedDays === 1 ? '' : 's'}
          </p>
        </div>
        <div className="rounded-[22px] border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-slate-900/50">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Calibration</p>
          <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
            {insight.calibrationPhase}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            {insight.calibratedConfidencePercent === null
              ? 'Collecting validated windows'
              : `Historically within about 150 kcal/day ${insight.calibratedConfidencePercent}% of the time.`}
          </p>
        </div>
      </div>

      <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Goal: {settings.goalMode}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{toneMessage(insight)}</p>
        {insight.allDayRecommendedCalories !== null ? (
          <div className="mt-3 space-y-1">
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              All-days target: {insight.allDayRecommendedCalories} cal
            </p>
            {insight.eatingDayRecommendedCalories !== null ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Eating-day target: {insight.eatingDayRecommendedCalories} cal
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {insight.confounders.length ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold">Confounders</p>
          <ul className="mt-2 space-y-1">
            {insight.confounders.map((confounder) => (
              <li key={confounder}>{confounder}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {insight.isReady && insight.allDayRecommendedCalories !== null && !recommendationDismissed ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <button type="button" className="action-button" onClick={onApplyRecommendation}>
            Apply suggestion
          </button>
          <button type="button" className="action-button-secondary" onClick={onKeepCurrent}>
            Keep current
          </button>
          <button type="button" className="action-button-secondary" onClick={onDismiss}>
            Dismiss
          </button>
          {onOpenCoach ? (
            <button type="button" className="action-button-secondary" onClick={onOpenCoach}>
              Ask coach
            </button>
          ) : null}
        </div>
      ) : onOpenCoach ? (
        <button type="button" className="action-button-secondary w-full" onClick={onOpenCoach}>
          Ask coach
        </button>
      ) : null}
    </section>
  )
}
