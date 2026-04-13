import { X } from 'lucide-react'
import type { UndoAction } from '../app/useUndoQueue'

interface UndoToastStackProps {
  undoQueue: UndoAction[]
  onUndo: (undoId: string) => void
  onDismiss: (undoId: string) => void
}

function UndoToastStack({ undoQueue, onUndo, onDismiss }: UndoToastStackProps) {
  return (
    <>
      {undoQueue.map((undoItem, index) => (
        <div
          key={undoItem.id}
          className="fixed left-0 right-0 z-50 px-3"
          style={{ bottom: `calc(env(safe-area-inset-bottom) + 6rem + ${index * 5.75}rem)` }}
        >
          <div className="mx-auto flex max-w-[480px] items-center justify-between gap-4 rounded-[24px] border border-teal-300 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-teal-500/30 dark:bg-slate-950/95">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{undoItem.title}</p>
              {undoItem.description ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">{undoItem.description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="action-button-secondary" onClick={() => onUndo(undoItem.id)}>
                {undoItem.actionLabel}
              </button>
              <button type="button" className="icon-button" onClick={() => onDismiss(undoItem.id)} aria-label="Dismiss undo">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

export { UndoToastStack }
