import type { RefObject } from 'react'
import type { BarcodeLookupResult } from '../../types'
import { formatMacroSummary, formatServingMeta } from './helpers'
import type { AddFoodPaneMode } from './types'

export interface ScannerPaneProps {
  mode: AddFoodPaneMode
  isOnline: boolean
  lookupResult: BarcodeLookupResult | null
  lookupMessage?: string | null
  lookupError?: string | null
  barcodeInput: string
  isLookingUp: boolean
  videoRef?: RefObject<HTMLVideoElement | null>
  onBarcodeInputChange: (value: string) => void
  onLookupSubmit: (barcode: string) => void
  onBack: () => void
  onUseLookupFood: () => void
  onScanAndLog: () => void
  onScanAgain: () => void
}

export function ScannerPane({
  mode,
  isOnline,
  lookupResult,
  lookupMessage,
  lookupError,
  barcodeInput,
  isLookingUp,
  videoRef,
  onBarcodeInputChange,
  onLookupSubmit,
  onBack,
  onUseLookupFood,
  onScanAndLog,
  onScanAgain,
}: ScannerPaneProps) {
  const candidate = lookupResult?.candidate
  const nutritionSummary = candidate ? formatMacroSummary(candidate) : null

  return (
    <div data-add-food-pane="scanner" className="space-y-4">
      {!isOnline ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Barcode lookup is disabled offline. Reconnect to scan or return to your saved foods.
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="overflow-hidden rounded-[28px] border border-black/5 bg-slate-950 dark:border-white/10">
          {!lookupResult ? (
            <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline />
          ) : (
            <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-slate-300">
              Barcode captured. Review the imported nutrition below.
            </div>
          )}
        </div>
        {lookupMessage ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">{lookupMessage}</p>
        ) : null}
        {lookupError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {lookupError}
          </div>
        ) : null}
      </div>

      {lookupResult && candidate ? (
        <div className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-2xl text-slate-900 dark:text-white">{candidate.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-300">{formatServingMeta(candidate)}</p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                candidate.verification === 'verified'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
              }`}
            >
              {candidate.verification === 'verified' ? 'verified' : 'review'}
            </span>
          </div>

          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {nutritionSummary ?? `Missing: ${lookupResult.missingFields.join(', ')}`}
          </p>

          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Basis: {candidate.nutritionBasis}
          </p>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="action-button"
              onClick={onUseLookupFood}
              data-add-food-action="use-lookup-food"
            >
              {candidate.verification === 'needsConfirmation' ? 'Review and save' : 'Use this food'}
            </button>
            {mode === 'add' && candidate.verification === 'verified' ? (
              <button
                type="button"
                className="action-button-secondary"
                onClick={onScanAndLog}
                data-add-food-action="scan-and-log"
              >
                Scan and log 1x
              </button>
            ) : null}
            <button
              type="button"
              className="action-button-secondary"
              onClick={onScanAgain}
              data-add-food-action="scan-again"
            >
              Scan again
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="space-y-3 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
        onSubmit={(event) => {
          event.preventDefault()
          onLookupSubmit(barcodeInput)
        }}
      >
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Manual barcode entry
          <input
            className="field mt-2"
            inputMode="numeric"
            value={barcodeInput}
            onChange={(event) => onBarcodeInputChange(event.target.value)}
            placeholder="0123456789012"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            className="action-button flex-1"
            disabled={isLookingUp || !isOnline}
            data-add-food-action="lookup-barcode"
          >
            {isLookingUp ? 'Looking up...' : 'Lookup barcode'}
          </button>
          <button
            type="button"
            className="action-button-secondary flex-1"
            onClick={onBack}
            data-add-food-action="scanner-back"
          >
            Back to foods
          </button>
        </div>
      </form>
    </div>
  )
}
