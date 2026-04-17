import { useMemo, useState } from 'react'
import { CoachMessageCard } from '../components/coach/CoachMessageCard'
import type {
  CoachActionProposal,
  CoachFeedback,
  CoachMessage,
  CoachMode,
  CoachProviderConfig,
  CoachQueuedQuestion,
  CoachState,
  CheckInRecord,
  CutDayPlan,
  FastCheckInRun,
  WorkoutActionCard,
} from '../types'

interface CoachScreenProps {
  coachState: CoachState
  preferredMode: CoachMode
  citationsExpanded: boolean
  config: CoachProviderConfig
  thread: CoachMessage[]
  queue: CoachQueuedQuestion[]
  feedback: CoachFeedback[]
  starterPrompts: string[]
  onAsk: (question: string, mode: CoachMode) => void
  onClearQueued: (questionId: string) => void
  onRate: (messageId: string, rating: 'up' | 'down') => void
  onProposal: (proposal: CoachActionProposal) => void
  onClearThread: () => void
  onChangePreferredMode: (mode: CoachMode) => void
  onToggleCitationsExpanded: (nextValue: boolean) => void
  onSetProvider: (provider: CoachProviderConfig['provider']) => void
  currentCheckIn?: CheckInRecord | null
  fastCheckInEnabled?: boolean
  lastFastCheckInRun?: FastCheckInRun
  onRunFastCheckIn?: () => void
  cutDayPlan?: CutDayPlan | null
  workoutAction?: WorkoutActionCard
  onOpenWorkouts?: () => void
}

function stateCopy(state: CoachState): { title: string; description: string } {
  if (state === 'offline') {
    return {
      title: 'Coach is offline',
      description: 'Core logging still works. New coach questions can be queued and sent later.',
    }
  }

  if (state === 'queued') {
    return {
      title: 'Queued questions waiting',
      description: 'Your local thread is saved. Connect a live provider later to send queued questions.',
    }
  }

  if (state === 'notConfigured') {
    return {
      title: 'Provider not configured',
      description: 'Ask Coach is built, but no AI provider is connected yet. Questions will be saved locally.',
    }
  }

  if (state === 'failed') {
    return {
      title: 'Coach send failed',
      description: 'Your thread is still cached locally. Retry after provider setup is fixed.',
    }
  }

  return {
    title: 'Coach ready',
    description: 'This build has the coach surface and local queue in place.',
  }
}

function formatEvidenceReason(reason: WorkoutActionCard['evidenceReasons'][number]): string {
  switch (reason) {
    case 'readiness_freshness':
      return 'Readiness freshness'
    case 'anchor_lift_trend':
      return 'Anchor-lift trend'
    case 'recent_records':
      return 'Recent records'
    case 'volume_floor':
      return 'Volume floor'
    case 'completion_adherence':
      return 'Completion adherence'
    default:
      return reason
  }
}

export function CoachScreen({
  coachState,
  preferredMode,
  citationsExpanded,
  config,
  thread,
  queue,
  feedback,
  starterPrompts,
  onAsk,
  onClearQueued,
  onRate,
  onProposal,
  onClearThread,
  onChangePreferredMode,
  onToggleCitationsExpanded,
  onSetProvider,
  currentCheckIn = null,
  fastCheckInEnabled = false,
  lastFastCheckInRun,
  onRunFastCheckIn,
  cutDayPlan = null,
  workoutAction,
  onOpenWorkouts,
}: CoachScreenProps) {
  const [question, setQuestion] = useState('')
  const feedbackByMessageId = useMemo(
    () => new Map(feedback.map((entry) => [entry.messageId, entry])),
    [feedback],
  )
  const stateBanner = stateCopy(coachState)

  return (
    <div className="space-y-4 pb-6">
      <section className="app-card space-y-4 px-4 py-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            Ask Coach
          </p>
          <p className="font-display text-2xl text-slate-900 dark:text-white">{stateBanner.title}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{stateBanner.description}</p>
        </div>

        {fastCheckInEnabled && currentCheckIn ? (
          <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Fast check-in</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Run the one-tap recommendation path from the current persisted week, then switch to Standard Check-In if module review is still needed.
              </p>
            </div>
            <button type="button" className="action-button w-full" onClick={() => onRunFastCheckIn?.()}>
              Run Fast Check-In
            </button>
            {lastFastCheckInRun ? (
              <div className="rounded-[20px] bg-slate-100/80 px-4 py-3 text-sm text-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
                <p className="font-semibold text-slate-900 dark:text-white">{lastFastCheckInRun.recommendationSummary}</p>
                {lastFastCheckInRun.unresolvedModules.length ? (
                  <p className="mt-1">
                    {lastFastCheckInRun.unresolvedModules.length} unresolved module
                    {lastFastCheckInRun.unresolvedModules.length === 1 ? '' : 's'} still point back to Standard Check-In.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {cutDayPlan ? (
          <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Cut day
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {cutDayPlan.macroIntentLabel}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{cutDayPlan.whyToday}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {cutDayPlan.dayType.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              Training intent: {cutDayPlan.trainingIntentLabel}
            </div>
          </div>
        ) : null}

        {workoutAction ? (
          <div className="space-y-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Today&apos;s training action
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {workoutAction.title}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {workoutAction.summary}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {workoutAction.freshnessLabel}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {workoutAction.confidence} confidence
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {workoutAction.mode === 'review_first' ? 'Review first' : 'Directive'}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {workoutAction.source === 'manual_override' ? 'Manual' : 'Computed'}
                </span>
              </div>
            </div>
            {workoutAction.secondaryNote ? (
              <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                {workoutAction.secondaryNote}
              </div>
            ) : null}
            <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
              {workoutAction.confidenceReason}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Fuel
                </p>
                <p className="mt-1">{workoutAction.fuelDirective}</p>
              </div>
              <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Volume
                </p>
                <p className="mt-1">{workoutAction.volumeDirective}</p>
              </div>
              <div className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Preservation risk
                </p>
                <p className="mt-1">{workoutAction.preservationRisk}</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {workoutAction.reasons.map((reason) => (
                <div
                  key={reason}
                  className="rounded-[18px] bg-slate-100/80 px-3 py-3 text-sm text-slate-700 dark:bg-slate-950/60 dark:text-slate-200"
                >
                  {reason}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {workoutAction.evidenceReasons.map((reason) => (
                <span
                  key={reason}
                  className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {formatEvidenceReason(reason)}
                </span>
              ))}
            </div>
            {onOpenWorkouts ? (
              <button type="button" className="action-button-secondary w-full" onClick={onOpenWorkouts}>
                {workoutAction.primaryCta}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Preferred mode</p>
            <div className="mt-3 flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['standard', 'deep'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`flex-1 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    preferredMode === mode
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                  onClick={() => onChangePreferredMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Provider scaffold</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['none', 'gemini', 'openai', 'anthropic'] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className={`rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    config.provider === provider
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                  onClick={() => onSetProvider(provider)}
                >
                  {provider}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center justify-between rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200">
          <span>Show citation summaries by default</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-teal-700"
            checked={citationsExpanded}
            onChange={(event) => onToggleCitationsExpanded(event.target.checked)}
          />
        </label>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Ask a question
            <textarea
              className="field mt-2 min-h-28"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about your trend, calorie target, fasting, partial days, or intervention confounders."
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="action-button flex-1"
              onClick={() => {
                onAsk(question, preferredMode)
                setQuestion('')
              }}
            >
              Queue question
            </button>
            <button type="button" className="action-button-secondary flex-1" onClick={onClearThread}>
              Clear local thread
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Starter prompts</p>
          <div className="grid gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-2xl border border-black/5 bg-white/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => {
                  onAsk(prompt, preferredMode)
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {queue.length ? (
        <section className="app-card space-y-3 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
                Offline / pending queue
              </p>
              <p className="font-display text-2xl text-slate-900 dark:text-white">{queue.length} queued</p>
            </div>
          </div>

          <div className="space-y-2">
            {queue.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{entry.question}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                    {entry.mode} • {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-rose-700 dark:text-rose-300"
                  onClick={() => onClearQueued(entry.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {thread.length ? (
          thread.map((message) => (
            <CoachMessageCard
              key={message.id}
              message={message}
              feedback={feedbackByMessageId.get(message.id)}
              citationsExpanded={citationsExpanded}
              onRate={onRate}
              onProposal={onProposal}
            />
          ))
        ) : (
          <div className="app-card px-4 py-6 text-sm text-slate-600 dark:text-slate-300">
            Your local coach thread will appear here after you queue a question or apply a starter prompt.
          </div>
        )}
      </section>
    </div>
  )
}
