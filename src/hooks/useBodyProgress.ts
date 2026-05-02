import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import type {
  ActionResult,
  AppActionError,
  BodyProgressSaveRequest,
  BodyProgressSnapshot,
  ProgressPhotoEntry,
  ProgressPhotoPose,
} from '../types'
import {
  deleteBodyProgressSnapshot,
  getBodyProgressSnapshot,
  listBodyProgressSnapshots,
  refreshBodyProgressSnapshots,
  saveBodyProgressSnapshot,
  subscribeBodyProgress,
} from '../utils/storage/bodyProgress'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { sanitizeBodyProgressSnapshot } from '../domain/biometricSanity'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read the selected image file.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be converted for local storage.'))
        return
      }

      resolve(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      resolve({})
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}

function sortPhotos(photos: ProgressPhotoEntry[]): ProgressPhotoEntry[] {
  const order: Record<ProgressPhotoPose, number> = {
    front: 0,
    side: 1,
    back: 2,
  }

  return [...photos].sort((left, right) => order[left.pose] - order[right.pose])
}

export function useBodyProgress() {
  const storedSnapshots = useSyncExternalStore(
    subscribeBodyProgress,
    getBodyProgressSnapshot,
    getBodyProgressSnapshot,
  )
  const snapshots = useMemo(() => storedSnapshots, [storedSnapshots])
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  const saveSnapshot = useCallback(
    async (input: BodyProgressSaveRequest): Promise<ActionResult<BodyProgressSnapshot>> => {
      try {
        const existing =
          (await listBodyProgressSnapshots()).find((snapshot) => snapshot.date === input.date) ?? null
        const existingPhotos = new Map(existing?.photos.map((photo) => [photo.pose, photo]) ?? [])
        const clearedPoses = new Set(input.clearedPoses ?? [])

        for (const pose of clearedPoses) {
          existingPhotos.delete(pose)
        }

        const nextPhotos = new Map<ProgressPhotoPose, ProgressPhotoEntry>(existingPhotos)
        const photoEntries = Object.entries(input.photosByPose ?? {}) as Array<[ProgressPhotoPose, File]>
        for (const [pose, file] of photoEntries) {
          if (!(file instanceof File)) {
            continue
          }

          const timestamp = new Date().toISOString()
          const dataUrl = await readFileAsDataUrl(file)
          const dimensions = await readImageDimensions(file)
          nextPhotos.set(pose, {
            id: existingPhotos.get(pose)?.id ?? crypto.randomUUID(),
            pose,
            fileName: file.name,
            contentType: file.type || 'image/jpeg',
            dataUrl,
            width: dimensions.width,
            height: dimensions.height,
            createdAt: existingPhotos.get(pose)?.createdAt ?? timestamp,
            updatedAt: timestamp,
          })
        }

        const timestamp = new Date().toISOString()
        const nextSnapshot: BodyProgressSnapshot = {
          id: existing?.id ?? crypto.randomUUID(),
          date: input.date,
          metrics: [...input.metrics].sort((left, right) => left.label.localeCompare(right.label)),
          photos: sortPhotos([...nextPhotos.values()]),
          note: input.note?.trim() || undefined,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }
        const sanity = sanitizeBodyProgressSnapshot(nextSnapshot, {
          source: 'body_progress',
          existingSnapshots: await listBodyProgressSnapshots(),
          blockInvalid: true,
        })
        if (sanity.blockedCount > 0 || sanity.snapshot.metrics.length !== nextSnapshot.metrics.length) {
          const nextError = {
            code: 'invalidBiometric',
            message:
              nextSnapshot.metrics.find((metric) =>
                !sanity.snapshot.metrics.some((sanitizedMetric) => sanitizedMetric.key === metric.key),
              )?.label
                ? 'One body metric is outside safe biometric ranges.'
                : 'One or more body metrics are outside safe biometric ranges.',
          } satisfies AppActionError
          setLastError(nextError)
          return { ok: false, error: nextError }
        }

        const result = await saveBodyProgressSnapshot(sanity.snapshot)
        setLastError(result.ok ? null : result.error)
        if (result.ok) {
          void recordDiagnosticsEvent({
            eventType: 'body_progress_snapshot_saved',
            severity: 'info',
            scope: 'diagnostics',
            recordKey: nextSnapshot.id,
            message: 'A body-progress snapshot was saved locally.',
            payload: {
              date: nextSnapshot.date,
              metricCount: nextSnapshot.metrics.length,
              photoCount: nextSnapshot.photos.length,
            },
          })
        } else {
          void recordDiagnosticsEvent({
            eventType: 'body_progress_snapshot_failed',
            severity: 'warning',
            scope: 'diagnostics',
            message: 'Saving a body-progress snapshot failed.',
            payload: {
              date: input.date,
              metricCount: input.metrics.length,
            },
          })
        }
        return result
      } catch (error) {
        const nextError = {
          code: 'bodyProgress',
          message: error instanceof Error ? error.message : 'Unable to save body progress right now.',
        } satisfies AppActionError
        setLastError(nextError)
        void recordDiagnosticsEvent({
          eventType: 'body_progress_snapshot_failed',
          severity: 'warning',
          scope: 'diagnostics',
          message: 'Saving a body-progress snapshot failed.',
          payload: {
            date: input.date,
          },
        })
        return { ok: false, error: nextError }
      }
    },
    [],
  )

  const deleteSnapshot = useCallback(async (snapshotId: string): Promise<ActionResult<void>> => {
    const result = await deleteBodyProgressSnapshot(snapshotId)
    setLastError(result.ok ? null : result.error)
    void recordDiagnosticsEvent({
      eventType: result.ok ? 'body_progress_snapshot_deleted' : 'body_progress_snapshot_failed',
      severity: result.ok ? 'info' : 'warning',
      scope: 'diagnostics',
      recordKey: snapshotId,
      message: result.ok
        ? 'A body-progress snapshot was deleted locally.'
        : 'Deleting a body-progress snapshot failed.',
      payload: {},
    })
    return result.ok ? ok(undefined) : result
  }, [])

  const refreshSnapshots = useCallback(async () => {
    await refreshBodyProgressSnapshots()
  }, [])

  return {
    snapshots,
    saveSnapshot,
    deleteSnapshot,
    refreshSnapshots,
    lastError,
  }
}
