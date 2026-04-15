import { Camera, ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { useRef } from 'react'

interface LabelCaptureSheetProps {
  previewUrl?: string | null
  fileName?: string | null
  fileSummary?: string | null
  isPreparing?: boolean
  isUploading?: boolean
  errorMessage?: string | null
  warningMessage?: string | null
  validationMessage?: string | null
  primaryLabel?: string
  onTakePhotoSelect: (file: File | null) => void
  onChoosePhotoSelect: (file: File | null) => void
  onSubmit: () => void
  onBack: () => void
  onClear?: (() => void) | null
}

export function LabelCaptureSheet({
  previewUrl,
  fileName,
  fileSummary,
  isPreparing = false,
  isUploading = false,
  errorMessage,
  warningMessage,
  validationMessage,
  primaryLabel = 'Review nutrition label',
  onTakePhotoSelect,
  onChoosePhotoSelect,
  onSubmit,
  onBack,
  onClear,
}: LabelCaptureSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)

  function openCameraPicker(): void {
    cameraInputRef.current?.click()
  }

  function openGalleryPicker(): void {
    galleryInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-display text-lg text-slate-900 dark:text-white">Scan nutrition label</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Upload one clear photo of the nutrition panel. You will review and edit the extracted values before anything is saved.
        </p>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="ocr-camera-input"
        onChange={(event) => onTakePhotoSelect(event.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="ocr-gallery-input"
        onChange={(event) => onChoosePhotoSelect(event.target.files?.[0] ?? null)}
      />

      <div className="space-y-3 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
        <div className="overflow-hidden rounded-[24px] border border-dashed border-teal-300 bg-teal-50/60 dark:border-teal-500/40 dark:bg-teal-500/10">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={fileName ? `Nutrition label preview for ${fileName}` : 'Nutrition label preview'}
              className="h-72 w-full object-cover"
            />
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-600 dark:text-slate-300">
              <Camera className="h-10 w-10 text-teal-700 dark:text-teal-300" />
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">One nutrition-label photo</p>
                <p>Fill the frame with the panel, keep glare low, and make the serving size readable.</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {fileName ?? 'No image selected'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-300">
            {fileSummary ??
              'JPEG, PNG, WebP, or HEIC/HEIF. The image is normalized for OCR and stays in this review flow only.'}
          </p>
        </div>

        {warningMessage ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {warningMessage}
          </div>
        ) : null}

        {validationMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {validationMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" className="action-button-secondary gap-2" onClick={openCameraPicker}>
            {previewUrl ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            {previewUrl ? 'Retake photo' : 'Take photo'}
          </button>
          <button type="button" className="action-button-secondary gap-2" onClick={openGalleryPicker}>
            <ImagePlus className="h-4 w-4" />
            {previewUrl ? 'Choose another photo' : 'Choose photo'}
          </button>
          <button
            type="button"
            className="action-button"
            onClick={onSubmit}
            disabled={isUploading || isPreparing || !previewUrl}
          >
            {isPreparing ? 'Preparing photo...' : isUploading ? 'Extracting...' : primaryLabel}
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="action-button-secondary flex-1" onClick={onBack}>
            Back to foods
          </button>
          {previewUrl && onClear ? (
            <button type="button" className="action-button-secondary flex-1 gap-2" onClick={onClear}>
              <Trash2 className="h-4 w-4" />
              Clear photo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
