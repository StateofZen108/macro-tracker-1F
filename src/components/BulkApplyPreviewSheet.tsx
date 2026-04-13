import { BottomSheet } from './BottomSheet'
import type { BulkApplyMode, BulkApplyPreview } from '../types'

interface BulkApplyPreviewSheetProps {
  open: boolean
  title: string
  description: string
  note?: string
  preview: BulkApplyPreview | null
  selectedMode: BulkApplyMode
  onChangeMode: (mode: Exclude<BulkApplyMode, 'cancel'>) => void
  onClose: () => void
  onApply: () => void
}

export function BulkApplyPreviewSheet({
  open,
  title,
  description,
  note,
  preview,
  selectedMode,
  onChangeMode,
  onClose,
  onApply,
}: BulkApplyPreviewSheetProps) {
  return (
    <BottomSheet
      open={open}
      title={title}
      description={description}
      onClose={onClose}
    >
      {preview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Existing target</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {preview.existingEntryCount} entries
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{preview.existingCalories} cal</p>
            </div>
            <div className="rounded-[22px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Incoming</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {preview.incomingEntryCount} entries
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{preview.incomingCalories} cal</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">
              {preview.possibleOverlapCount > 0
                ? `${preview.possibleOverlapCount} possible overlap${preview.possibleOverlapCount === 1 ? '' : 's'} detected.`
                : 'No obvious overlaps detected in the current target.'}
            </p>
            <p className="mt-1">
              Review whether to append the new entries or replace the target before applying.
            </p>
            {note ? <p className="mt-2">{note}</p> : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Apply mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  selectedMode === 'append'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
                onClick={() => onChangeMode('append')}
              >
                Append
              </button>
              <button
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  selectedMode === 'replaceTarget'
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
                onClick={() => onChangeMode('replaceTarget')}
              >
                Replace target
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="action-button flex-1" onClick={onApply}>
              Apply changes
            </button>
            <button type="button" className="action-button-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}
