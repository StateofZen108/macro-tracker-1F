import { CheckCircle2, CircleDot } from 'lucide-react'
import type { CutOsActionTarget, CutOsSetupChecklistItem } from '../../types'

interface CutOsSetupChecklistProps {
  items: CutOsSetupChecklistItem[]
  onActivateTarget?: (target: CutOsActionTarget) => void
}

export function CutOsSetupChecklist({ items, onActivateTarget }: CutOsSetupChecklistProps) {
  if (!items.length) {
    return null
  }

  return (
    <div className="space-y-2" data-testid="cut-os-setup-checklist">
      {items.map((item) => {
        const complete = item.status === 'complete'
        return (
          <button
            key={item.id}
            type="button"
            className={`flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left text-sm transition ${
              complete
                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100'
                : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
            onClick={() => onActivateTarget?.(item.routeTarget)}
            data-testid={`cut-os-setup-${item.id}`}
          >
            {complete ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CircleDot className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0">
              <span className="block font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-xs opacity-85">{item.detail}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
