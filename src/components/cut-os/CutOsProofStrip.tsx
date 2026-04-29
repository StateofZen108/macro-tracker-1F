import { useEffect } from 'react'
import type { CutOsSurfaceModel } from '../../types'
import { recordUiTelemetry } from '../../utils/uiTelemetry'

interface CutOsProofStripProps {
  model: CutOsSurfaceModel
  compact?: boolean
}

function formatVerdict(value: string): string {
  return value.replaceAll('_', ' ')
}

export function CutOsProofStrip({ model, compact = false }: CutOsProofStripProps) {
  useEffect(() => {
    recordUiTelemetry('ui.proof_strip.rendered', 'Premium Cut OS proof strip rendered')
  }, [])

  const tokens = [
    {
      id: 'scale',
      label: 'Scale',
      value: model.diagnosis.scaleVerdict,
      className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100',
      dotClassName: 'bg-emerald-500',
    },
    {
      id: 'training',
      label: 'Training',
      value: model.diagnosis.trainingVerdict,
      className: 'border-sky-500/20 bg-sky-500/10 text-sky-800 dark:text-sky-100',
      dotClassName: 'bg-sky-500',
    },
    {
      id: 'food',
      label: 'Food',
      value: model.diagnosis.foodTrustVerdict,
      className: 'border-orange-500/20 bg-orange-500/10 text-orange-800 dark:text-orange-100',
      dotClassName: 'bg-orange-500',
    },
    {
      id: 'phase',
      label: 'Phase',
      value: model.diagnosis.phaseVerdict,
      className: 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-100',
      dotClassName: 'bg-amber-500',
    },
  ] as const

  return (
    <div
      data-testid="cut-os-proof-strip"
      className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}
    >
      {tokens.map(({ id, label, value, className, dotClassName }) => (
        <div
          key={id}
          data-testid={`proof-token-${id}`}
          className={`min-w-0 rounded-2xl border px-2.5 py-2 ${className}`}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em]">{label}</span>
          </div>
          <p className="mt-1 truncate text-xs font-semibold">{formatVerdict(value)}</p>
        </div>
      ))}
    </div>
  )
}
