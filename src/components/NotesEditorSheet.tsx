import { useEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import type { ActionResult } from '../types'

interface NotesEditorSheetProps {
  open: boolean
  title: 'Edit phase notes' | 'Edit refeed notes'
  initialNotes?: string
  onClose: () => void
  onSave: (notes: string | undefined) => ActionResult<void> | Promise<ActionResult<void>>
}

function normalizeNotes(notes: string | undefined): string {
  return notes?.trim() ?? ''
}

export function NotesEditorSheet({
  open,
  title,
  initialNotes,
  onClose,
  onSave,
}: NotesEditorSheetProps) {
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const normalizedInitialNotes = useMemo(() => normalizeNotes(initialNotes), [initialNotes])
  const isDirty = normalizeNotes(notes) !== normalizedInitialNotes

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [open])

  useEffect(() => {
    if (errorMessage) {
      textareaRef.current?.focus()
    }
  }, [errorMessage])

  async function handleSave(): Promise<void> {
    const trimmedNotes = normalizeNotes(notes)
    if (trimmedNotes === normalizedInitialNotes) {
      onClose()
      return
    }

    setIsSaving(true)
    const result = await Promise.resolve(onSave(trimmedNotes ? trimmedNotes : undefined))
    setIsSaving(false)

    if (!result.ok) {
      setErrorMessage(result.error.message)
      return
    }

    setErrorMessage(null)
    onClose()
  }

  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onClose}
      isDirty={isDirty}
    >
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Notes
          <textarea
            ref={textareaRef}
            className="field mt-2 min-h-28"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-describedby={errorMessage ? 'notes-editor-error' : undefined}
          />
        </label>
        {errorMessage ? (
          <div
            id="notes-editor-error"
            aria-live="assertive"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
          >
            {errorMessage}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="action-button flex-1"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            Save notes
          </button>
          <button
            type="button"
            className="action-button-secondary flex-1"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
