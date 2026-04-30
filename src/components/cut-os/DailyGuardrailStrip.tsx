import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { DailyGuardrailRoute, DailyMistakeProofModel, TrustRepairReasonCode } from '../../types'

interface DailyGuardrailStripProps {
  model: DailyMistakeProofModel
  onActivateRoute?: (route: DailyGuardrailRoute, targetId?: string) => void
}

function reasonLabel(reasonCode: TrustRepairReasonCode): string {
  switch (reasonCode) {
    case 'missing_macros':
      return 'Missing macros'
    case 'missing_serving_basis':
      return 'Serving basis'
    case 'provider_conflict':
      return 'Provider conflict'
    case 'low_confidence':
      return 'Low confidence'
    case 'unreviewed_ai':
      return 'AI review'
    case 'impossible_value':
      return 'Impossible value'
    default:
      return 'Needs review'
  }
}

export function DailyGuardrailStrip({ model, onActivateRoute }: DailyGuardrailStripProps) {
  const primary = model.primaryGuardrail
  if (!primary) {
    return null
  }

  const toneClass =
    primary.severity === 'block'
      ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
      : primary.severity === 'warn'
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'
        : 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-teal-100'
  const Icon = primary.severity === 'block' ? AlertTriangle : primary.severity === 'warn' ? ShieldCheck : CheckCircle2

  return (
    <section
      data-testid="daily-guardrail-strip"
      className={`rounded-[24px] border px-4 py-3 shadow-sm ${toneClass}`}
      aria-label="Daily guardrail"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">
                {model.readiness === 'ready' ? 'Ready' : model.readiness === 'blocked' ? 'Blocked' : 'Needs repair'}
              </p>
              <p data-testid="daily-guardrail-primary" className="mt-1 text-sm font-semibold">
                {primary.title}
              </p>
            </div>
            <button
              type="button"
              className="min-h-[36px] shrink-0 rounded-full bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-white dark:bg-slate-950/70 dark:text-white dark:hover:bg-slate-900"
              onClick={() => onActivateRoute?.(primary.cta.route, primary.cta.targetId)}
            >
              {primary.cta.label}
            </button>
          </div>
          <p className="mt-1 text-sm opacity-90">{primary.reason}</p>
          {model.trustRepairs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {model.trustRepairs.slice(0, 3).map((task) => (
                <span
                  key={task.id}
                  className="rounded-full bg-white/65 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm dark:bg-slate-950/60 dark:text-slate-100"
                >
                  {reasonLabel(task.reasonCode)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
