export type BulkActionMode = 'append' | 'replace'

interface BulkModeSelectorProps {
  value: BulkActionMode
  onChange: (mode: BulkActionMode) => void
  title?: string
  appendLabel?: string
  appendDescription?: string
  replaceLabel?: string
  replaceDescription?: string
  disabledReplace?: boolean
}

export function BulkModeSelector({
  value,
  onChange,
  title = 'How should this apply?',
  appendLabel = 'Append',
  appendDescription = 'Keep what is already logged and add the incoming items after it.',
  replaceLabel = 'Replace',
  replaceDescription = 'Clear the destination first, then apply only the incoming items.',
  disabledReplace = false,
}: BulkModeSelectorProps) {
  return (
    <section className="rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
          Apply mode
        </p>
        <p className="font-display text-xl text-slate-900 dark:text-white">{title}</p>
      </div>

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          className={`rounded-[24px] border px-4 py-4 text-left transition ${
            value === 'append'
              ? 'border-teal-400 bg-teal-50 shadow-glow dark:border-teal-500/40 dark:bg-teal-500/10'
              : 'border-black/5 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900'
          }`}
          onClick={() => onChange('append')}
        >
          <p className="font-semibold text-slate-900 dark:text-white">{appendLabel}</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{appendDescription}</p>
        </button>

        <button
          type="button"
          className={`rounded-[24px] border px-4 py-4 text-left transition ${
            value === 'replace'
              ? 'border-amber-300 bg-amber-50 shadow-glow dark:border-amber-500/40 dark:bg-amber-500/10'
              : 'border-black/5 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900'
          } ${disabledReplace ? 'cursor-not-allowed opacity-60' : ''}`}
          onClick={() => {
            if (!disabledReplace) {
              onChange('replace')
            }
          }}
          disabled={disabledReplace}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-slate-900 dark:text-white">{replaceLabel}</p>
            {disabledReplace ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                unavailable
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{replaceDescription}</p>
        </button>
      </div>
    </section>
  )
}
