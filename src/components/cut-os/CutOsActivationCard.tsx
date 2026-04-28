import { ArrowRight, CheckCircle2, CircleDot, Play, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { CutOsActivationAction, CutOsActivationModel } from '../../types'

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
      className="app-card space-y-4 px-4 py-4"
      data-testid="cut-os-activation"
      data-cut-os-activation-state={model.state}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            10-minute activation
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
            {model.headline}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {model.summary}
          </p>
        </div>
        {model.nextProof ? (
          <span className="status-chip">
            Next proof: {model.nextProof.label}
          </span>
        ) : (
          <span className="status-chip bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            Proof ready
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="action-button flex-1 gap-2"
          onClick={() => activate(model.primaryAction)}
        >
          {model.primaryAction.label}
          {actionIcon(model.primaryAction)}
        </button>
        {model.secondaryActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="action-button-secondary flex-1 gap-2"
            onClick={() => activate(action)}
          >
            {action.label}
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
