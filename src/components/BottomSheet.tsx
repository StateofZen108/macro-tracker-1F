import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  isDirty?: boolean
  discardTitle?: string
  discardMessage?: string
  children: ReactNode
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return []
  }

  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => {
    if (element.hasAttribute('hidden')) {
      return false
    }

    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

export function BottomSheet({
  open,
  title,
  description,
  onClose,
  isDirty = false,
  discardTitle = 'Discard changes?',
  discardMessage = 'Your unsaved changes will be lost if you close this sheet.',
  children,
}: BottomSheetProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const discardDialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const activeContainer = showDiscardConfirm ? discardDialogRef.current : sheetRef.current
    const [firstFocusable] = getFocusableElements(activeContainer)
    firstFocusable?.focus()
  }, [open, showDiscardConfirm])

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Tab') {
        return
      }

      const activeContainer = showDiscardConfirm ? discardDialogRef.current : sheetRef.current
      const focusableElements = getFocusableElements(activeContainer)
      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement as HTMLElement | null
      const containsActive = activeContainer?.contains(activeElement) ?? false

      if (!containsActive) {
        event.preventDefault()
        firstFocusable.focus()
        return
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
        return
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, showDiscardConfirm])

  function requestClose(): void {
    if (isDirty) {
      setShowDiscardConfirm(true)
      return
    }

    onClose()
  }

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-3 pb-3 pt-10 backdrop-blur-sm"
      onClick={requestClose}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className="max-h-[92vh] w-full max-w-[480px] overflow-hidden rounded-[32px] border border-white/10 bg-white/95 shadow-2xl dark:bg-slate-950/95"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex justify-center py-3">
          <div className="h-1.5 w-14 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>
        <div className="flex items-start justify-between gap-4 px-5 pb-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl text-slate-900 dark:text-white">{title}</h2>
            {description ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            onClick={requestClose}
            aria-label="Close sheet"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-5.5rem)] overflow-y-auto px-5 pb-6">{children}</div>
      </div>

      {showDiscardConfirm ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div
            ref={discardDialogRef}
            className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/95 p-5 shadow-2xl dark:bg-slate-950/95"
            onClick={(event) => event.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label={discardTitle}
          >
            <div className="space-y-2">
              <h3 className="font-display text-xl text-slate-900 dark:text-white">{discardTitle}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{discardMessage}</p>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" className="action-button-secondary flex-1" onClick={() => setShowDiscardConfirm(false)}>
                Keep editing
              </button>
              <button
                type="button"
                className="action-button flex-1"
                onClick={() => {
                  setShowDiscardConfirm(false)
                  onClose()
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
