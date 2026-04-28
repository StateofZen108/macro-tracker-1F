import { ShieldCheck } from 'lucide-react'
import type { CutOsProof } from '../../types'

interface CutOsProofStackProps {
  proofs: CutOsProof[]
  limit?: number
}

export function CutOsProofStack({ proofs, limit }: CutOsProofStackProps) {
  const visibleProofs = typeof limit === 'number' ? proofs.slice(0, limit) : proofs

  if (!visibleProofs.length) {
    return null
  }

  return (
    <div className="space-y-2" data-testid="cut-os-proof-stack">
      {visibleProofs.map((proof) => (
        <div
          key={proof.id}
          className={`flex items-start gap-3 rounded-[18px] px-3 py-3 text-sm ${
            proof.blocking
              ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100'
              : 'bg-white/80 text-slate-700 dark:bg-slate-950/60 dark:text-slate-200'
          }`}
          data-testid={`cut-os-proof-${proof.source}`}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900 dark:text-white">{proof.title}</p>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                {proof.strength}
              </span>
            </div>
            <p className="mt-1 text-xs opacity-90">{proof.summary}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
