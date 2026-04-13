import { useEffect, useRef, useState } from 'react'
import type { ActionResult, AppActionError, UndoQueueItem } from '../types'

export interface UndoAction extends UndoQueueItem {
  undo: () => ActionResult<unknown>
}

interface UseUndoQueueOptions {
  onError: (error: AppActionError | string | null) => void
}

export function useUndoQueue({ onError }: UseUndoQueueOptions) {
  const undoTimeoutsRef = useRef<Map<string, number>>(new Map())
  const [undoQueue, setUndoQueue] = useState<UndoAction[]>([])

  useEffect(() => {
    const activeUndoTimeouts = undoTimeoutsRef.current

    return () => {
      for (const timeoutId of activeUndoTimeouts.values()) {
        window.clearTimeout(timeoutId)
      }
      activeUndoTimeouts.clear()
    }
  }, [])

  function dismissUndoItem(undoId: string): void {
    const timeoutId = undoTimeoutsRef.current.get(undoId)
    if (timeoutId) {
      window.clearTimeout(timeoutId)
      undoTimeoutsRef.current.delete(undoId)
    }

    setUndoQueue((currentQueue) => currentQueue.filter((item) => item.id !== undoId))
  }

  function queueUndoAction(item: UndoAction): void {
    const timeoutId = window.setTimeout(() => {
      undoTimeoutsRef.current.delete(item.id)
      setUndoQueue((currentQueue) => currentQueue.filter((currentItem) => currentItem.id !== item.id))
    }, 5000)

    undoTimeoutsRef.current.set(item.id, timeoutId)
    setUndoQueue((currentQueue) => [...currentQueue, item])
  }

  function handleUndo(undoId: string): void {
    const item = undoQueue.find((currentItem) => currentItem.id === undoId)
    if (!item) {
      return
    }

    const result = item.undo()
    if (!result.ok) {
      onError(result.error)
      return
    }

    dismissUndoItem(undoId)
    onError(null)
  }

  return {
    undoQueue,
    dismissUndoItem,
    queueUndoAction,
    handleUndo,
  }
}
