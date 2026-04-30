import { ArrowRight, Clock3 } from 'lucide-react'
import { FEATURE_FLAGS } from '../../config/featureFlags'
import type { CutOsActionTarget, CutOsSurfaceModel } from '../../types'
import { CutOsActionHistory } from './CutOsActionHistory'
import { CutOsProofStack } from './CutOsProofStack'
import { CutOsProofStrip } from './CutOsProofStrip'
import { CutOsSetupChecklist } from './CutOsSetupChecklist'

interface CutOsCommandCardProps {
  model: CutOsSurfaceModel
  surface: 'dashboard' | 'log' | 'weight' | 'coach'
  compact?: boolean
  showProofs?: boolean
  showSetup?: boolean
  showHistory?: boolean
  onActivateTarget: (target: CutOsActionTarget) => void
}

function confidenceBadgeTone(confidence: CutOsSurfaceModel['command']['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
    case 'medium':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  }
}

function formatVerdict(value: string): string {
  return value.replaceAll('_', ' ')
}

export function CutOsCommandCard({
  model,
  surface,
  compact = false,
  showProofs = true,
  showSetup = true,
  showHistory = false,
  onActivateTarget,
}: CutOsCommandCardProps) {
  const { command, diagnosis, activeAction } = model
  const proofLimit = compact ? 2 : surface === 'coach' ? undefined : 3
  const pendingSetup = model.setup.filter((item) => item.status === 'pending')
  const showPremiumProofStrip = FEATURE_FLAGS.premiumUiV1 && FEATURE_FLAGS.premiumProofStripV1
  const actionIsRepair =
    command.cta.target === 'review_food' ||
    command.cta.target === 'log' ||
    command.cta.target === 'weigh_in' ||
    command.cta.target === 'train'
  const suppressActionCta =
    FEATURE_FLAGS.mistakeProofCutV1 &&
    model.dailyGuardrails?.readiness === 'blocked' &&
    !actionIsRepair
  const testId =
    surface === 'dashboard'
      ? 'cut-os-command'
      : surface === 'log'
        ? 'cut-os-log-cta'
        : surface === 'coach'
          ? 'cut-os-coach-packet'
          : 'cut-os-weight'

  return (
    <section
      className={`app-card space-y-4 px-4 py-4 ${compact ? 'text-sm' : ''}`}
      data-testid={testId}
      data-cut-os-diagnosis-id={command.diagnosisId}
      data-cut-os-primary-action={command.primaryAction}
      data-cut-os-proof-ids={command.proofIds.join(',')}
      data-cut-os-action-status={activeAction?.status ?? 'none'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
            {surface === 'coach' ? 'Cut OS evidence packet' : surface === 'log' ? 'Today\'s Cut OS call' : 'Cut OS'}
          </p>
          <p className={`mt-1 font-semibold text-slate-950 dark:text-white ${compact ? 'text-lg' : 'text-2xl'}`}>
            {command.primaryAction}
          </p>
          {activeAction ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              {activeAction.status} on {formatVerdict(activeAction.actionTarget)}
            </p>
          ) : null}
        </div>
        <span className={`status-chip ${confidenceBadgeTone(command.confidence)}`}>
          {command.confidence} confidence
        </span>
      </div>

      {suppressActionCta ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          Fix the active daily guardrail before applying this command. Cut OS will recompute the action after proof is trusted.
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="action-button flex-1 gap-2"
            onClick={() => onActivateTarget(command.cta.target)}
            data-testid="cut-os-primary-action"
          >
            {command.cta.label}
            <ArrowRight className="h-4 w-4" />
          </button>
          {command.secondaryActions.slice(0, compact ? 1 : 2).map((action) => (
            <button
              key={`${action.target}:${action.label}`}
              type="button"
              className="action-button-secondary flex-1"
              onClick={() => onActivateTarget(action.target)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {showPremiumProofStrip ? <CutOsProofStrip model={model} compact={compact} /> : null}

      {!compact && !showPremiumProofStrip ? (
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ['Scale', diagnosis.scaleVerdict],
            ['Training', diagnosis.trainingVerdict],
            ['Phase', diagnosis.phaseVerdict],
            ['Food trust', diagnosis.foodTrustVerdict],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[18px] bg-slate-100/80 px-3 py-3 text-sm dark:bg-slate-900/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {label}
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatVerdict(value)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {showSetup && pendingSetup.length > 0 ? (
        <CutOsSetupChecklist items={model.setup} onActivateTarget={onActivateTarget} />
      ) : null}

      {showProofs ? <CutOsProofStack proofs={model.proofs} limit={proofLimit} /> : null}
      {showHistory ? <CutOsActionHistory records={model.actionHistory} /> : null}
    </section>
  )
}
