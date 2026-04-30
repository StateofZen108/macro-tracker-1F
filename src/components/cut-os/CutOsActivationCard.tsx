import { ArrowRight, CheckCircle2, CircleDot, Play, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ActivationStep, CutOsActivationAction, CutOsActivationModel } from '../../types'

interface CutOsActivationCardProps {
  model: CutOsActivationModel
  onActivateAction: (action: CutOsActivationAction) => void
  onStartDemo: () => void
  onExitDemo: () => void
}

function receiptTone(status: CutOsActivationModel['proofReceipt'][number]['status']): string {
  if (status === 'ready') {
    return 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100'
  }

  if (status === 'blocked') {
    return 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100'
  }

  return 'bg-slate-100/80 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
}

function receiptIcon(status: CutOsActivationModel['proofReceipt'][number]['status']) {
  if (status === 'ready') {
    return <CheckCircle2 className="h-4 w-4" />
  }

  if (status === 'blocked') {
    return <TriangleAlert className="h-4 w-4" />
  }

  return <CircleDot className="h-4 w-4" />
}

function actionIcon(action: CutOsActivationAction) {
  if (action.kind === 'start_demo') {
    return <Play className="h-4 w-4" />
  }

  if (action.kind === 'exit_demo') {
    return <ShieldCheck className="h-4 w-4" />
  }

  return <ArrowRight className="h-4 w-4" />
}

function stepLabel(step: ActivationStep): string {
  switch (step.id) {
    case 'import_history':
      return 'Import'
    case 'log_first_food':
      return 'Log'
    case 'set_cut_target':
      return 'Target'
    case 'weigh_in':
      return 'Weigh'
    case 'ask_coach':
      return 'Coach'
    default:
      return step.id
  }
}

function stepTone(step: ActivationStep): string {
  if (step.status === 'complete') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100'
  }

  if (step.status === 'blocked') {
    return 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-100'
  }

  if (step.status === 'active') {
    return 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-100'
  }

  return 'border-black/5 bg-white/70 text-slate-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200'
}

export function CutOsActivationCard({
  model,
  onActivateAction,
  onStartDemo,
  onExitDemo,
}: CutOsActivationCardProps) {
  function activate(action: CutOsActivationAction): void {
    if (action.kind === 'start_demo') {
      onStartDemo()
      return
    }

    if (action.kind === 'exit_demo') {
      onExitDemo()
      return
    }

    onActivateAction(action)
  }

  return (
    <section
      className="app-card space-y-3 px-3 py-3"
      data-testid="cut-os-activation"
      data-cut-os-activation-state={model.state}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
            10-minute activation
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-slate-950 dark:text-white">
            {model.headline}
          </h2>
          <p className="mt-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
            {model.summary}
          </p>
        </div>
        {model.nextProof ? (
          <span className="status-chip px-2 py-1 text-[10px] tracking-[0.08em]">
            Next proof: {model.nextProof.label}
          </span>
        ) : (
          <span className="status-chip bg-emerald-100 px-2 py-1 text-[10px] tracking-[0.08em] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            Proof ready
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-1" data-testid="cut-os-activation-steps">
        {model.steps.map((step) => (
          <div
            key={step.id}
            className={`min-w-0 rounded-xl border px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.06em] ${stepTone(step)}`}
            data-testid={`activation-step-${step.id}`}
            data-activation-status={step.status}
          >
            <span className="block truncate">{stepLabel(step)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          className="action-button col-span-3 min-h-[40px] gap-2 px-3 py-2 text-xs sm:col-span-1"
          onClick={() => activate(model.primaryAction)}
        >
          {model.primaryAction.label}
          {actionIcon(model.primaryAction)}
        </button>
        {model.secondaryActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="action-button-secondary min-h-[40px] min-w-0 gap-1.5 px-2 py-2 text-xs"
            onClick={() => activate(action)}
          >
            <span className="truncate">{action.label}</span>
            {actionIcon(action)}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="cut-os-activation-receipt">
        {model.proofReceipt.map((item) => (
          <div key={item.id} className={`flex items-start gap-3 rounded-[18px] px-3 py-3 text-sm ${receiptTone(item.status)}`}>
            <span className="mt-0.5 shrink-0">{receiptIcon(item.status)}</span>
            <span className="min-w-0">
              <span className="block font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs opacity-85">{item.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
