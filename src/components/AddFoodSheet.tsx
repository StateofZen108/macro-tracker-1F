import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type {
  ActionResult,
  BarcodeLookupResult,
  CatalogFood,
  DescribeFoodDraftV1,
  FavoriteFood,
  Food,
  FoodDraft,
  LabelOcrReviewSession,
  MealType,
  Recipe,
  SavedMeal,
  UnifiedFoodSearchResult,
} from '../types'
import { FEATURE_FLAGS } from '../config/featureFlags'
import { resolveBarcodeLookup } from '../domain/foodCatalog/barcodeResolution'
import { buildDescribeFoodDraftV1 } from '../domain/foodCatalog/describe'
import type { FoodLibraryMatch } from '../domain/foods/personalLibrary'
import { useFoodCatalogSearch } from '../hooks/useFoodCatalogSearch'
import { lookupBarcodeAcrossCatalogs } from '../utils/barcodeLookup'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import {
  extractNutritionLabel,
  normalizeLabelImage,
  revokeNormalizedLabelImage,
  type NormalizedLabelImage,
} from '../utils/labelOcr'
import {
  applyOcrServingInterpretation,
  buildLabelReviewValues,
  buildLabelReviewState,
  buildOcrDraftFromReview,
  getDefaultServingInterpretationId,
  hydrateLabelReviewSession,
  wasMacroFieldEdited,
} from '../utils/ocrReview'
import { BottomSheet } from './BottomSheet'
import { BrowsePane } from './add-food/BrowsePane'
import type { RepeatMealCandidate } from './add-food/types'
import type { LabelReviewValues } from './LabelReviewSheet'

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
  onImportFood: (draft: FoodDraft, options?: { acceptedQuery?: string }) => ActionResult<Food>
  onToggleFavoriteFood?: (foodId: string) => ActionResult<unknown>
  onFindDuplicateFood: (draft: FoodDraft) => Food | null
  onResolveFoodMatch: (draft: FoodDraft) => FoodLibraryMatch
  onRestoreFood: (foodId: string) => ActionResult<void>
  searchFoods: (query: string) => Food[]
  getQuickFoods: (limit?: number) => Food[]
  repeatCandidates?: RepeatMealCandidate[]
}

type SheetMode = 'browse' | 'form' | 'scanner' | 'ocrCapture' | 'ocrReview'
type FormConfig = {
  title: string
  submitLabel: string
  source: FoodDraft['source']
  submitMode?: 'create' | 'import'
  initialValues?: Partial<FoodDraft>
  noticeMessage?: string
  acceptedQuery?: string
  addAfterSave?: boolean
  returnMode: Exclude<SheetMode, 'form'>
}
type ArchivedImportCandidate = {
  food: Food
  draft: FoodDraft
  acceptedQuery?: string
  addAfterImport: boolean
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
  if (result.candidate.importTrust?.level === 'blocked') {
    return result.candidate.note ?? 'Manual review is required before this food can be saved.'
  }

  if (
    result.candidate.importTrust?.level === 'exact_review' ||
    result.candidate.verification === 'needsConfirmation'
  ) {
    return result.candidate.note ?? 'Review this import before saving it to your food database.'
  }

  return result.candidate.note ?? 'Product found. Save it locally or add it to this meal.'
}

function getLookupTrustLevel(result: BarcodeLookupResult | null): 'exact_autolog' | 'exact_review' | 'blocked' | null {
  return result?.candidate.importTrust?.level ?? null
}

function lookupNeedsReview(result: BarcodeLookupResult | null): boolean {
  if (!result) {
    return true
  }

  const trustLevel = getLookupTrustLevel(result)
  return trustLevel !== 'exact_autolog' || result.missingFields.length > 0
}

function getLookupDiagnosticsEventType(
  result: BarcodeLookupResult,
): 'barcode_lookup_completed' | 'barcode_lookup_downgraded' | 'barcode_lookup_blocked' {
  const trustLevel = getLookupTrustLevel(result)
  if (trustLevel === 'blocked') {
    return 'barcode_lookup_blocked'
  }

  if (trustLevel === 'exact_review') {
    return 'barcode_lookup_downgraded'
  }

  return 'barcode_lookup_completed'
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
  onImportFood,
  onToggleFavoriteFood,
  onFindDuplicateFood,
  onResolveFoodMatch,
  onRestoreFood,
  searchFoods,
  getQuickFoods,
  repeatCandidates = [],
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
  const [ocrImage, setOcrImage] = useState<NormalizedLabelImage | null>(null)
  const [ocrSession, setOcrSession] = useState<LabelOcrReviewSession | null>(null)
  const [ocrReviewValues, setOcrReviewValues] = useState<LabelReviewValues>(
    EMPTY_LABEL_REVIEW_VALUES,
  )
  const [ocrSelectedInterpretationId, setOcrSelectedInterpretationId] = useState<string | null>(null)
  const [ocrMacrosEdited, setOcrMacrosEdited] = useState(false)
  const [ocrReviewNotice, setOcrReviewNotice] = useState<string | null>(null)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [ocrValidationMessage, setOcrValidationMessage] = useState<string | null>(null)
  const [isPreparingOcrImage, setIsPreparingOcrImage] = useState(false)
  const [isExtractingOcr, setIsExtractingOcr] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [describeDraft, setDescribeDraft] = useState<DescribeFoodDraftV1 | null>(null)
  const [formDirty, setFormDirty] = useState(false)
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null)
  const [discardMessage, setDiscardMessage] = useState('Discard your current food changes?')
  const [archivedImportCandidate, setArchivedImportCandidate] = useState<ArchivedImportCandidate | null>(null)
  const [catalogExpanded, setCatalogExpanded] = useState(false)

  const selectedFood =
    (foods.find((food) => food.id === selectedFoodId && !food.archivedAt) ?? null) as Food
  const personalLibraryEnabled = FEATURE_FLAGS.personalLibraryV1 && foodCatalogSearchEnabled
  const searchResults = searchFoods(debouncedQuery)
  const describeFoodEnabled = FEATURE_FLAGS.describeFood && foodCatalogSearchEnabled
  const favoriteIdSet = new Set(favoriteFoodIds)
  const quickFoods = personalLibraryEnabled || debouncedQuery ? [] : getQuickFoods(6)
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
  const savedMealSearchResults = useMemo(
    () =>
      debouncedQuery
        ? catalogLocalResults.filter((result) => result.source === 'saved_meal')
        : [],
    [catalogLocalResults, debouncedQuery],
  )
  const recipeSearchResults = useMemo(
    () =>
      debouncedQuery ? catalogLocalResults.filter((result) => result.source === 'recipe') : [],
    [catalogLocalResults, debouncedQuery],
  )
  const repeatFoodResults = useMemo(
    () =>
      repeatCandidates
        .map((candidate) => {
          const matchedFood = foods.find((food) => food.id === candidate.foodId && !food.archivedAt)
          if (!matchedFood) {
            return null
          }

          return {
            food: matchedFood,
            servings:
              candidate.servings > 0 && Number.isFinite(candidate.servings) ? candidate.servings : 1,
          }
        })
        .filter((candidate): candidate is { food: Food; servings: number } => candidate !== null),
    [foods, repeatCandidates],
  )
  const catalogLibraryMatches = useMemo(() => {
    if (!personalLibraryEnabled) {
      return new Set<string>()
    }

    return new Set(
      [...catalogLocalResults.filter((result) => result.source === 'off_cached'), ...catalogRemoteResults]
        .filter((result) => {
          const match = onResolveFoodMatch(buildCatalogFoodDraft(result))
          return (
            match.kind === 'activeBarcodeMatch' ||
            match.kind === 'activeRemoteReferenceMatch' ||
            match.kind === 'activeIdentityMatch'
          )
        })
        .map((result) => result.id),
    )
  }, [catalogLocalResults, catalogRemoteResults, onResolveFoodMatch, personalLibraryEnabled])
  const catalogSearchResults = useMemo(
    () => {
      if (!debouncedQuery) {
        return []
      }

      const deduped = new Map<string, UnifiedFoodSearchResult>()
      for (const result of catalogLocalResults.filter((entry) => entry.source === 'off_cached')) {
        const record = result.record as CatalogFood
        deduped.set(`${record.provider}:${record.remoteKey}`, result)
      }
      for (const result of catalogRemoteResults) {
        const record = result.record as CatalogFood
        deduped.set(`${record.provider}:${record.remoteKey}`, result)
      }

      return [...deduped.values()]
    },
    [catalogLocalResults, catalogRemoteResults, debouncedQuery],
  )
  const shouldCollapseCatalog =
    personalLibraryEnabled &&
    catalogSearchResults.length > 0 &&
    visibleSearchResults.length + repeatFoodResults.length >= 6
  const visibleCatalogSearchResults =
    shouldCollapseCatalog && !catalogExpanded ? [] : catalogSearchResults
  const browseDirty = Boolean(query.trim() || selectedFoodId || servings !== 1 || describeDraft)
  const scannerDirty = Boolean(
    barcodeInput.trim() || lookupResult || lookupError || lookupMessage || isLookingUp,
  )
  const ocrCaptureDirty = Boolean(
    ocrImage || ocrError || ocrValidationMessage || isPreparingOcrImage || isExtractingOcr,
  )
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
  const lookupTrustLevel = getLookupTrustLevel(lookupResult)
  const canDirectLogLookup = lookupResult ? !lookupNeedsReview(lookupResult) : false
  const ocrReviewState = useMemo(
    () =>
      ocrSession
        ? buildLabelReviewState(
            ocrSession,
            ocrReviewValues,
            ocrSelectedInterpretationId,
            ocrMacrosEdited,
          )
        : null,
    [ocrMacrosEdited, ocrReviewValues, ocrSelectedInterpretationId, ocrSession],
  )

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
    setOcrImage(null)
    setOcrSession(null)
    setOcrReviewValues(EMPTY_LABEL_REVIEW_VALUES)
    setOcrSelectedInterpretationId(null)
    setOcrMacrosEdited(false)
    setOcrReviewNotice(null)
    setOcrError(null)
    setOcrValidationMessage(null)
    setIsPreparingOcrImage(false)
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
    setArchivedImportCandidate(null)
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
    setCatalogExpanded(false)
  }, [debouncedQuery])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    return () => {
      revokeNormalizedLabelImage(ocrImage)
    }
  }, [ocrImage])

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

  useEffect(() => {
    if (!describeDraft || describeDraft.reviewMode !== 'manual_only') {
      return
    }

    const remoteCandidate = catalogSearchResults.find(
      (result) =>
        (result.source === 'off_cached' || result.source === 'off_remote') &&
        typeof (result.record as CatalogFood).remoteKey === 'string',
    )
    if (!remoteCandidate) {
      return
    }

    const catalogFood = remoteCandidate.record as CatalogFood
    setDescribeDraft((currentDraft) => {
      if (!currentDraft || currentDraft.id !== describeDraft.id || currentDraft.reviewMode !== 'manual_only') {
        return currentDraft
      }

      return {
        ...currentDraft,
        reviewMode: 'remote_match',
        item: {
          ...currentDraft.item,
          candidateRemoteKey: catalogFood.remoteKey,
          candidateRemoteProvider: catalogFood.provider,
          calories: catalogFood.calories,
          protein: catalogFood.protein,
          carbs: catalogFood.carbs,
          fat: catalogFood.fat,
        },
      }
    })
  }, [catalogSearchResults, describeDraft])

  async function runBarcodeLookup(barcode: string): Promise<void> {
    const normalizedBarcode = barcode.replace(/\D/g, '')
    stopScanner()
    setLookupError(null)

    const resolution = await resolveBarcodeLookup({
      barcode: normalizedBarcode,
      foods,
      lookupRemote: async (lookupBarcode) => {
        setIsLookingUp(true)
        setLookupMessage(`Looking up ${lookupBarcode}...`)
        return lookupBarcodeAcrossCatalogs(lookupBarcode)
      },
    })

    if (!resolution.ok) {
      void recordDiagnosticsEvent({
        eventType: 'barcode_lookup_blocked',
        severity: 'warning',
        scope: 'diagnostics',
        message: resolution.error.message,
        recordKey: normalizedBarcode,
        payload: {
          barcode: normalizedBarcode,
          provider: null,
          trustLevel: 'blocked',
          servingBasis: 'unknown',
          servingBasisSource: 'manual_review',
          blockingIssues: ['unknown_serving_basis'],
          hadCompleteMacros: false,
          resolvedLocally: false,
        },
      })
      setLookupResult(null)
      setLookupError(resolution.error.message)
      setLookupMessage(null)
      setIsLookingUp(false)
      return
    }

    if (resolution.data.source === 'local_barcode' && resolution.data.food) {
      const localBarcodeMatch = resolution.data.food
      void recordDiagnosticsEvent({
        eventType: 'barcode_lookup_completed',
        severity: 'info',
        scope: 'diagnostics',
        message: 'Barcode matched an existing local food.',
        recordKey: normalizedBarcode,
        payload: {
          barcode: normalizedBarcode,
          provider: localBarcodeMatch.provider ?? null,
          trustLevel: localBarcodeMatch.importTrust?.level ?? 'exact_autolog',
          servingBasis: localBarcodeMatch.importTrust?.servingBasis ?? 'serving',
          servingBasisSource: localBarcodeMatch.importTrust?.servingBasisSource ?? 'manual_review',
          blockingIssues: localBarcodeMatch.importTrust?.blockingIssues ?? [],
          hadCompleteMacros: true,
          resolvedLocally: true,
          foodId: localBarcodeMatch.id,
        },
      })
      stopScanner()
      setLookupError(null)
      setLookupResult(null)
      setLastLookupResult(null)
      setLookupMessage(`${localBarcodeMatch.name} is already saved locally, so you can log it immediately.`)
      setSelectedFoodId(localBarcodeMatch.id)
      setSheetMode('browse')
      setActionError(null)
      setIsLookingUp(false)
      return
    }

    if (resolution.data.source === 'local_remote_reference' && resolution.data.food) {
      const localRemoteReferenceMatch = resolution.data.food
      void recordDiagnosticsEvent({
        eventType: 'barcode_lookup_completed',
        severity: 'info',
        scope: 'diagnostics',
        message: 'Barcode matched an existing local remote reference.',
        recordKey: normalizedBarcode,
        payload: {
          barcode: normalizedBarcode,
          provider: localRemoteReferenceMatch.provider ?? null,
          trustLevel: localRemoteReferenceMatch.importTrust?.level ?? 'exact_autolog',
          servingBasis: localRemoteReferenceMatch.importTrust?.servingBasis ?? 'serving',
          servingBasisSource:
            localRemoteReferenceMatch.importTrust?.servingBasisSource ?? 'manual_review',
          blockingIssues: localRemoteReferenceMatch.importTrust?.blockingIssues ?? [],
          hadCompleteMacros: true,
          resolvedLocally: true,
          foodId: localRemoteReferenceMatch.id,
        },
      })
      stopScanner()
      setLookupError(null)
      setLookupResult(null)
      setLastLookupResult(null)
      setLookupMessage(
        `${localRemoteReferenceMatch.name} is already linked to this barcode locally, so you can log it immediately.`,
      )
      setSelectedFoodId(localRemoteReferenceMatch.id)
      setSheetMode('browse')
      setActionError(null)
      setIsLookingUp(false)
      return
    }

    const result = resolution.data.lookupResult
    if (!result) {
      setLookupResult(null)
      setLookupError('Barcode lookup did not return a result.')
      setLookupMessage(null)
      setIsLookingUp(false)
      return
    }

    setLookupResult(result)
    setLastLookupResult(result)
    setLookupMessage(buildLookupMessage(result))
    setActionError(null)
    setIsLookingUp(false)
    for (const providerFailure of result.providerFailures ?? []) {
      void recordDiagnosticsEvent({
        eventType: 'barcode_provider_failed',
        severity: 'warning',
        scope: 'diagnostics',
        message: providerFailure.message ?? 'A barcode provider failed before fallback completed.',
        recordKey: normalizedBarcode,
        payload: {
          barcode: normalizedBarcode,
          provider: providerFailure.provider,
          code: providerFailure.code,
          retryAfterSeconds: providerFailure.retryAfterSeconds ?? null,
        },
      })
    }
    void recordDiagnosticsEvent({
      eventType: getLookupDiagnosticsEventType(result),
      severity: result.candidate.importTrust?.level === 'blocked' ? 'warning' : 'info',
      scope: 'diagnostics',
      message: buildLookupMessage(result),
      recordKey: normalizedBarcode,
      payload: {
        barcode: normalizedBarcode,
        provider: result.candidate.provider,
        trustLevel: result.candidate.importTrust?.level ?? null,
        servingBasis: result.candidate.importTrust?.servingBasis ?? result.candidate.nutritionBasis,
        servingBasisSource: result.candidate.importTrust?.servingBasisSource ?? null,
        blockingIssues: result.candidate.importTrust?.blockingIssues ?? [],
        hadCompleteMacros: result.missingFields.length === 0,
        resolvedLocally: false,
        foodId: null,
      },
    })
  }

  function updateOcrReviewValue(field: keyof LabelReviewValues, value: string): void {
    if (wasMacroFieldEdited(field)) {
      setOcrMacrosEdited(true)
    }
    setOcrReviewNotice(null)
    setOcrReviewValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  function handleSelectOcrInterpretation(interpretationId: string): void {
    if (!ocrSession) {
      return
    }

    setOcrSelectedInterpretationId(interpretationId)
    setOcrReviewValues((currentValues) =>
      applyOcrServingInterpretation(
        currentValues,
        ocrSession,
        interpretationId,
        !ocrMacrosEdited,
      ),
    )
    setOcrReviewNotice(
      ocrMacrosEdited && interpretationId !== 'manual'
        ? 'Macros were edited manually. Recalculate from selected basis?'
        : null,
    )
  }

  async function submitOcrCapture(): Promise<void> {
    if (!ocrImage) {
      setOcrValidationMessage('Select a nutrition-label photo before continuing.')
      return
    }

    setOcrValidationMessage(null)
    setOcrError(null)
    setIsExtractingOcr(true)
    const result = await extractNutritionLabel(ocrImage.file)
    setIsExtractingOcr(false)

    if (!result.ok) {
      setOcrError(result.error.message)
      return
    }

    const hydratedSession = hydrateLabelReviewSession(result.data)
    const defaultInterpretationId = getDefaultServingInterpretationId(hydratedSession)
    const reviewValues = buildLabelReviewValues(hydratedSession, defaultInterpretationId)
    const reviewState = buildLabelReviewState(
      hydratedSession,
      reviewValues,
      defaultInterpretationId,
      false,
    )
    setOcrSession(hydratedSession)
    setOcrSelectedInterpretationId(defaultInterpretationId)
    setOcrMacrosEdited(false)
    setOcrReviewNotice(null)
    setOcrReviewValues(reviewValues)
    setSheetMode('ocrReview')
    void recordDiagnosticsEvent({
      eventType: reviewState.saveBlocked
        ? 'ocr_review_blocked'
        : 'ocr_review_opened',
      severity: reviewState.saveBlocked ? 'warning' : 'info',
      scope: 'ocr',
      message: reviewState.saveBlocked
        ? 'OCR review requires manual serving confirmation before save.'
        : 'OCR review is ready.',
      payload: {
        provider: null,
        ocrProvider: hydratedSession.provider,
        trustLevel: reviewState.saveBlocked
          ? 'blocked'
          : 'exact_review',
        servingBasis: hydratedSession.foodDraft.importTrust?.servingBasis ??
          (hydratedSession.foodDraft.labelNutrition?.fields.length ? 'serving' : 'unknown'),
        servingBasisSource: hydratedSession.foodDraft.importTrust?.servingBasisSource ?? 'manual_review',
        blockingIssues: hydratedSession.servingFieldIssueCodes ?? [],
        hadCompleteMacros: true,
        resolvedLocally: false,
      },
    })
  }

  async function handleOcrFileSelection(file: File | null): Promise<void> {
    if (!file) {
      return
    }

    setIsPreparingOcrImage(true)
    setOcrValidationMessage(null)
    setOcrError(null)

    const result = await normalizeLabelImage(file)
    setIsPreparingOcrImage(false)
    if (!result.ok) {
      setOcrImage(null)
      setOcrError(result.error.message)
      return
    }

    setOcrImage(result.data)
    setOcrError(null)
    setOcrValidationMessage(null)
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
    setDescribeDraft(null)

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
    setDescribeDraft(null)
    setActionError(null)
  }

  function handleShowMoreResults(): void {
    setVisibleSearchResultCount((currentCount) => currentCount + SEARCH_RESULTS_BATCH_SIZE)
  }

  function resetSelectionState(): void {
    setSelectedFoodId(null)
    setServings(1)
    setDescribeDraft(null)
    setActionError(null)
  }

  function handleStartDescribeFood(): void {
    const locale =
      typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en-us')
        ? 'en-US'
        : 'en-GB'
    const nextDraft = buildDescribeFoodDraftV1({
      rawText: query,
      locale,
      foods,
      searchFoods,
    })
    if (!nextDraft) {
      setActionError('Enter one food description before using Describe Food.')
      void recordDiagnosticsEvent({
        eventType: 'describe_food_draft_failed',
        severity: 'warning',
        scope: 'diagnostics',
        message: 'Describe Food needs a non-empty one-item food description.',
      })
      return
    }

    setDescribeDraft(nextDraft)
    setVisibleSearchResultCount(SEARCH_RESULTS_BATCH_SIZE)
    setQuery(nextDraft.item.name)
    if (nextDraft.item.candidateLocalFoodId) {
      setSelectedFoodId(nextDraft.item.candidateLocalFoodId)
    } else {
      setSelectedFoodId(null)
    }
    setServings(
      typeof nextDraft.item.amount === 'number' && Number.isFinite(nextDraft.item.amount) && nextDraft.item.amount > 0
        ? nextDraft.item.amount
        : 1,
    )
    setActionError(null)
  }

  function dismissDescribeDraft(): void {
    setDescribeDraft(null)
  }

  function buildCatalogFoodDraft(result: UnifiedFoodSearchResult): FoodDraft {
    const catalogFood = result.record as CatalogFood
    return {
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
      importTrust: catalogFood.importTrust,
      remoteReferences: [
        {
          provider: catalogFood.provider,
          remoteKey: catalogFood.remoteKey,
          barcode: catalogFood.barcode,
        },
      ],
    }
  }

  function setArchivedImportMatch(
    food: Food,
    draft: FoodDraft,
    options: {
      acceptedQuery?: string
      addAfterImport: boolean
    },
  ): void {
    setArchivedImportCandidate({
      food,
      draft,
      acceptedQuery: options.acceptedQuery,
      addAfterImport: options.addAfterImport,
    })
    setSheetMode('browse')
    setActionError(null)
    void recordDiagnosticsEvent({
      eventType: 'food_identity_conflict',
      severity: 'warning',
      scope: 'diagnostics',
      message: `${food.name} matched an archived local food and requires restore before import.`,
      recordKey: food.id,
      payload: {
        provider: draft.provider ?? null,
        barcode: draft.barcode ?? null,
      },
    })
  }

  function finalizeImportedFood(
    food: Food,
    options: {
      addAfterImport: boolean
      successMessage: string
    },
  ): void {
    setArchivedImportCandidate(null)
    setFormConfig(null)
    setFormDirty(false)
    resetOcrState()
    resetLookupState(false)
    if (options.addAfterImport) {
      submitFood(food, 1, true)
      setSheetMode('browse')
      return
    }

    setSheetMode('browse')
    setLookupMessage(options.successMessage)
    setSelectedFoodId(food.id)
    setServings(food.lastServings ?? 1)
  }

  function importFoodDraft(
    draft: FoodDraft,
    options: {
      acceptedQuery?: string
      addAfterImport: boolean
      successMessage: string
    },
  ): ActionResult<Food> {
    if (personalLibraryEnabled) {
      const match = onResolveFoodMatch(draft)
      if (
        match.kind === 'archivedBarcodeMatch' ||
        match.kind === 'archivedRemoteReferenceMatch' ||
        match.kind === 'archivedIdentityMatch'
      ) {
        setArchivedImportMatch(match.food, draft, options)
        return {
          ok: false,
          error: {
            code: 'archivedFoodExists',
            message: `${match.food.name} already exists in your archived foods.`,
          },
        }
      }
    }

    const result = onImportFood(draft, {
      acceptedQuery: options.acceptedQuery,
    })
    if (!result.ok) {
      setActionError(result.error.message)
      return result
    }

    setActionError(null)
    finalizeImportedFood(result.data, options)
    return result
  }

  function handleRestoreArchivedImport(): void {
    if (!archivedImportCandidate) {
      return
    }

    const restoreResult = onRestoreFood(archivedImportCandidate.food.id)
    if (!restoreResult.ok) {
      setActionError(restoreResult.error.message)
      return
    }

    const result = importFoodDraft(archivedImportCandidate.draft, {
      acceptedQuery: archivedImportCandidate.acceptedQuery,
      addAfterImport: archivedImportCandidate.addAfterImport,
      successMessage: `${archivedImportCandidate.food.name} restored to your library.`,
    })
    if (!result.ok && result.error.code !== 'archivedFoodExists') {
      setActionError(result.error.message)
      return
    }

    setArchivedImportCandidate(null)
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

  function buildLookupFoodDraft(): ActionResult<FoodDraft> {
    if (!lookupResult) {
      return {
        ok: false,
        error: {
          code: 'missingLookup',
          message: 'Scan a barcode successfully before using this shortcut.',
        },
      }
    }

    if (lookupNeedsReview(lookupResult)) {
      return {
        ok: false,
        error: {
          code: 'needsConfirmation',
          message: 'This barcode needs review before it can be logged directly.',
        },
      }
    }

    return {
      ok: true,
      data: {
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
        importTrust: lookupResult.candidate.importTrust,
        remoteReferences: lookupResult.candidate.remoteKey
          ? [
              {
                provider: lookupResult.candidate.provider,
                remoteKey: lookupResult.candidate.remoteKey,
                barcode: lookupResult.candidate.barcode,
              },
            ]
          : undefined,
      },
    }
  }

  function buildLookupReviewDraft(): FoodDraft | null {
    if (!lookupResult) {
      return null
    }

    return {
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
      source: lookupResult.candidate.source,
      provider: lookupResult.candidate.provider,
      importConfidence: lookupResult.candidate.importConfidence,
      sourceQuality: lookupResult.candidate.sourceQuality,
      sourceQualityNote: lookupResult.candidate.note,
      importTrust: lookupResult.candidate.importTrust,
      remoteReferences: lookupResult.candidate.remoteKey
        ? [
            {
              provider: lookupResult.candidate.provider,
              remoteKey: lookupResult.candidate.remoteKey,
              barcode: lookupResult.candidate.barcode,
            },
          ]
        : undefined,
    }
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
    setDescribeDraft(null)
    setFormConfig(null)
    setArchivedImportCandidate(null)
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
      setDescribeDraft(null)
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
    setDescribeDraft(null)
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

  function handleImportCatalogFood(result: UnifiedFoodSearchResult, addAfterImport: boolean): void {
    const draft = buildCatalogFoodDraft(result)
    if (
      result.importTrust?.level === 'blocked' ||
      result.importTrust?.level === 'exact_review' ||
      result.importConfidence === 'weak_match' ||
      result.importConfidence === 'manual_review_required'
    ) {
      openFoodForm({
        title: 'Review catalog food',
        submitLabel: result.importTrust?.level === 'blocked' ? 'Fix and save' : 'Review and import',
        source: 'api',
        submitMode: 'import',
        initialValues: draft,
        noticeMessage:
          draft.sourceQualityNote ??
          'This catalog result needs review before it is saved locally.',
        acceptedQuery: debouncedQuery,
        addAfterSave: addAfterImport,
        returnMode: 'browse',
      })
      return
    }

    void importFoodDraft(draft, {
      acceptedQuery: debouncedQuery,
      addAfterImport,
      successMessage: `${draft.name} saved in your library.`,
    })
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

    if (lookupNeedsReview(lookupResult)) {
      const reviewDraft = buildLookupReviewDraft()
      if (!reviewDraft) {
        setActionError('Review the scanned food after a successful barcode lookup.')
        return
      }

      openFoodForm({
        title: 'Review imported food',
        submitLabel:
          lookupResult.candidate.importTrust?.level === 'blocked' ? 'Fix and save' : 'Review and import',
        source: 'api',
        submitMode: 'import',
        initialValues: reviewDraft,
        noticeMessage:
          lookupResult.candidate.note ?? 'This import needs confirmation before it is saved.',
        acceptedQuery: lookupResult.candidate.name,
        returnMode: 'scanner',
      })
      return
    }

    const result = buildLookupFoodDraft()
    if (!result.ok) {
      setActionError(result.error.message)
      return
    }

    void importFoodDraft(result.data, {
      acceptedQuery: lookupResult?.candidate.name,
      addAfterImport: false,
      successMessage: 'Scanned food saved in your library and ready to use.',
    })
  }

  function handleScanAndLog(): void {
    const result = buildLookupFoodDraft()
    if (!result.ok) {
      if (result.error.code === 'needsConfirmation') {
        if (lookupResult) {
          const reviewDraft = buildLookupReviewDraft()
          if (!reviewDraft) {
            setActionError('Review the scanned food after a successful barcode lookup.')
            return
          }

          openFoodForm({
            title: 'Review imported food',
            submitLabel:
              lookupResult.candidate.importTrust?.level === 'blocked'
                ? 'Fix and save'
                : 'Review and import',
            source: 'api',
            submitMode: 'import',
            initialValues: reviewDraft,
            noticeMessage:
              lookupResult.candidate.note ?? 'This import needs confirmation before it is saved.',
            acceptedQuery: lookupResult.candidate.name,
            addAfterSave: true,
            returnMode: 'scanner',
          })
        }
        return
      }

      setActionError(result.error.message)
      return
    }

    const importResult = importFoodDraft(result.data, {
      acceptedQuery: lookupResult?.candidate.name,
      addAfterImport: true,
      successMessage: 'Scanned food saved in your library.',
    })
    if (importResult.ok && lookupResult) {
      void recordDiagnosticsEvent({
        eventType: 'barcode_autolog_used',
        severity: 'info',
        scope: 'diagnostics',
        message: 'Barcode lookup was used for one-tap logging.',
        recordKey: lookupResult.candidate.barcode,
        payload: {
          barcode: lookupResult.candidate.barcode,
          provider: lookupResult.candidate.provider,
          trustLevel: lookupResult.candidate.importTrust?.level ?? null,
          servingBasis: lookupResult.candidate.importTrust?.servingBasis ?? lookupResult.candidate.nutritionBasis,
          servingBasisSource: lookupResult.candidate.importTrust?.servingBasisSource ?? null,
          blockingIssues: lookupResult.candidate.importTrust?.blockingIssues ?? [],
          hadCompleteMacros: lookupResult.missingFields.length === 0,
          resolvedLocally: false,
          foodId: importResult.data.id,
        },
      })
    }
  }

  function handleSaveOcrFood(): void {
    if (!ocrSession) {
      setOcrError('Run a nutrition-label scan before saving a reviewed food.')
      return
    }

    if (ocrReviewState?.saveBlocked) {
      void recordDiagnosticsEvent({
        eventType: 'ocr_review_blocked',
        severity: 'warning',
        scope: 'ocr',
        message: 'OCR review is blocked until serving size is confirmed.',
        payload: {
          provider: null,
          ocrProvider: ocrSession.provider,
          trustLevel: 'blocked',
          servingBasis: ocrSession.foodDraft.importTrust?.servingBasis ?? 'unknown',
          servingBasisSource: 'manual_review',
          blockingIssues: ocrSession.servingFieldIssueCodes ?? ['unknown_serving_basis'],
          hadCompleteMacros: true,
          resolvedLocally: false,
        },
      })
      setOcrError(ocrReviewState.topWarning || 'Confirm the serving basis before saving this OCR food.')
      return
    }

    try {
      const nextDraft = buildOcrDraftFromReview(
        ocrReviewValues,
        ocrSession,
        ocrSelectedInterpretationId,
      )
      if (!nextDraft.name.trim()) {
        throw new Error('Food name is required.')
      }

      if (!nextDraft.servingUnit.trim()) {
        throw new Error('Serving unit is required.')
      }

      const result = importFoodDraft(nextDraft, {
        acceptedQuery: nextDraft.name,
        addAfterImport: false,
        successMessage: nextDraft.labelNutrition
          ? 'Label-scanned food saved in your library.'
          : 'Reviewed food saved in your library.',
      })
      if (!result.ok) {
        setOcrError(result.error.message)
        return
      }

      void recordDiagnosticsEvent({
        eventType: 'ocr_review_saved',
        severity: 'info',
        scope: 'ocr',
        message: 'Reviewed OCR food was saved locally.',
        recordKey: result.data.id,
        payload: {
          provider: null,
          ocrProvider: ocrSession.provider,
          trustLevel: 'exact_review',
          servingBasis: nextDraft.importTrust?.servingBasis ?? 'serving',
          servingBasisSource: nextDraft.importTrust?.servingBasisSource ?? 'manual_review',
          blockingIssues: nextDraft.importTrust?.blockingIssues ?? [],
          hadCompleteMacros: true,
          resolvedLocally: false,
          foodId: result.data.id,
        },
      })
      setOcrError(null)
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'Review the nutrition-label values before saving.')
    }
  }

  function handleApplyDescribeDraft(): void {
    if (!describeDraft) {
      return
    }

    if (describeDraft.reviewMode === 'local_match' && describeDraft.item.candidateLocalFoodId) {
      setSelectedFoodId(describeDraft.item.candidateLocalFoodId)
      setServings(
        typeof describeDraft.item.amount === 'number' && describeDraft.item.amount > 0
          ? describeDraft.item.amount
          : 1,
      )
      setActionError(null)
      return
    }

    if (describeDraft.reviewMode === 'remote_match' && describeDraft.item.candidateRemoteKey) {
      const remoteCandidate = catalogSearchResults.find((result) => {
        const record = result.record as CatalogFood
        return (
          record.remoteKey === describeDraft.item.candidateRemoteKey &&
          record.provider === describeDraft.item.candidateRemoteProvider
        )
      })

      if (remoteCandidate) {
        handleImportCatalogFood(remoteCandidate, false)
        return
      }
    }

    openFoodForm({
      title: 'Review described food',
      submitLabel: 'Save described food',
      source: 'custom',
      submitMode: 'create',
      initialValues: {
        name: describeDraft.item.name,
        servingSize:
          typeof describeDraft.item.amount === 'number' && describeDraft.item.amount > 0
            ? describeDraft.item.amount
            : 1,
        servingUnit: describeDraft.item.unit ?? 'serving',
        calories: describeDraft.item.calories ?? 0,
        protein: describeDraft.item.protein ?? 0,
        carbs: describeDraft.item.carbs ?? 0,
        fat: describeDraft.item.fat ?? 0,
        source: 'custom',
      },
      noticeMessage:
        describeDraft.confidence === 'low'
          ? 'This description was ambiguous, so review the item before saving it locally.'
          : 'Confirm the described food before saving it locally.',
      acceptedQuery: describeDraft.rawText,
      returnMode: 'browse',
    })
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
            onSubmit={(draft) => {
              const submitMode = formConfig?.submitMode ?? 'create'
              const mergedDraft: FoodDraft =
                submitMode === 'import'
                  ? {
                      ...formConfig?.initialValues,
                      ...draft,
                      source: 'api',
                    }
                  : draft

              if (submitMode === 'import') {
                const result = importFoodDraft(mergedDraft, {
                    acceptedQuery: formConfig?.acceptedQuery,
                    addAfterImport: formConfig?.addAfterSave ?? false,
                    successMessage: `${mergedDraft.name} saved in your library.`,
                  })
                if (result.ok) {
                  setFormDirty(false)
                  setFormConfig(null)
                  setSheetMode(formConfig?.returnMode ?? 'browse')
                }
                return result
              }

              return handleCreateFood(mergedDraft)
            }}
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
            previewUrl={ocrImage?.previewUrl ?? null}
            fileName={ocrImage?.file.name ?? null}
            fileSummary={
              ocrImage
                ? `Normalized to JPEG • ${(ocrImage.byteLength / (1024 * 1024)).toFixed(2).replace(/\.?0+$/, '')} MB • ${ocrImage.width}×${ocrImage.height}`
                : null
            }
            isPreparing={isPreparingOcrImage}
            isUploading={isExtractingOcr}
            errorMessage={ocrError}
            warningMessage={
              !isOnline
                ? 'Nutrition label OCR is disabled offline. Reconnect to continue scanning labels.'
                : null
            }
            validationMessage={ocrValidationMessage}
            primaryLabel="Review nutrition label"
            onTakePhotoSelect={(file) => {
              void handleOcrFileSelection(file)
            }}
            onChoosePhotoSelect={(file) => {
              void handleOcrFileSelection(file)
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
              setOcrImage(null)
              setOcrValidationMessage(null)
              setOcrError(null)
            }}
          />
        </Suspense>
      ) : sheetMode === 'ocrReview' ? (
        <Suspense fallback={<div className="px-4 py-6 text-sm text-slate-600 dark:text-slate-300">Loading OCR review...</div>}>
          <LabelReviewSheet
            values={ocrReviewValues}
            previewUrl={ocrImage?.previewUrl ?? null}
            fileName={ocrImage?.file.name ?? null}
            errorMessage={ocrError}
            noticeMessage={ocrReviewNotice}
            warnings={ocrReviewState?.warnings ?? []}
            topWarning={ocrReviewState?.topWarning ?? null}
            badgeLabel={ocrReviewState?.badgeLabel}
            saveLabel={ocrReviewState?.saveLabel ?? 'Save reviewed food'}
            saveDisabled={ocrReviewState?.saveBlocked ?? false}
            servingInterpretations={ocrSession?.servingInterpretations}
            selectedInterpretationId={ocrSelectedInterpretationId}
            showManualServingFields={ocrReviewState?.showManualServingFields ?? false}
            onChange={updateOcrReviewValue}
            onSelectInterpretation={handleSelectOcrInterpretation}
            onSubmit={handleSaveOcrFood}
            onRetake={() =>
              requestDiscard(
                () => {
                  setOcrSession(null)
                  setOcrReviewValues(EMPTY_LABEL_REVIEW_VALUES)
                  setOcrSelectedInterpretationId(null)
                  setOcrMacrosEdited(false)
                  setOcrReviewNotice(null)
                  setOcrError(null)
                  setOcrValidationMessage(null)
                  setOcrImage(null)
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
                    lookupTrustLevel === 'exact_autolog'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
                      : lookupTrustLevel === 'blocked'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'
                  }`}
                >
                  {lookupTrustLevel === 'exact_autolog'
                    ? 'Exact match'
                    : lookupTrustLevel === 'blocked'
                      ? 'Manual review required'
                      : 'Review serving'}
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
                  {lookupTrustLevel === 'blocked'
                    ? 'Fix and save'
                    : lookupTrustLevel === 'exact_review'
                      ? 'Review and save'
                      : 'Use this food'}
                </button>
                {mode === 'add' && canDirectLogLookup ? (
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
          describeFoodEnabled={describeFoodEnabled}
          describeDraft={describeDraft}
          onStartDescribeFood={handleStartDescribeFood}
          onApplyDescribeDraft={handleApplyDescribeDraft}
          onDismissDescribeDraft={dismissDescribeDraft}
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
          personalLibraryEnabled={personalLibraryEnabled}
          repeatCandidates={repeatFoodResults}
          foodCatalogSearchEnabled={foodCatalogSearchEnabled}
          catalogSearchResults={visibleCatalogSearchResults}
          catalogTotalResults={catalogSearchResults.length}
          catalogLibraryMatches={catalogLibraryMatches}
          catalogCollapsed={shouldCollapseCatalog && !catalogExpanded}
          onExpandCatalog={() => setCatalogExpanded(true)}
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
          archivedImportCandidate={archivedImportCandidate}
          onRestoreArchivedImport={handleRestoreArchivedImport}
          discardAction={discardAction}
          discardMessage={discardMessage}
          onCancelDiscard={() => setDiscardAction(null)}
        />
      )}
    </BottomSheet>
  )
}
