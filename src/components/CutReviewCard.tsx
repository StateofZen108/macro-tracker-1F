import type { CutEvidenceReason, CutReviewCard as CutReviewCardModel } from '../types'

interface CutReviewCardProps {
  card: CutReviewCardModel
  variant?: 'dashboard' | 'coach' | 'weight'
  onApply?: () => void
  onDefer?: () => void
  onOpenCoach?: () => void
}

const EVIDENCE_LABELS: Record<CutEvidenceReason, string> = {
  waist_trend: 'Waist trend',
  scale_rate: 'Scale rate',
  expected_refeed_spike: 'Expected refeed spike',
  expected_diet_break_spike: 'Expected diet-break spike',
  logging_quality: 'Logging quality',
  protein_adherence: 'Protein adherence',
  step_adherence: 'Step adherence',
  recovery_risk: 'Recovery risk',
  strength_retention: 'Strength retention',
  recent_intervention: 'Recent intervention',
}

const VERDICT_LABELS: Record<CutReviewCardModel['verdict'], string> = {
  on_track: 'On track',
  confounded_stall: 'Confounded stall',
  needs_clean_confirmation: 'Needs confirmation',
  true_stall: 'True stall',
  too_fast_with_risk: 'Too fast with risk',
}

function toneClass(verdict: CutReviewCardModel['verdict']): string {
  if (verdict === 'true_stall') {
    return 'border-amber-200 bg-amber-50/80 dark:border-amber-500/30 dark:bg-amber-500/10'
  }

  if (verdict === 'too_fast_with_risk') {
    return 'border-rose-200 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-500/10'
  }

  if (verdict === 'confounded_stall' || verdict === 'needs_clean_confirmation') {
    return 'border-sky-200 bg-sky-50/80 dark:border-sky-500/30 dark:bg-sky-500/10'
  }

  return 'border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10'
}

export function CutReviewCard({
  card,
  variant = 'coach',
  onApply,
  onDefer,
  onOpenCoach,
}: CutReviewCardProps) {
  const showCoachActions = variant === 'coach'
  const showCoachLink = variant === 'dashboard' && onOpenCoach

  return (
    <section className={`rounded-[24px] border px-4 py-4 ${toneClass(card.verdict)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
            Adaptive cut review
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{card.title}</p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{card.summary}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
            Verdict
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {VERDICT_LABELS[card.verdict]}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[20px] bg-white/70 px-3 py-3 dark:bg-slate-950/40">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Confidence
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {card.confidence.replace('_', ' ')}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{card.confidenceReason}</p>
        </div>
        <div className="rounded-[20px] bg-white/70 px-3 py-3 dark:bg-slate-950/40">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Next review
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {card.nextReviewDate}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            State: {card.state.replace('_', ' ')}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {card.evidenceReasons.map((reason) => (
          <span
            key={reason}
            className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:bg-slate-950/50 dark:text-slate-300"
          >
            {EVIDENCE_LABELS[reason]}
          </span>
        ))}
      </div>

      {showCoachActions ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {card.state !== 'accepted' && onApply ? (
            <button type="button" className="action-button" onClick={onApply}>
              {card.applyLabel ?? 'Apply review'}
            </button>
          ) : null}
          {card.state !== 'accepted' && onDefer ? (
            <button type="button" className="action-button-secondary" onClick={onDefer}>
              Defer for now
            </button>
          ) : null}
        </div>
      ) : null}

      {showCoachLink ? (
        <div className="mt-4">
          <button type="button" className="action-button-secondary w-full" onClick={onOpenCoach}>
            Review in Coach
          </button>
        </div>
      ) : null}
    </section>
  )
}
