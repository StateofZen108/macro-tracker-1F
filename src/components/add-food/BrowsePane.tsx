import { Camera, Plus, Search, Star, Undo2, X } from 'lucide-react'
import { useState, type RefObject } from 'react'
import { FEATURE_FLAGS } from '../../config/featureFlags'
import { classifyFoodTrustEvidence, getFoodTrustDetail, getFoodTrustLabel } from '../../domain/foodTrust'
import type {
  BarcodeLookupResult,
  CaptureConvenienceDraft,
  DescribeFoodDraftV1,
  Food,
  ToolbarColorToken,
  UnifiedFoodSearchResult,
  UserSettings,
} from '../../types'
import { ServingsInput } from '../ServingsInput'
import {
  describeFood,
  describeFoodWithServings,
  formatSelectedFoodServingPreview,
  formatServingsLabel,
  formatServingMeta,
  getCatalogImportButtonLabel,
  getCatalogProviderLabel,
  getImportConfidenceLabel,
  getSelectedFoodMetricBasis,
  getRemoteCatalogStatusLabel,
  getSourceQualityLabel,
} from './helpers'
import type { AddFoodPaneMode, AddFoodRemoteStatus } from './types'

type RepeatCandidateView = {
  food: Food
  servings: number
}

type QuickActionButton = {
  key: 'scanner' | 'ocr' | 'custom'
  label: string
  icon: typeof Camera | typeof Plus
  disabled: boolean
  onClick: () => void
  colorToken?: ToolbarColorToken
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildOrderedQuickActionButtons(
  quickActionButtons: ReadonlyArray<QuickActionButton>,
  loggingShortcutPreference?: UserSettings['loggingShortcutPreference'],
  loggingShortcuts?: UserSettings['loggingShortcuts'],
): QuickActionButton[] {
  if (loggingShortcuts?.length) {
    const byId = new Map(quickActionButtons.map((button) => [button.key, button] as const))
    const orderedFromSettings = loggingShortcuts
      .filter((entry) => entry.visible)
      .sort((left, right) => left.order - right.order)
      .reduce<QuickActionButton[]>((ordered, entry) => {
        const button = byId.get(entry.id as QuickActionButton['key'])
        if (button) {
          ordered.push({
            ...button,
            colorToken: entry.colorToken,
          })
        }
        return ordered
      }, [])

    if (orderedFromSettings.length) {
      return orderedFromSettings
    }
  }

  const enabledShortcutIds = loggingShortcutPreference?.enabledShortcutIds
  const enabledButtons =
    enabledShortcutIds && enabledShortcutIds.length
      ? quickActionButtons.filter((button) => enabledShortcutIds.includes(button.key))
      : quickActionButtons

  const orderedByPreference = (() => {
    const shortcutOrder = loggingShortcutPreference?.shortcutOrder ?? []
    if (!shortcutOrder.length) {
      return [...enabledButtons]
    }

    const ordered = new Map<string, QuickActionButton>()
    for (const shortcutId of shortcutOrder) {
      const button = enabledButtons.find((entry) => entry.key === shortcutId)
      if (button) {
        ordered.set(button.key, button)
      }
    }
    for (const button of enabledButtons) {
      if (!ordered.has(button.key)) {
        ordered.set(button.key, button)
      }
    }
    return [...ordered.values()]
  })()

  const preferredShortcutId = loggingShortcutPreference?.topShortcutId ?? 'scanner'
  const topButton = orderedByPreference.find((button) => button.key === preferredShortcutId)
  const remainingButtons = orderedByPreference.filter((button) => button.key !== preferredShortcutId)
  const orderedButtons = topButton ? [topButton, ...remainingButtons] : [...orderedByPreference]

  if (loggingShortcutPreference?.barcodeFirst === false) {
    const scannerButton = orderedButtons.find((button) => button.key === 'scanner')
    return [
      ...orderedButtons.filter((button) => button.key !== 'scanner'),
      ...(scannerButton ? [scannerButton] : []),
    ]
  }

  return orderedButtons
}

// eslint-disable-next-line react-refresh/only-export-components
export function shouldCollapseLegacyAddFoodSections(params: {
  mode: AddFoodPaneMode
  mealAwareLaneVisible: boolean
  phaseTemplateLaneVisible?: boolean
  query: string
  showMoreWaysToLog: boolean
}): boolean {
  return (
    params.mode === 'add' &&
    params.query.trim().length === 0 &&
    !params.showMoreWaysToLog
  )
}

type ArchivedImportCandidateView = {
  food: Food
} | null

export interface BrowsePaneProps {
  mode: AddFoodPaneMode
  query: string
  searchInputRef?: RefObject<HTMLInputElement | null>
  contentRef?: RefObject<HTMLDivElement | null>
  onQueryChange: (value: string) => void
  describeFoodEnabled: boolean
  describeDraft: DescribeFoodDraftV1 | null
  onStartDescribeFood: () => void
  onApplyDescribeDraft: () => void
  onDismissDescribeDraft: () => void
  captureConvenienceEnabled?: boolean
  captureDraft?: CaptureConvenienceDraft | null
  onApplyCaptureDraft: () => void
  onDismissCaptureDraft: () => void
  selectedFood: Food | null
  selectedFoodId: string | null
  onSelectFood: (foodId: string) => void
  onClearSelectedFood: () => void
  servings: number
  onServingsChange: (value: number) => void
  onSubmitFood: (food: Food, servings: number, keepOpen: boolean) => void
  foodSubmitPending: boolean
  canUseLastAmount: (food: Food) => boolean
  keepOpenAfterAdd: boolean
  onChangeKeepOpenAfterAdd: (nextValue: boolean) => void
  lookupMessage?: string | null
  isOnline: boolean
  actionError?: string | null
  onOpenCustomFood: () => void
  onOpenScanner: () => void
  onOpenOcr: () => void
  onOpenVoiceCapture: () => void
  lastLookupResult?: BarcodeLookupResult | null
  onReviewLastScan: () => void
  quickFoods: Food[]
  favoriteFoodIds: Set<string>
  loggingShortcutPreference?: UserSettings['loggingShortcutPreference']
  loggingToolbarStyle?: UserSettings['loggingToolbarStyle']
  loggingShortcuts?: UserSettings['loggingShortcuts']
  mealAwareLaneVisible?: boolean
  phaseTemplateLaneVisible?: boolean
  onToggleFavoriteFood?: (foodId: string) => void
  savedMealSearchResults: UnifiedFoodSearchResult[]
  onApplySavedMealSelection: (savedMealId: string) => void
  recipeSearchResults: UnifiedFoodSearchResult[]
  onConfirmRecipeSelection: (recipeId: string) => void
  personalLibraryEnabled: boolean
  repeatCandidates: RepeatCandidateView[]
  foodCatalogSearchEnabled: boolean
  catalogSearchResults: UnifiedFoodSearchResult[]
  catalogTotalResults: number
  catalogLibraryMatches: Set<string>
  catalogCollapsed: boolean
  onExpandCatalog: () => void
  remoteStatus: AddFoodRemoteStatus
  remoteLoadingMore: boolean
  hasMoreRemoteResults: boolean
  onLoadMoreRemoteResults: () => void
  onImportCatalogFood: (result: UnifiedFoodSearchResult, shouldAddImmediately: boolean) => void
  debouncedQuery: string
  displayedSearchResults: Food[]
  visibleSearchResults: Food[]
  hiddenSearchResultCount: number
  onShowMoreResults: () => void
  archivedImportCandidate: ArchivedImportCandidateView
  onRestoreArchivedImport: () => void
  discardAction?: (() => void) | null
  discardMessage: string
  onCancelDiscard: () => void
}

function SectionHeader({
  title,
  detail,
}: {
  title: string
  detail?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
        {title}
      </h3>
      {detail ? <p className="text-xs text-slate-500 dark:text-slate-300">{detail}</p> : null}
    </div>
  )
}

function FoodTrustBadge({ food }: { food: Food }) {
  if (!FEATURE_FLAGS.foodTrustConfidenceV3) {
    return null
  }

  const evidence = food.trustEvidence ?? classifyFoodTrustEvidence({ food })
  const tone =
    evidence.status === 'trusted'
      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
      : evidence.status === 'blocked'
        ? 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
        : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}
      title={getFoodTrustDetail(evidence)}
      data-testid="food-trust-badge"
      data-food-trust-status={evidence.status}
    >
      {getFoodTrustLabel(evidence)}
    </span>
  )
}

function LocalFoodCard({
  food,
  mode,
  selectedFoodId,
  onSelectFood,
  onSubmitFood,
  submitDisabled = false,
  canUseLastAmount,
  favoriteFoodIds,
  onToggleFavoriteFood,
  badge,
}: {
  food: Food
  mode: AddFoodPaneMode
  selectedFoodId: string | null
  onSelectFood: (foodId: string) => void
  onSubmitFood: (food: Food, servings: number, keepOpen: boolean) => void
  submitDisabled?: boolean
  canUseLastAmount: (food: Food) => boolean
  favoriteFoodIds: Set<string>
  onToggleFavoriteFood?: (foodId: string) => void
  badge?: string
}) {
  return (
    <div
      key={food.id}
      className={`rounded-[24px] border p-4 text-left transition ${
        selectedFoodId === food.id
          ? 'border-teal-400 bg-teal-50 shadow-glow dark:border-teal-500/50 dark:bg-teal-500/10'
          : 'border-black/5 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900'
      }`}
    >
      <button type="button" className="w-full text-left" onClick={() => onSelectFood(food.id)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{food.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              {food.brand ? `${food.brand} - ` : ''}
              {food.servingSize}
              {food.servingUnit}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {badge ?? food.source}
            </span>
            <FoodTrustBadge food={food} />
          </div>
        </div>
        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          {describeFood(food)}
        </p>
      </button>
      {mode === 'add' ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="action-button-secondary w-full"
            disabled={submitDisabled}
            aria-busy={submitDisabled || undefined}
            onClick={() => onSubmitFood(food, 1, true)}
          >
            Add 1x
          </button>
          {canUseLastAmount(food) ? (
            <button
              type="button"
              className="action-button-secondary w-full"
              disabled={submitDisabled}
              aria-busy={submitDisabled || undefined}
              onClick={() => onSubmitFood(food, food.lastServings ?? 1, true)}
            >
              Use last amount
            </button>
          ) : null}
          {onToggleFavoriteFood ? (
            <button
              type="button"
              className="action-button-secondary w-full sm:col-span-2"
              onClick={() => onToggleFavoriteFood(food.id)}
            >
              {favoriteFoodIds.has(food.id) ? 'Remove favorite' : 'Add favorite'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function BrowsePane({
  mode,
  query,
  searchInputRef,
  contentRef,
  onQueryChange,
  describeFoodEnabled,
  describeDraft,
  onStartDescribeFood,
  onApplyDescribeDraft,
  onDismissDescribeDraft,
  captureConvenienceEnabled = false,
  captureDraft = null,
  onApplyCaptureDraft,
  onDismissCaptureDraft,
  selectedFood,
  selectedFoodId,
  onSelectFood,
  onClearSelectedFood,
  servings,
  onServingsChange,
  onSubmitFood,
  foodSubmitPending,
  canUseLastAmount,
  keepOpenAfterAdd,
  onChangeKeepOpenAfterAdd,
  lookupMessage,
  isOnline,
  actionError,
  onOpenCustomFood,
  onOpenScanner,
  onOpenOcr,
  onOpenVoiceCapture,
  lastLookupResult,
  onReviewLastScan,
  quickFoods,
  favoriteFoodIds,
  loggingShortcutPreference,
  loggingToolbarStyle,
  loggingShortcuts,
  mealAwareLaneVisible = false,
  phaseTemplateLaneVisible = false,
  onToggleFavoriteFood,
  savedMealSearchResults,
  onApplySavedMealSelection,
  recipeSearchResults,
  onConfirmRecipeSelection,
  personalLibraryEnabled,
  repeatCandidates,
  foodCatalogSearchEnabled,
  catalogSearchResults,
  catalogTotalResults,
  catalogLibraryMatches,
  catalogCollapsed,
  onExpandCatalog,
  remoteStatus,
  remoteLoadingMore,
  hasMoreRemoteResults,
  onLoadMoreRemoteResults,
  onImportCatalogFood,
  debouncedQuery,
  displayedSearchResults,
  visibleSearchResults,
  hiddenSearchResultCount,
  onShowMoreResults,
  archivedImportCandidate,
  onRestoreArchivedImport,
  discardAction,
  discardMessage,
  onCancelDiscard,
}: BrowsePaneProps) {
  const [showMoreWaysToLog, setShowMoreWaysToLog] = useState(false)
  const shortQuery = debouncedQuery.trim().length < 3
  const selectedFoodPreview = selectedFood
    ? formatSelectedFoodServingPreview({
        brand: selectedFood.brand,
        servingSize: selectedFood.servingSize,
        servingUnit: selectedFood.servingUnit,
        labelNutrition: selectedFood.labelNutrition,
        servings,
      })
    : null
  const selectedFoodMetricBasis = selectedFood
      ? getSelectedFoodMetricBasis({
        servingSize: selectedFood.servingSize,
        servingUnit: selectedFood.servingUnit,
        labelNutrition: selectedFood.labelNutrition,
      })
    : null
  const quickActionButtons: QuickActionButton[] = [
    {
      key: 'scanner',
      label: 'Scan barcode',
      icon: Camera,
      disabled: !isOnline,
      onClick: onOpenScanner,
    },
    {
      key: 'ocr',
      label: 'Scan nutrition label',
      icon: Camera,
      disabled: !isOnline,
      onClick: onOpenOcr,
    },
    {
      key: 'custom',
      label: 'Create custom food',
      icon: Plus,
      disabled: false,
      onClick: onOpenCustomFood,
    },
  ] as const
  const orderedQuickActionButtons = buildOrderedQuickActionButtons(
    quickActionButtons,
    loggingShortcutPreference,
    loggingShortcuts,
  )
  const toolbarStyle =
    loggingToolbarStyle ?? loggingShortcutPreference?.toolbarStyle ?? 'search_barcode'
  const collapseLegacyFastPath = shouldCollapseLegacyAddFoodSections({
    mode,
    mealAwareLaneVisible,
    phaseTemplateLaneVisible,
    query: debouncedQuery,
    showMoreWaysToLog,
  })
  const canRevealMoreWaysToLog =
    mode === 'add' &&
    debouncedQuery.length === 0 &&
    !showMoreWaysToLog
  const showLegacyFastPathSections = !collapseLegacyFastPath

  function handleSearchChange(nextQuery: string): void {
    if (nextQuery.trim().length > 0) {
      setShowMoreWaysToLog(true)
    }
    onQueryChange(nextQuery)
  }

  function renderSearchInput(): React.ReactNode {
    return (
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          className="field pl-11"
          placeholder={personalLibraryEnabled ? 'Search your library first' : 'Search your saved foods'}
          value={query}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
      </div>
    )
  }

  function renderQuickActionButton(
    action: (typeof quickActionButtons)[number],
    emphasis: 'primary' | 'secondary' = 'secondary',
  ): React.ReactNode {
    const Icon = action.icon
    const colorClass =
      action.colorToken === 'amber'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100'
        : action.colorToken === 'rose'
          ? 'bg-rose-100 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100'
          : action.colorToken === 'slate'
            ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
            : 'bg-teal-700 text-white'
    return (
      <button
        key={action.key}
        type="button"
        className={`${
          emphasis === 'primary'
            ? 'action-button'
            : `rounded-2xl px-3 py-3 text-sm font-semibold transition ${colorClass}`
        } gap-2`}
        onClick={action.onClick}
        disabled={action.disabled}
      >
        <Icon className="h-4 w-4" />
        {action.label}
      </button>
    )
  }

  return (
    <div ref={contentRef} className="space-y-4" data-add-food-pane="browse">
      <div className="space-y-3">
        {renderSearchInput()}
        {toolbarStyle !== 'none' ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {orderedQuickActionButtons.map((action, index) =>
              renderQuickActionButton(action, index === 0 ? 'primary' : 'secondary'),
            )}
          </div>
        ) : null}
        {canRevealMoreWaysToLog ? (
          <button
            type="button"
            className="action-button-secondary w-full"
            onClick={() => setShowMoreWaysToLog(true)}
          >
            More ways to log
          </button>
        ) : null}
      </div>

      {showMoreWaysToLog && captureConvenienceEnabled ? (
        <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                More ways to log
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-200">
                Reach OCR, custom foods, and other logging inputs without leaving the add-food flow.
              </p>
            </div>
            <button
              type="button"
              className="action-button-secondary"
              onClick={() => setShowMoreWaysToLog(false)}
            >
              Collapse
            </button>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              className="action-button-secondary w-full"
              onClick={onOpenVoiceCapture}
            >
              Voice capture
            </button>
          </div>
        </div>
      ) : null}

      {describeFoodEnabled && query.trim() ? (
        <button
          type="button"
          className="action-button-secondary w-full"
          onClick={onStartDescribeFood}
        >
          Describe food
        </button>
      ) : null}

      {describeDraft ? (
        <div className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Describe food
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{describeDraft.rawText}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Parsed as {describeDraft.item.amount ? `${describeDraft.item.amount} ` : ''}
                {describeDraft.item.unit ? `${describeDraft.item.unit} ` : ''}
                {describeDraft.item.name}
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onDismissDescribeDraft}
              aria-label="Dismiss describe food draft"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {describeDraft.reviewMode.replace('_', ' ')}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {describeDraft.confidence} confidence
            </span>
          </div>

          <button type="button" className="action-button w-full" onClick={onApplyDescribeDraft}>
            {describeDraft.reviewMode === 'local_match'
              ? 'Use matched food'
              : describeDraft.reviewMode === 'remote_match'
                ? 'Review remote match'
                : 'Review manual entry'}
          </button>
        </div>
      ) : null}

      {captureDraft ? (
        <div className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Capture draft
              </p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">{captureDraft.suggestedName}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Source: {captureDraft.rawLabel}
              </p>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onDismissCaptureDraft}
              aria-label="Dismiss capture draft"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              voice
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {captureDraft.confidence} confidence
            </span>
          </div>

          <button type="button" className="action-button w-full" onClick={onApplyCaptureDraft}>
            Review manual entry
          </button>
        </div>
      ) : null}

      {archivedImportCandidate ? (
        <div className="space-y-3 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold">{archivedImportCandidate.food.name} is already in your archived library.</p>
          <p>Restore the archived food instead of creating a duplicate import.</p>
          <button type="button" className="action-button w-full" onClick={onRestoreArchivedImport}>
            Restore existing food
          </button>
        </div>
      ) : null}

      {selectedFood ? (
        <div
          className={`space-y-4 rounded-[28px] border border-teal-300 bg-teal-50/95 p-4 shadow-sm dark:border-teal-500/30 dark:bg-slate-950/95 ${
            mode === 'add'
              ? 'sticky z-20 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]'
              : ''
          }`}
          data-testid="selected-food-card"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                Selected food
              </p>
              <p className="font-display text-2xl text-slate-900 dark:text-white">{selectedFood.name}</p>
                <p
                  className="text-sm text-slate-500 dark:text-slate-300"
                  data-testid="selected-food-serving-meta"
                >
                  {selectedFoodPreview?.primaryMeta}
                </p>
                {selectedFoodPreview?.basisMeta ? (
                  <p
                    className="mt-1 text-xs text-slate-500 dark:text-slate-400"
                    data-testid="selected-food-serving-basis"
                  >
                    {selectedFoodPreview.basisMeta}
                  </p>
                ) : null}
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {describeFoodWithServings(selectedFood, servings)}
                </p>
                <div className="mt-3">
                  <FoodTrustBadge food={selectedFood} />
                </div>
              </div>
            <div className="flex items-center gap-2">
              {mode === 'add' && onToggleFavoriteFood ? (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onToggleFavoriteFood(selectedFood.id)}
                  aria-label={favoriteFoodIds.has(selectedFood.id) ? 'Remove favorite' : 'Add favorite'}
                >
                  <Star
                    className={`h-4 w-4 ${
                      favoriteFoodIds.has(selectedFood.id)
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-slate-400'
                    }`}
                  />
                </button>
              ) : null}
              <button
                type="button"
                className="icon-button"
                onClick={onClearSelectedFood}
                aria-label="Clear selected food"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {mode === 'add' ? (
            <ServingsInput
              value={servings}
              onChange={onServingsChange}
              wholePackageServings={selectedFood.labelNutrition?.servingsPerContainer ?? null}
            />
          ) : null}

          {mode === 'add' && selectedFoodMetricBasis ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Total {selectedFoodMetricBasis.unit}
              <input
                key={`metric-${selectedFood.id}-${formatServingsLabel(servings)}`}
                type="text"
                inputMode="decimal"
                className="field mt-2"
                defaultValue={formatServingsLabel(selectedFoodMetricBasis.amount * servings)}
                onChange={(event) => {
                  const nextValue = event.target.value.replace(',', '.')
                  const parsedValue = Number.parseFloat(nextValue)
                  if (Number.isFinite(parsedValue) && parsedValue > 0) {
                    onServingsChange(parsedValue / selectedFoodMetricBasis.amount)
                  }
                }}
              />
            </label>
          ) : null}

          <button
            type="button"
            className="action-button w-full"
            disabled={foodSubmitPending}
            aria-busy={foodSubmitPending || undefined}
            onClick={() => onSubmitFood(selectedFood, servings, mode === 'add' && servings !== 1)}
          >
            {mode === 'replace' ? 'Replace food' : 'Add to meal'}
          </button>
        </div>
      ) : null}

      {mode === 'add' && (showMoreWaysToLog || query.trim() || selectedFood) ? (
        <div className="rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-slate-900/70">
          <label className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
            <span>Keep batch adds open</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-teal-700"
              checked={keepOpenAfterAdd}
              onChange={(event) => onChangeKeepOpenAfterAdd(event.target.checked)}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            Keeps quick-add shortcuts and custom-serving adds open while preserving your query and list position.
          </p>
        </div>
      ) : null}

      {lookupMessage ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-200">
          {lookupMessage}
        </div>
      ) : null}

      {mode === 'add' && !isOnline ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          You are offline. Local foods still work, but barcode lookup and nutrition-label OCR are paused until you reconnect.
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {actionError}
        </div>
      ) : null}

      {lastLookupResult ? (
        <button
          type="button"
          className="action-button-secondary w-full gap-2"
          onClick={onReviewLastScan}
        >
          <Undo2 className="h-4 w-4" />
          Review last scan
        </button>
      ) : null}

      {showLegacyFastPathSections && quickFoods.length ? (
        <section className="space-y-3">
          <SectionHeader
            title={personalLibraryEnabled ? 'Rapid log' : 'Quick add'}
            detail={personalLibraryEnabled ? 'Barcode, recents, favorites, and repeats first' : 'Sorted by recent use'}
          />
          <div className="grid gap-3">
            {quickFoods.map((food) => (
              <LocalFoodCard
                key={food.id}
                food={food}
                mode={mode}
                selectedFoodId={selectedFoodId}
                onSelectFood={onSelectFood}
                onSubmitFood={onSubmitFood}
                submitDisabled={foodSubmitPending}
                canUseLastAmount={canUseLastAmount}
                favoriteFoodIds={favoriteFoodIds}
                onToggleFavoriteFood={onToggleFavoriteFood}
              />
            ))}
          </div>
        </section>
      ) : null}

      {showLegacyFastPathSections && personalLibraryEnabled && shortQuery && repeatCandidates.length ? (
        <section className="space-y-3">
          <SectionHeader title="Repeat this meal" detail="From the last 30 days" />
          <div className="grid gap-3">
            {repeatCandidates.map((candidate) => (
              <div
                key={`repeat-${candidate.food.id}`}
                className={`rounded-[24px] border p-4 text-left transition ${
                  selectedFoodId === candidate.food.id
                    ? 'border-teal-400 bg-teal-50 shadow-glow dark:border-teal-500/50 dark:bg-teal-500/10'
                    : 'border-black/5 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => onSelectFood(candidate.food.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{candidate.food.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-300">
                        {candidate.food.brand ? `${candidate.food.brand} - ` : ''}
                        {candidate.food.servingSize}
                        {candidate.food.servingUnit}
                      </p>
                    </div>
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:bg-teal-500/10 dark:text-teal-200">
                      repeat
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                    {describeFood(candidate.food)}
                  </p>
                </button>
                {mode === 'add' ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="action-button w-full"
                      disabled={foodSubmitPending}
                      aria-busy={foodSubmitPending || undefined}
                      onClick={() => onSubmitFood(candidate.food, candidate.servings, true)}
                    >
                      Use last amount
                    </button>
                    <button
                      type="button"
                      className="action-button-secondary w-full"
                      onClick={() => onSelectFood(candidate.food.id)}
                    >
                      Review details
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showLegacyFastPathSections && savedMealSearchResults.length ? (
        <section className="space-y-3">
          <SectionHeader title="Saved meals" detail="Replay frozen snapshots" />
          <div className="grid gap-3">
            {savedMealSearchResults.map((result) => (
              <div
                key={result.id}
                className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{result.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      {Math.round(result.calories ?? 0)} cal | {Math.round(result.protein ?? 0)}P | {Math.round(
                        result.carbs ?? 0,
                      )}C | {Math.round(result.fat ?? 0)}F
                    </p>
                  </div>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:bg-teal-500/10 dark:text-teal-200">
                    saved meal
                  </span>
                </div>
                {mode === 'add' ? (
                  <button
                    type="button"
                    className="action-button mt-3 w-full"
                    disabled={foodSubmitPending}
                    aria-busy={foodSubmitPending || undefined}
                    onClick={() => onApplySavedMealSelection(result.id)}
                  >
                    Review and apply
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showLegacyFastPathSections && recipeSearchResults.length ? (
        <section className="space-y-3">
          <SectionHeader title="Recipes" detail="Log as one recipe entry" />
          <div className="grid gap-3">
            {recipeSearchResults.map((result) => (
              <div
                key={result.id}
                className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{result.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      {Math.round(result.calories ?? 0)} cal | {Math.round(result.protein ?? 0)}P | {Math.round(
                        result.carbs ?? 0,
                      )}C | {Math.round(result.fat ?? 0)}F
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    recipe
                  </span>
                </div>
                {mode === 'add' ? (
                  <button
                    type="button"
                    className="action-button mt-3 w-full"
                    disabled={foodSubmitPending}
                    aria-busy={foodSubmitPending || undefined}
                    onClick={() => onConfirmRecipeSelection(result.id)}
                  >
                    Log 1 serving
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showLegacyFastPathSections ? (
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              {personalLibraryEnabled ? 'Your library' : debouncedQuery ? 'Search results' : 'All foods'}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-200">
              Showing {Math.min(displayedSearchResults.length, visibleSearchResults.length)} of {visibleSearchResults.length}{' '}
              {debouncedQuery ? 'matches' : 'foods'}
            </p>
          </div>
          {hiddenSearchResultCount ? (
            <button
              type="button"
              className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={onShowMoreResults}
            >
              Show more
            </button>
          ) : null}
        </div>
        <div className="grid gap-3">
          {displayedSearchResults.length ? (
            displayedSearchResults.map((food) => (
              <LocalFoodCard
                key={food.id}
                food={food}
                mode={mode}
                selectedFoodId={selectedFoodId}
                onSelectFood={onSelectFood}
                onSubmitFood={onSubmitFood}
                submitDisabled={foodSubmitPending}
                canUseLastAmount={canUseLastAmount}
                favoriteFoodIds={favoriteFoodIds}
                onToggleFavoriteFood={onToggleFavoriteFood}
              />
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-teal-300 bg-teal-50/70 px-4 py-6 text-sm text-slate-600 dark:border-teal-500/40 dark:bg-teal-500/10 dark:text-slate-300">
              No local foods matched that search. Try scanning a barcode or create a custom food.
            </div>
          )}
        </div>
        {hiddenSearchResultCount ? (
          <button type="button" className="action-button-secondary w-full" onClick={onShowMoreResults}>
            Show more results
          </button>
        ) : null}
      </section>
      ) : null}

      {showLegacyFastPathSections && foodCatalogSearchEnabled && (catalogSearchResults.length || catalogCollapsed) ? (
        <section className="space-y-3">
          <SectionHeader title="Catalog" detail={getRemoteCatalogStatusLabel(remoteStatus, remoteLoadingMore)} />
          {catalogCollapsed ? (
            <button
              type="button"
              className="action-button-secondary w-full"
              onClick={onExpandCatalog}
            >
              More from catalog ({catalogTotalResults})
            </button>
          ) : null}
          {catalogSearchResults.length ? (
            <div className="grid gap-3">
              {catalogSearchResults.map((result) => {
                const providerLabel = getCatalogProviderLabel(result.provider)
                const importLabel =
                  mode === 'add'
                    ? getCatalogImportButtonLabel(result.importConfidence, result.importTrust?.level, true)
                    : result.importTrust?.level === 'blocked'
                      ? 'Fix and save'
                      : result.importTrust?.level === 'exact_review' ||
                        result.importConfidence === 'weak_match' ||
                        result.importConfidence === 'manual_review_required'
                      ? 'Review and import'
                      : 'Import food'
                return (
                  <div
                    key={result.id}
                    className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{result.name}</p>
                        <p className="text-sm text-slate-500 dark:text-slate-300">
                          {formatServingMeta({
                            brand: result.brand,
                            servingSize: result.servingSize,
                            servingUnit: result.servingUnit,
                          })}
                        </p>
                        <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                          {Math.round(result.calories ?? 0)} cal | {Math.round(result.protein ?? 0)}P | {Math.round(
                            result.carbs ?? 0,
                          )}C | {Math.round(result.fat ?? 0)}F
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {providerLabel}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {result.stale ? 'cached' : 'remote'}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {getImportConfidenceLabel(result.importConfidence)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {getSourceQualityLabel(result.sourceQuality)}
                          </span>
                          {catalogLibraryMatches.has(result.id) ? (
                            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:bg-teal-500/10 dark:text-teal-200">
                              In your library
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="action-button mt-3 w-full"
                      disabled={foodSubmitPending}
                      aria-busy={foodSubmitPending || undefined}
                      onClick={() => onImportCatalogFood(result, mode === 'add')}
                    >
                      {importLabel}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
          {hasMoreRemoteResults && !catalogCollapsed ? (
            <button
              type="button"
              className="action-button-secondary w-full"
              onClick={onLoadMoreRemoteResults}
              disabled={remoteLoadingMore}
            >
              {remoteLoadingMore ? 'Loading more...' : 'Load more catalog results'}
            </button>
          ) : null}
        </section>
      ) : showLegacyFastPathSections && debouncedQuery && foodCatalogSearchEnabled && isOnline && remoteStatus === 'unavailable' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Remote catalog search is temporarily unavailable. Local foods, saved meals, and recipes still work.
        </div>
      ) : null}

      {discardAction ? (
        <div className="space-y-3 rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p>{discardMessage}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="action-button" onClick={discardAction}>
              Discard changes
            </button>
            <button type="button" className="action-button-secondary" onClick={onCancelDiscard}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
