import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react'
import type {
  ActionResult,
  BarcodeLookupResult,
  CatalogFood,
  FavoriteFood,
  Food,
  FoodDraft,
  LabelOcrReviewSession,
  MealType,
  Recipe,
  SavedMeal,
  UnifiedFoodSearchResult,
} from '../types'
import { useFoodCatalogSearch } from '../hooks/useFoodCatalogSearch'
import { lookupBarcodeAcrossCatalogs } from '../utils/barcodeLookup'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { extractNutritionLabel } from '../utils/labelOcr'
import {
  buildLabelReviewValues,
  buildLabelReviewWarnings,
  buildOcrDraftFromReview,
} from '../utils/ocrReview'
import { BottomSheet } from './BottomSheet'
import { BrowsePane } from './add-food/BrowsePane'
import type { LabelReviewValues, LabelReviewWarning } from './LabelReviewSheet'

type ScannerControls = {
  stop: () => void
}

const FoodForm = lazy(async () => {
  const module = await import('./FoodForm')
  return { default: module.FoodForm }
})

const LabelCaptureSheet = lazy(async () => {
  const module = await import('./LabelCaptureSheet')
  return { default: module.LabelCaptureSheet }
})

const LabelReviewSheet = lazy(async () => {
  const module = await import('./LabelReviewSheet')
  return { default: module.LabelReviewSheet }
})

interface AddFoodSheetProps {
  open: boolean
  mode: 'add' | 'replace'
  mealLabel?: MealType
  foods: Food[]
  foodCatalogSearchEnabled?: boolean
  savedMeals: SavedMeal[]
  recipes: Recipe[]
  favorites: FavoriteFood[]
  favoriteFoodIds: string[]
  isOnline: boolean
  keepOpenAfterAdd: boolean
  onChangeKeepOpenAfterAdd: (nextValue: boolean) => void
  onClose: () => void
  onDirtyChange?: (isDirty: boolean) => void
  onConfirmFood: (food: Food, servings: number) => ActionResult<unknown>
  onConfirmRecipe?: (recipeId: string, servings: number) => ActionResult<unknown>
  onApplySavedMeal?: (savedMealId: string) => ActionResult<unknown>
  onCreateFood: (draft: FoodDraft) => ActionResult<Food>
  onToggleFavoriteFood?: (foodId: string) => ActionResult<unknown>
  onFindDuplicateFood: (draft: FoodDraft) => Food | null
  searchFoods: (query: string) => Food[]
  getQuickFoods: (limit?: number) => Food[]
}

type SheetMode = 'browse' | 'form' | 'scanner' | 'ocrCapture' | 'ocrReview'
type FormConfig = {
  title: string
  submitLabel: string
  source: FoodDraft['source']
  initialValues?: Partial<FoodDraft>
  noticeMessage?: string
  returnMode: Exclude<SheetMode, 'form'>
}
const SEARCH_RESULTS_BATCH_SIZE = 20
const EMPTY_LABEL_REVIEW_VALUES: LabelReviewValues = {
  name: '',
  brand: '',
  servingSize: '1',
  servingUnit: 'serving',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  barcode: '',
}


function buildLookupMessage(result: BarcodeLookupResult): string {
  if (result.candidate.verification === 'needsConfirmation') {
    return result.candidate.note ?? 'Review this import before saving it to your food database.'
  }

  return result.candidate.note ?? 'Product found. Save it locally or add it to this meal.'
}

export function AddFoodSheet({
  open,
  mode,
  mealLabel,
  foods,
  foodCatalogSearchEnabled = true,
  savedMeals,
  recipes,
  favorites,
  favoriteFoodIds,
  isOnline,
  keepOpenAfterAdd,
  onChangeKeepOpenAfterAdd,
  onClose,
  onDirtyChange,
  onConfirmFood,
  onConfirmRecipe,
  onApplySavedMeal,
  onCreateFood,
  onToggleFavoriteFood,
  onFindDuplicateFood,
  searchFoods,
  getQuickFoods,
}: AddFoodSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerControlsRef = useRef<ScannerControls | null>(null)
  const browseContentRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const pendingBrowseRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)

  const [sheetMode, setSheetMode] = useState<SheetMode>('browse')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null)
  const [visibleSearchResultCount, setVisibleSearchResultCount] = useState(SEARCH_RESULTS_BATCH_SIZE)
  const [servings, setServings] = useState(1)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lookupMessage, setLookupMessage] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupResult, setLookupResult] = useState<BarcodeLookupResult | null>(null)
  const [lastLookupResult, setLastLookupResult] = useState<BarcodeLookupResult | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null)
  const [ocrSession, setOcrSession] = useState<LabelOcrReviewSession | null>(null)
  const [ocrReviewValues, setOcrReviewValues] = useState<LabelReviewValues>(
    EMPTY_LABEL_REVIEW_VALUES,
  )
  const [ocrWarnings, setOcrWarnings] = useState<LabelReviewWarning[]>([])
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [ocrValidationMessage, setOcrValidationMessage] = useState<string | null>(null)
  const [isExtractingOcr, setIsExtractingOcr] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [formDirty, setFormDirty] = useState(false)
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null)
  const [discardMessage, setDiscardMessage] = useState('Discard your current food changes?')

  const selectedFood =
    (foods.find((food) => food.id === selectedFoodId && !food.archivedAt) ?? null) as Food
  const searchResults = searchFoods(debouncedQuery)
  const favoriteIdSet = new Set(favoriteFoodIds)
  const quickFoods = debouncedQuery ? [] : getQuickFoods(6)
  const quickFoodIds = new Set(quickFoods.map((food) => food.id))
  const visibleSearchResults = debouncedQuery
    ? searchResults
    : searchResults.filter((food) => !quickFoodIds.has(food.id))
  const displayedSearchResults = visibleSearchResults.slice(0, visibleSearchResultCount)
  const hiddenSearchResultCount = Math.max(0, visibleSearchResults.length - displayedSearchResults.length)
  const {
    localResults: catalogLocalResults,
    remoteResults: catalogRemoteResults,
    remoteStatus,
    hasMoreRemoteResults,
    remoteLoadingMore,
    loadMoreRemoteResults,
  } = useFoodCatalogSearch({
    enabled: foodCatalogSearchEnabled,
    query: debouncedQuery,
    foods,
    savedMeals,
    recipes,
    favorites,
    isOnline,
    targetMeal: mealLabel,
  })
  const savedMealSearchResults = debouncedQuery
    ? catalogLocalResults.filter((result) => result.source === 'saved_meal')
    : []
  const recipeSearchResults = debouncedQuery
    ? catalogLocalResults.filter((result) => result.source === 'recipe')
    : []
  const catalogSearchResults = debouncedQuery
    ? [
        ...catalogLocalResults.filter((result) => result.source === 'off_cached'),
        ...catalogRemoteResults,
      ]
    : []
  const browseDirty = Boolean(query.trim() || selectedFoodId || servings !== 1)
  const scannerDirty = Boolean(
    barcodeInput.trim() || lookupResult || lookupError || lookupMessage || isLookingUp,
  )
  const ocrCaptureDirty = Boolean(ocrFile || ocrError || ocrValidationMessage || isExtractingOcr)
  const ocrReviewDirty = Boolean(ocrSession)
  const activeDirty =
    sheetMode === 'form'
      ? formDirty
      : sheetMode === 'scanner'
        ? scannerDirty
        : sheetMode === 'ocrCapture'
          ? ocrCaptureDirty
          : sheetMode === 'ocrReview'
            ? ocrReviewDirty
            : browseDirty
  const sheetDirty = activeDirty || discardAction !== null

  function getBrowseScrollContainer(): HTMLDivElement | null {
    const parent = browseContentRef.current?.parentElement
    return parent instanceof HTMLDivElement ? parent : null
  }

  function rememberBrowseScrollPosition(): void {
    const container = getBrowseScrollContainer()
    if (!container) {
      pendingBrowseRestoreRef.current = null
      return
    }

    pendingBrowseRestoreRef.current = {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
    }
  }

  function stopScanner(): void {
    scannerControlsRef.current?.stop()
    scannerControlsRef.current = null
  }

  function resetLookupState(clearLastScan = false): void {
    setLookupMessage(null)
    setLookupError(null)
    setLookupResult(null)
    setIsLookingUp(false)
    if (clearLastScan) {
      setLastLookupResult(null)
    }
  }

  function resetOcrState(): void {
    setOcrFile(null)
    setOcrSession(null)
    setOcrReviewValues(EMPTY_LABEL_REVIEW_VALUES)
    setOcrWarnings([])
    setOcrError(null)
    setOcrValidationMessage(null)
    setIsExtractingOcr(false)
  }

  function startFreshScanner(): void {
    if (!isOnline) {
      setActionError('Barcode lookup is unavailable offline. Reconnect to scan or search local foods instead.')
      return
    }

    stopScanner()
    resetLookupState(false)
    setBarcodeInput('')
    setSheetMode('scanner')
    setLookupMessage('Point your camera at a barcode or enter one manually below.')
  }

  function startFreshLabelCapture(): void {
    if (!isOnline) {
      setActionError(
        'Nutrition label OCR is unavailable offline. Reconnect to scan a label or search local foods instead.',
      )
      return
    }

    stopScanner()
    resetLookupState(false)
    resetOcrState()
    setActionError(null)
    setSheetMode('ocrCapture')
  }

  function openFoodForm(config: FormConfig): void {
    stopScanner()
    setFormConfig(config)
    setFormDirty(false)
    setActionError(null)
    setSheetMode('form')
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [query])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (!ocrFile) {
      setOcrPreviewUrl(null)
      return
    }

    const nextPreviewUrl = URL.createObjectURL(ocrFile)
    setOcrPreviewUrl(nextPreviewUrl)

    return () => {
      URL.revokeObjectURL(nextPreviewUrl)
    }
  }, [ocrFile])

  useEffect(() => {
    onDirtyChange?.(open ? sheetDirty : false)
  }, [onDirtyChange, open, sheetDirty])

  useEffect(() => {
    if (!open || sheetMode !== 'browse' || !pendingBrowseRestoreRef.current) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const pendingRestore = pendingBrowseRestoreRef.current
      const container = getBrowseScrollContainer()

      if (pendingRestore && container) {
        const scrollDelta = Math.max(0, pendingRestore.scrollHeight - container.scrollHeight)
        container.scrollTop = Math.max(0, pendingRestore.scrollTop - scrollDelta)
      }

      if (query.trim()) {
        searchInputRef.current?.focus({ preventScroll: true })
      }

      pendingBrowseRestoreRef.current = null
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [displayedSearchResults.length, open, query, quickFoods.length, selectedFoodId, servings, sheetMode])

  async function runBarcodeLookup(barcode: string): Promise<void> {
    const normalizedBarcode = barcode.replace(/\D/g, '')
    const localBarcodeMatch = foods.find(
      (food) => !food.archivedAt && food.barcode && food.barcode === normalizedBarcode,
    )
    if (localBarcodeMatch) {
      stopScanner()
      setLookupError(null)
      setLookupResult(null)
      setLastLookupResult(null)
      setLookupMessage(`${localBarcodeMatch.name} is already saved locally, so you can log it immediately.`)
      setSelectedFoodId(localBarcodeMatch.id)
      setSheetMode('browse')
      setActionError(null)
      return
    }

    stopScanner()
    setLookupError(null)
    setIsLookingUp(true)
    setLookupMessage(`Looking up ${normalizedBarcode}...`)

    const result = await lookupBarcodeAcrossCatalogs(normalizedBarcode)
    if (!result.ok) {
      setLookupResult(null)
      setLookupError(result.error.message)
      setLookupMessage(null)
      setIsLookingUp(false)
      return
    }

    setLookupResult(result.data)
    setLastLookupResult(result.data)
    setLookupMessage(buildLookupMessage(result.data))
    setActionError(null)
    setIsLookingUp(false)
  }

  function updateOcrReviewValue(field: keyof LabelReviewValues, value: string): void {
    setOcrReviewValues((currentValues) => {
      const nextValues = {
        ...currentValues,
        [field]: value,
      }

      if (ocrSession) {
        setOcrWarnings(buildLabelReviewWarnings(ocrSession, nextValues))
      }

      return nextValues
    })
  }

  async function submitOcrCapture(): Promise<void> {
    if (!ocrFile) {
      setOcrValidationMessage('Select a nutrition-label photo before continuing.')
      return
    }

    setOcrValidationMessage(null)
    setOcrError(null)
    setIsExtractingOcr(true)
    const result = await extractNutritionLabel(ocrFile)
    setIsExtractingOcr(false)

    if (!result.ok) {
      setOcrError(result.error.message)
      return
    }

    const reviewValues = buildLabelReviewValues(result.data)
    setOcrSession(result.data)
    setOcrReviewValues(reviewValues)
    setOcrWarnings(buildLabelReviewWarnings(result.data, reviewValues))
    setSheetMode('ocrReview')
  }

  function requestDiscard(nextAction: () => void, message: string): void {
    if (!activeDirty) {
      nextAction()
      return
    }

    setDiscardMessage(message)
    setDiscardAction(() => () => {
      setDiscardAction(null)
      nextAction()
    })
  }

  function handleBrowseQueryChange(nextQuery: string): void {
    setQuery(nextQuery)
    setVisibleSearchResultCount(SEARCH_RESULTS_BATCH_SIZE)

    if (!selectedFoodId) {
      return
    }

    const nextResults = searchFoods(nextQuery)
    const nextQuickFoods = nextQuery.trim() ? [] : getQuickFoods(6)
    const nextQuickIds = new Set(nextQuickFoods.map((food) => food.id))
    const nextSelectableIds = new Set(
      (nextQuery.trim()
        ? nextResults
        : nextResults.filter((food) => !nextQuickIds.has(food.id))
      ).concat(nextQuickFoods).map((food) => food.id),
    )

    if (!nextSelectableIds.has(selectedFoodId)) {
      setSelectedFoodId(null)
    }
  }

  function handleBrowseSelectFood(foodId: string): void {
    setSelectedFoodId(foodId)
    setActionError(null)
  }

  function handleShowMoreResults(): void {
    setVisibleSearchResultCount((currentCount) => currentCount + SEARCH_RESULTS_BATCH_SIZE)
  }

  function resetSelectionState(): void {
    setSelectedFoodId(null)
    setServings(1)
    setActionError(null)
  }

  function handleSuccessfulAdd(shouldKeepOpen: boolean): void {
    if (shouldKeepOpen && keepOpenAfterAdd && mode === 'add') {
      rememberBrowseScrollPosition()
      resetSelectionState()
      setFormConfig(null)
      if (sheetMode === 'scanner') {
        resetLookupState(false)
        setBarcodeInput('')
        setSheetMode('browse')
      }
      return
    }

    closeSheet()
  }

  function submitFood(food: Food, foodServings: number, shouldKeepOpen = false): ActionResult<unknown> {
    const result = onConfirmFood(food, foodServings)
    if (!result.ok) {
      setActionError(result.error.message)
      return result
    }

    setActionError(null)
    handleSuccessfulAdd(shouldKeepOpen)
    return result
  }

  function materializeLookupFood(): ActionResult<Food> {
    if (!lookupResult) {
      return {
        ok: false,
        error: {
          code: 'missingLookup',
          message: 'Scan a barcode successfully before using this shortcut.',
        },
      }
    }

    const existingFood = foods.find(
      (food) => !food.archivedAt && food.barcode && food.barcode === lookupResult.candidate.barcode,
    )

    if (existingFood) {
      return {
        ok: true,
        data: existingFood,
      }
    }

    if (
      lookupResult.candidate.verification === 'needsConfirmation' ||
      lookupResult.missingFields.length
    ) {
      return {
        ok: false,
        error: {
          code: 'needsConfirmation',
          message: 'This barcode needs review before it can be logged directly.',
        },
      }
    }

    return onCreateFood({
      name: lookupResult.candidate.name,
      brand: lookupResult.candidate.brand,
      servingSize: lookupResult.candidate.servingSize,
      servingUnit: lookupResult.candidate.servingUnit,
      calories: lookupResult.candidate.calories ?? 0,
      protein: lookupResult.candidate.protein ?? 0,
      carbs: lookupResult.candidate.carbs ?? 0,
      fat: lookupResult.candidate.fat ?? 0,
      fiber: lookupResult.candidate.fiber,
      barcode: lookupResult.candidate.barcode,
      source: 'api',
      provider: lookupResult.candidate.provider,
      importConfidence: lookupResult.candidate.importConfidence,
      sourceQuality: lookupResult.candidate.sourceQuality,
      sourceQualityNote: lookupResult.candidate.note,
    })
  }

  const handleScannedBarcode = useEffectEvent((barcode: string) => {
    void runBarcodeLookup(barcode)
  })

  useEffect(() => {
    if (!open || sheetMode !== 'scanner' || lookupResult || isLookingUp || !videoRef.current) {
      return
    }

    let cancelled = false

    async function startScanner(): Promise<void> {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        setLookupError(null)
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: {
                ideal: 'environment',
              },
            },
          },
          videoRef.current ?? undefined,
          (result, error, activeControls) => {
            if (cancelled) {
              return
            }

            if (result) {
              activeControls.stop()
              scannerControlsRef.current = null
              handleScannedBarcode(result.getText())
              return
            }

            if (error instanceof Error && error.name !== 'NotFoundException') {
              setLookupError(
                'The camera scanner ran into a problem. You can retry or enter the barcode manually.',
              )
            }
          },
        )

        if (!cancelled) {
          scannerControlsRef.current = controls
        }
      } catch (error) {
        if (cancelled) {
          return
        }

        const message =
          error instanceof Error && error.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access or use manual barcode entry.'
            : 'Unable to start the camera scanner on this device.'

        setLookupError(message)
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      stopScanner()
    }
  }, [isLookingUp, lookupResult, open, sheetMode])

  function closeSheet(): void {
    stopScanner()
    resetOcrState()
    setFormConfig(null)
    setDiscardAction(null)
    setFormDirty(false)
    pendingBrowseRestoreRef.current = null
    onClose()
  }

  function handleCreateFood(draft: FoodDraft): ActionResult<Food> {
    const duplicateFood = onFindDuplicateFood(draft)
    if (duplicateFood) {
      resetOcrState()
      setSelectedFoodId(duplicateFood.id)
      setServings(duplicateFood.lastServings ?? 1)
      setSheetMode('browse')
      setLookupMessage(`${duplicateFood.name} already exists, so the saved food is ready to use.`)
      setActionError(null)
      setFormDirty(false)
      return { ok: true, data: duplicateFood }
    }

    const result = onCreateFood(draft)
    if (!result.ok) {
      return result
    }

    setSelectedFoodId(result.data.id)
    setServings(1)
    setSheetMode('browse')
    setFormConfig(null)
    resetOcrState()
    setLookupMessage(
      result.data.labelNutrition
        ? 'Label-scanned food saved locally.'
        : result.data.source === 'api'
          ? 'Scanned food saved locally.'
          : 'Custom food saved.',
    )
    setActionError(null)
    setFormDirty(false)
    return result
  }

  function canUseLastAmount(food: Food): boolean {
    return typeof food.lastServings === 'number' && Number.isFinite(food.lastServings) && food.lastServings > 0 && food.lastServings !== 1
  }

  function toggleFavorite(foodId: string): void {
    if (!onToggleFavoriteFood) {
      return
    }

    const result = onToggleFavoriteFood(foodId)
    if (!result.ok) {
      setActionError(result.error.message)
      return
    }

    setActionError(null)
  }

  function materializeCatalogFood(result: UnifiedFoodSearchResult): ActionResult<Food> {
    const catalogFood = result.record as CatalogFood
    const draft: FoodDraft = {
      name: catalogFood.name,
      brand: catalogFood.brand,
      servingSize: catalogFood.servingSize ?? 1,
      servingUnit: catalogFood.servingUnit ?? 'serving',
      calories: catalogFood.calories ?? 0,
      protein: catalogFood.protein ?? 0,
      carbs: catalogFood.carbs ?? 0,
      fat: catalogFood.fat ?? 0,
      fiber: catalogFood.fiber,
      barcode: catalogFood.barcode,
      source: 'api',
      provider: catalogFood.provider,
      importConfidence: catalogFood.importConfidence,
      sourceQuality: catalogFood.sourceQuality,
      sourceQualityNote: catalogFood.sourceQualityNote,
    }

    const duplicateFood = onFindDuplicateFood(draft)
    if (duplicateFood) {
      return { ok: true, data: duplicateFood }
    }

    return onCreateFood(draft)
  }

  function handleImportCatalogFood(result: UnifiedFoodSearchResult, addAfterImport: boolean): void {
    if (
      result.importConfidence === 'weak_match' ||
      result.importConfidence === 'manual_review_required'
    ) {
      const catalogFood = result.record as CatalogFood
      openFoodForm({
        title: 'Review catalog food',
        submitLabel: 'Save catalog food',
        source: 'api',
        initialValues: {
          name: catalogFood.name,
          brand: catalogFood.brand,
          servingSize: catalogFood.servingSize ?? 1,
          servingUnit: catalogFood.servingUnit ?? 'serving',
          calories: catalogFood.calories ?? 0,
          protein: catalogFood.protein ?? 0,
          carbs: catalogFood.carbs ?? 0,
          fat: catalogFood.fat ?? 0,
          fiber: catalogFood.fiber,
          barcode: catalogFood.barcode,
          source: 'api',
          provider: catalogFood.provider,
          importConfidence: catalogFood.importConfidence,
          sourceQuality: catalogFood.sourceQuality,
          sourceQualityNote: catalogFood.sourceQualityNote,
        },
        noticeMessage:
          catalogFood.sourceQualityNote ??
          'This catalog result needs review before it is saved locally.',
        returnMode: 'browse',
      })
      return
    }

    const materializedFood = materializeCatalogFood(result)
    if (!materializedFood.ok) {
      setActionError(materializedFood.error.message)
      return
    }

    setActionError(null)
    if (addAfterImport) {
      submitFood(materializedFood.data, 1, true)
      return
    }

    setLookupMessage(`${materializedFood.data.name} saved locally.`)
    setSelectedFoodId(materializedFood.data.id)
  }

  function handleConfirmRecipeSelection(recipeId: string): void {
    if (!onConfirmRecipe) {
      return
    }

    const result = onConfirmRecipe(recipeId, 1)
    if (!result.ok) {
      setActionError(result.error.message)
      return
    }

    setActionError(null)
    handleSuccessfulAdd(true)
  }

  function handleApplySavedMealSelection(savedMealId: string): void {
    if (!onApplySavedMeal) {
      return
    }

    const result = onApplySavedMeal(savedMealId)
    if (!result.ok) {
      setActionError(result.error.message)
      void recordDiagnosticsEvent({
        eventType: 'saved_meal_apply_failed',
        severity: 'error',
        scope: 'diagnostics',
        message: result.error.message,
        recordKey: savedMealId,
      })
      return
    }

    setActionError(null)
    closeSheet()
  }

  function handleUseLookupFood(): void {
    if (!lookupResult) {
      return
    }

    if (
      lookupResult.candidate.verification === 'needsConfirmation' ||
      lookupResult.missingFields.length
    ) {
      openFoodForm({
        title: 'Review imported food',
        submitLabel: 'Save imported food',
        source: 'api',
        initialValues: lookupResult.candidate,
        noticeMessage:
          lookupResult.candidate.note ?? 'This import needs confirmation before it is saved.',
        returnMode: 'scanner',
      })
      return
    }

    const result = materializeLookupFood()
    if (!result.ok) {
      setActionError(result.error.message)
      return
    }

    setSelectedFoodId(result.data.id)
    setServings(1)
    setSheetMode('browse')
    setLookupMessage('Scanned food saved locally and ready to use.')
    setActionError(null)
  }

  function handleScanAndLog(): void {
    const result = materializeLookupFood()
    if (!result.ok) {
      if (result.error.code === 'needsConfirmation') {
        if (lookupResult) {
          openFoodForm({
            title: 'Review imported food',
            submitLabel: 'Save imported food',
            source: 'api',
            initialValues: lookupResult.candidate,
            noticeMessage:
              lookupResult.candidate.note ?? 'This import needs confirmation before it is saved.',
            returnMode: 'scanner',
          })
        }
        return
      }

      setActionError(result.error.message)
      return
    }

    submitFood(result.data, 1, false)
  }

  function handleSaveOcrFood(): void {
    if (!ocrSession) {
      setOcrError('Run a nutrition-label scan before saving a reviewed food.')
      return
    }

    try {
      const nextDraft = buildOcrDraftFromReview(ocrReviewValues, ocrSession)
      if (!nextDraft.name.trim()) {
        throw new Error('Food name is required.')
      }

      if (!nextDraft.servingUnit.trim()) {
        throw new Error('Serving unit is required.')
      }

      const result = handleCreateFood(nextDraft)
      if (!result.ok) {
        setOcrError(result.error.message)
        return
      }

      setOcrError(null)
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'Review the nutrition-label values before saving.')
    }
  }

  return (
    <BottomSheet
      open={open}
      title={mode === 'replace' ? 'Replace Food' : 'Add Food'}
      description={
        mode === 'replace'
          ? 'Choose a saved food to relink this entry.'
          : mealLabel
            ? `Log a food to ${mealLabel}.`
            : 'Choose a food to log.'
      }
      onClose={closeSheet}
      isDirty={sheetDirty}
      discardMessage="Your add-food progress will be lost if you close this sheet."
    >
      {sheetMode === 'form' ? (
        <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-300">Loading food form...</div>}>
          <FoodForm
            title={formConfig?.title ?? 'Create custom food'}
            submitLabel={formConfig?.submitLabel ?? 'Save custom food'}
            source={formConfig?.source ?? 'custom'}
            initialValues={formConfig?.initialValues}
            onDirtyChange={setFormDirty}
            noticeMessage={formConfig?.noticeMessage}
            onSubmit={handleCreateFood}
            onCancel={() =>
              requestDiscard(
                () => {
                  setFormDirty(false)
                  setFormConfig(null)
                  setSheetMode(formConfig?.returnMode ?? 'browse')
                },
                'Discard the food form and go back?',
              )
            }
          />
        </Suspense>
      ) : sheetMode === 'ocrCapture' ? (
        <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-300">Loading label capture...</div>}>
          <LabelCaptureSheet
            previewUrl={ocrPreviewUrl}
            fileName={ocrFile?.name ?? null}
            isUploading={isExtractingOcr}
            errorMessage={ocrError}
            warningMessage={
              !isOnline
                ? 'Nutrition label OCR is disabled offline. Reconnect to continue scanning labels.'
                : null
            }
            validationMessage={ocrValidationMessage}
            primaryLabel="Review nutrition label"
            onFileSelect={(file) => {
              setOcrFile(file)
              setOcrError(null)
              setOcrValidationMessage(null)
            }}
            onSubmit={() => {
              void submitOcrCapture()
            }}
            onBack={() =>
              requestDiscard(
                () => {
                  resetOcrState()
                  setSheetMode('browse')
                },
                'Discard your nutrition-label scan and go back to saved foods?',
              )
            }
            onClear={() => {
              setOcrFile(null)
              setOcrValidationMessage(null)
              setOcrError(null)
            }}
          />
        </Suspense>
      ) : sheetMode === 'ocrReview' ? (
        <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-300">Loading OCR review...</div>}>
          <LabelReviewSheet
            values={ocrReviewValues}
            previewUrl={ocrPreviewUrl}
            fileName={ocrFile?.name ?? null}
            errorMessage={ocrError}
            warnings={ocrWarnings}
            saveLabel="Save reviewed food"
            onChange={updateOcrReviewValue}
            onSubmit={handleSaveOcrFood}
            onRetake={() =>
              requestDiscard(
                () => {
                  setOcrSession(null)
                  setOcrReviewValues(EMPTY_LABEL_REVIEW_VALUES)
                  setOcrWarnings([])
                  setOcrError(null)
                  setOcrValidationMessage(null)
                  setOcrFile(null)
                  setSheetMode('ocrCapture')
                },
                'Discard the current OCR review and retake the nutrition-label photo?',
              )
            }
            onBack={() =>
              requestDiscard(
                () => {
                  resetOcrState()
                  setSheetMode('browse')
                },
                'Discard your nutrition-label review and go back to saved foods?',
              )
            }
          />
        </Suspense>
      ) : sheetMode === 'scanner' ? (
        <div className="space-y-4">
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

          {lookupResult ? (
            <div className="space-y-4 rounded-[28px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl text-slate-900 dark:text-white">{lookupResult.candidate.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    {lookupResult.candidate.brand ? `${lookupResult.candidate.brand} â€¢ ` : ''}
                    {lookupResult.candidate.servingSize}
                    {lookupResult.candidate.servingUnit}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    lookupResult.candidate.verification === 'verified'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
                  }`}
                >
                  {lookupResult.candidate.verification === 'verified' ? 'verified' : 'review'}
                </span>
              </div>

              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {lookupResult.candidate.calories !== undefined &&
                lookupResult.candidate.protein !== undefined &&
                lookupResult.candidate.carbs !== undefined &&
                lookupResult.candidate.fat !== undefined
                  ? `${Math.round(lookupResult.candidate.calories)} cal â€¢ ${Math.round(
                      lookupResult.candidate.protein,
                    )}P â€¢ ${Math.round(lookupResult.candidate.carbs)}C â€¢ ${Math.round(lookupResult.candidate.fat)}F`
                  : `Missing: ${lookupResult.missingFields.join(', ')}`}
              </p>

              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Basis: {lookupResult.candidate.nutritionBasis}
              </p>

              <div className="flex flex-col gap-3">
                <button type="button" className="action-button" onClick={handleUseLookupFood}>
                  {lookupResult.candidate.verification === 'needsConfirmation'
                    ? 'Review and save'
                    : 'Use this food'}
                </button>
                {mode === 'add' && lookupResult.candidate.verification === 'verified' ? (
                  <button type="button" className="action-button-secondary" onClick={handleScanAndLog}>
                    Scan and log 1x
                  </button>
                ) : null}
                <button
                  type="button"
                  className="action-button-secondary"
                  onClick={() => {
                    setLookupResult(null)
                    setLookupError(null)
                    setLookupMessage('Point your camera at a barcode or enter one manually below.')
                  }}
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
              void runBarcodeLookup(barcodeInput)
            }}
          >
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Manual barcode entry
              <input
                className="field mt-2"
                inputMode="numeric"
                value={barcodeInput}
                onChange={(event) => setBarcodeInput(event.target.value)}
                placeholder="0123456789012"
              />
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" className="action-button flex-1" disabled={isLookingUp || !isOnline}>
                {isLookingUp ? 'Looking up...' : 'Lookup barcode'}
              </button>
              <button
                type="button"
                className="action-button-secondary flex-1"
                onClick={() => {
                  stopScanner()
                  setSheetMode('browse')
                }}
              >
                Back to foods
              </button>
            </div>
          </form>
        </div>
      ) : (
        <BrowsePane
          mode={mode}
          query={query}
          searchInputRef={searchInputRef}
          contentRef={browseContentRef}
          onQueryChange={handleBrowseQueryChange}
          selectedFood={selectedFood}
          selectedFoodId={selectedFoodId}
          onSelectFood={handleBrowseSelectFood}
          onClearSelectedFood={() => setSelectedFoodId(null)}
          servings={servings}
          onServingsChange={setServings}
          onSubmitFood={submitFood}
          canUseLastAmount={canUseLastAmount}
          keepOpenAfterAdd={keepOpenAfterAdd}
          onChangeKeepOpenAfterAdd={onChangeKeepOpenAfterAdd}
          lookupMessage={lookupMessage}
          isOnline={isOnline}
          actionError={actionError}
          onOpenCustomFood={() =>
            requestDiscard(
              () => {
                openFoodForm({
                  title: 'Create custom food',
                  submitLabel: 'Save custom food',
                  source: 'custom',
                  returnMode: 'browse',
                })
              },
              'Discard your current add-food progress and create a custom food instead?',
            )
          }
          onOpenScanner={() =>
            requestDiscard(
              () => {
                setActionError(null)
                startFreshScanner()
              },
              'Discard your current selection and switch to barcode scanning?',
            )
          }
          onOpenOcr={() =>
            requestDiscard(
              () => {
                setActionError(null)
                startFreshLabelCapture()
              },
              'Discard your current selection and switch to nutrition-label OCR?',
            )
          }
          lastLookupResult={lastLookupResult}
          onReviewLastScan={() => {
            stopScanner()
            setLookupResult(lastLookupResult)
            if (lastLookupResult) {
              setLookupMessage(buildLookupMessage(lastLookupResult))
            }
            setLookupError(null)
            setSheetMode('scanner')
          }}
          quickFoods={quickFoods}
          favoriteFoodIds={favoriteIdSet}
          onToggleFavoriteFood={onToggleFavoriteFood ? toggleFavorite : undefined}
          savedMealSearchResults={savedMealSearchResults}
          onApplySavedMealSelection={handleApplySavedMealSelection}
          recipeSearchResults={recipeSearchResults}
          onConfirmRecipeSelection={handleConfirmRecipeSelection}
          foodCatalogSearchEnabled={foodCatalogSearchEnabled}
          catalogSearchResults={catalogSearchResults}
          remoteStatus={remoteStatus}
          remoteLoadingMore={remoteLoadingMore}
          hasMoreRemoteResults={hasMoreRemoteResults}
          onLoadMoreRemoteResults={loadMoreRemoteResults}
          onImportCatalogFood={handleImportCatalogFood}
          debouncedQuery={debouncedQuery}
          displayedSearchResults={displayedSearchResults}
          visibleSearchResults={visibleSearchResults}
          hiddenSearchResultCount={hiddenSearchResultCount}
          onShowMoreResults={handleShowMoreResults}
          discardAction={discardAction}
          discardMessage={discardMessage}
          onCancelDiscard={() => setDiscardAction(null)}
        />
      )}
    </BottomSheet>
  )
}
