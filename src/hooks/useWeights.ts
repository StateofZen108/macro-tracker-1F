import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionResult, AppActionError, WeightUnit } from '../types'
import { applyWeightSanity, firstSanityMessage, isWeightProofEligible, validateWeightValue } from '../domain/biometricSanity'
import { sortDatesDescending } from '../utils/dates'
import { isSyncEnabled } from '../utils/sync/core'
import { subscribeToStorage } from '../utils/storage/core'
import { loadWeights, saveWeights } from '../utils/storage/weights'

export function useWeights() {
  const storedWeights = useSyncExternalStore(subscribeToStorage, loadWeights, loadWeights)
  const weights = useMemo(
    () => sortDatesDescending(storedWeights.filter((entry) => !entry.deletedAt)),
    [storedWeights],
  )
  const proofEligibleWeights = useMemo(
    () => sortDatesDescending(storedWeights.filter(isWeightProofEligible)),
    [storedWeights],
  )
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function saveWeight(date: string, weight: number, unit: WeightUnit): ActionResult<void> {
    const currentWeights = sortDatesDescending(loadWeights())
    const existingEntry = currentWeights.find((entry) => entry.date === date)
    const now = new Date().toISOString()
    const sanity = validateWeightValue({
      date,
      weight,
      unit,
      source: 'manual_entry',
      existingWeights: currentWeights,
      excludeId: existingEntry?.id,
    })

    if (sanity.status === 'blocked_invalid') {
      const error = {
        code: 'invalidBiometric',
        message: firstSanityMessage(sanity),
      } satisfies AppActionError
      setLastError(error)
      return { ok: false, error }
    }

    const sanityFields = applyWeightSanity(
      {
        id: existingEntry?.id ?? crypto.randomUUID(),
        date,
        weight,
        unit,
        createdAt: existingEntry?.createdAt ?? now,
        updatedAt: now,
      },
      {
        source: 'manual_entry',
        existingWeights: currentWeights,
      },
    )
    if (!sanityFields) {
      const error = {
        code: 'invalidBiometric',
        message: 'This weigh-in is outside safe biometric ranges.',
      } satisfies AppActionError
      setLastError(error)
      return { ok: false, error }
    }
    const nextWeights = sortDatesDescending(
      existingEntry
        ? currentWeights.map((entry) =>
            entry.date === date
              ? {
                  ...entry,
                  ...sanityFields,
                  updatedAt: now,
                  deletedAt: undefined,
                }
              : entry,
          )
        : [
            ...currentWeights,
            sanityFields,
          ],
    )

    const result = saveWeights(nextWeights)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function deleteWeight(date: string): ActionResult<void> {
    const currentWeights = loadWeights()
    const now = new Date().toISOString()
    const nextWeights = isSyncEnabled()
      ? currentWeights.map((entry) =>
          entry.date === date
            ? {
                ...entry,
                updatedAt: now,
                deletedAt: now,
              }
            : entry,
        )
      : currentWeights.filter((entry) => entry.date !== date)
    const result = saveWeights(nextWeights)

    setLastError(result.ok ? null : result.error)
    return result
  }

  function clearError(): void {
    setLastError(null)
  }

  return {
    weights,
    proofEligibleWeights,
    saveWeight,
    deleteWeight,
    lastError,
    clearError,
  }
}
