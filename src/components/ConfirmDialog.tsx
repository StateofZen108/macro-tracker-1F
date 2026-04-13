import type { ConfirmState } from '../app/useAppShell'

interface ConfirmDialogProps {
  confirmState: ConfirmState | null
  onClose: () => void
}

function ConfirmDialog({ confirmState, onClose }: ConfirmDialogProps) {
  if (!confirmState) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/95 p-5 shadow-2xl dark:bg-slate-950/95"
      >
        <div className="space-y-2">
          <h2 id="confirm-dialog-title" className="font-display text-xl text-slate-900 dark:text-white">
            {confirmState.title}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">{confirmState.description}</p>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="action-button-secondary flex-1" onClick={onClose}>
            Keep editing
          </button>
          <button type="button" className="action-button flex-1" onClick={confirmState.onConfirm}>
            {confirmState.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export { ConfirmDialog }
