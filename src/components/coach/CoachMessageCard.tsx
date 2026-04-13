import type {
  CoachActionProposal,
  CoachCitation,
  CoachFeedback,
  CoachMessage,
  CoachSafetyFlag,
} from '../../types'

interface CoachMessageCardProps {
  message: CoachMessage
  feedback?: CoachFeedback
  citationsExpanded: boolean
  onRate: (messageId: string, rating: 'up' | 'down') => void
  onProposal: (proposal: CoachActionProposal) => void
}

function roleStyles(role: CoachMessage['role']): string {
  if (role === 'assistant') {
    return 'border-teal-300 bg-teal-50/80 dark:border-teal-500/30 dark:bg-teal-500/10'
  }

  if (role === 'system') {
    return 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10'
  }

  return 'border-black/5 bg-white/80 dark:border-white/10 dark:bg-slate-900/80'
}

function renderCitations(citations: CoachCitation[] | undefined, expanded: boolean) {
  if (!citations?.length) {
    return null
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
        Citations
      </p>
      <div className="space-y-2">
        {citations.map((citation) => (
          <div
            key={citation.id}
            className="rounded-2xl border border-black/5 bg-white/70 px-3 py-3 text-sm dark:border-white/10 dark:bg-slate-900/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{citation.title}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  {citation.sourceType} • {citation.source}
                  {citation.year ? ` • ${citation.year}` : ''}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {citation.label}
              </span>
            </div>
            {expanded ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{citation.summary}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function renderSafetyFlags(flags: CoachSafetyFlag[] | undefined) {
  if (!flags?.length) {
    return null
  }

  return (
    <div className="space-y-2">
      {flags.map((flag) => (
        <div
          key={flag.id}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <p className="font-semibold capitalize">{flag.severity}</p>
          <p className="mt-1">{flag.message}</p>
        </div>
      ))}
    </div>
  )
}

export function CoachMessageCard({
  message,
  feedback,
  citationsExpanded,
  onRate,
  onProposal,
}: CoachMessageCardProps) {
  return (
    <article className={`space-y-3 rounded-[24px] border px-4 py-4 ${roleStyles(message.role)}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
          {message.role}
          {message.state ? ` • ${message.state}` : ''}
        </p>
        {message.mode ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {message.mode}
          </span>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{message.content}</p>

      {message.contextUsed?.length ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Context: {message.contextUsed.join(' • ')}
        </p>
      ) : null}

      {renderSafetyFlags(message.safetyFlags)}
      {renderCitations(message.citations, citationsExpanded)}

      {message.proposals?.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Suggested actions
          </p>
          <div className="grid gap-2">
            {message.proposals.map((proposal) => (
              <button
                key={proposal.id}
                type="button"
                className="rounded-2xl border border-black/5 bg-white/80 px-4 py-3 text-left transition hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900"
                onClick={() => onProposal(proposal)}
              >
                <p className="font-semibold text-slate-900 dark:text-white">{proposal.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{proposal.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {message.role === 'assistant' ? (
        <div className="flex gap-2">
          <button
            type="button"
            className={`action-button-secondary ${feedback?.rating === 'up' ? 'ring-2 ring-teal-400' : ''}`}
            onClick={() => onRate(message.id, 'up')}
          >
            Helpful
          </button>
          <button
            type="button"
            className={`action-button-secondary ${feedback?.rating === 'down' ? 'ring-2 ring-rose-400' : ''}`}
            onClick={() => onRate(message.id, 'down')}
          >
            Needs work
          </button>
        </div>
      ) : null}
    </article>
  )
}
