import { Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface ScreenHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  onOpenSettings?: () => void
  actions?: ReactNode
}

export function ScreenHeader({
  eyebrow,
  title,
  description,
  onOpenSettings,
  actions,
}: ScreenHeaderProps) {
  return (
    <section className="app-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs uppercase tracking-[0.24em] text-teal-700 dark:text-teal-300">
              {eyebrow}
            </p>
          ) : null}
          <p className="mt-1 text-[1.7rem] font-semibold leading-tight text-slate-950 dark:text-white">
            {title}
          </p>
          {description ? (
            <p className="mt-2 max-w-[42rem] text-sm text-slate-600 dark:text-slate-300">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onOpenSettings ? (
            <button
              type="button"
              className="icon-button"
              onClick={onOpenSettings}
              aria-label="Settings"
            >
              <Settings2 className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
