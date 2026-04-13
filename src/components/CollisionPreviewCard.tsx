import type { BulkActionMode } from './BulkModeSelector'

export interface CollisionPreview {
  currentCount?: number
  incomingCount?: number
  resultingCount?: number
  overwrittenCount?: number
  summary?: string
  warning?: string
  sampleNames?: string[]
}

interface CollisionPreviewCardProps {
  mode: BulkActionMode
  preview?: CollisionPreview | null
  title?: string
  appendFallback?: string
  replaceFallback?: string
}

function formatCount(value: number | undefined, fallback = '--'): string {
  return value === undefined ? fallback : `${value}`
}

export function CollisionPreviewCard({
  mode,
  preview,
  title = 'Preview',
  appendFallback = 'Append keeps the current destination intact and adds the incoming items after it.',
  replaceFallback = 'Replace clears the destination first and then applies the incoming items.',
}: CollisionPreviewCardProps) {
  const fallbackMessage = mode === 'append' ? appendFallback : replaceFallback

  return (
    <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-4 dark:border-teal-500/40 dark:bg-teal-500/10">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
          {title}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          {preview?.summary ?? fallbackMessage}
        </p>
      </div>

      {preview ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl bg-white/80 px-3 py-3 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Current
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {formatCount(preview.currentCount)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-3 py-3 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Incoming
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {formatCount(preview.incomingCount)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-3 py-3 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Result
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {formatCount(preview.resultingCount)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/80 px-3 py-3 dark:bg-slate-950/60">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Replaced
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {formatCount(preview.overwrittenCount)}
              </p>
            </div>
          </div>

          {preview.sampleNames?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.sampleNames.slice(0, 5).map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-950/60 dark:text-slate-200"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : null}

          {preview.warning ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {preview.warning}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
