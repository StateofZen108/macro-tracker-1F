import type { CutOsHistoricalReplayReport } from '../../types'

interface CutOsValidationCardProps {
  report: CutOsHistoricalReplayReport
  compact?: boolean
  embedded?: boolean
}

function formatWindow(report: CutOsHistoricalReplayReport): string {
  if (!report.replayWindow.start || !report.replayWindow.end) {
    return 'Corpus replay fallback'
  }

  if (report.replayWindow.start === report.replayWindow.end) {
    return report.replayWindow.end
  }

  return `${report.replayWindow.start} to ${report.replayWindow.end}`
}

export function CutOsValidationCard({
  report,
  compact = false,
  embedded = false,
}: CutOsValidationCardProps) {
  const metrics = [
    { label: 'Days', value: report.reconstructedDays },
    { label: 'Stalls', value: report.trueStallsDetected },
    { label: 'Spikes held', value: report.expectedSpikesSuppressed },
    { label: 'Training wins', value: report.trainingLeaksPrioritized },
    { label: 'Food blocks', value: report.foodTrustBlocksCaught },
    { label: 'False escalations', value: report.falseEscalations },
    { label: 'Missed actions', value: report.missedActionableDays },
  ]

  const Shell = embedded ? 'div' : 'section'

  return (
    <Shell
      className={
        embedded
          ? 'space-y-3 rounded-[22px] bg-white/70 px-4 py-4 dark:bg-slate-950/50'
          : 'app-card space-y-3 px-4 py-4'
      }
      data-testid="cut-os-validation-card"
      data-replay-build-id={report.buildId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Historical validation
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
            Decision engine replay
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {formatWindow(report)}
          </p>
        </div>
        <span className="status-chip">
          {report.falseEscalations === 0 && report.missedActionableDays === 0 ? 'Clean' : 'Review'}
        </span>
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-2xl bg-white/70 px-3 py-3 text-slate-900 dark:bg-slate-950/50 dark:text-white"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              {metric.label}
            </p>
            <p className="mt-1 text-xl font-semibold">{metric.value}</p>
          </div>
        ))}
      </div>
    </Shell>
  )
}
