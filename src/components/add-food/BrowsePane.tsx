import { Camera, Plus, Search, Star, Undo2, X } from 'lucide-react'
import type { RefObject } from 'react'
import type {
  BarcodeLookupResult,
  DescribeFoodDraftV1,
  Food,
  UnifiedFoodSearchResult,
} from '../../types'
import { ServingsInput } from '../ServingsInput'
import {
  describeFood,
  describeFoodWithServings,
  formatSelectedFoodServingPreview,
  formatServingMeta,
  getCatalogImportButtonLabel,
  getCatalogProviderLabel,
  getImportConfidenceLabel,
  getRemoteCatalogStatusLabel,
  getSourceQualityLabel,
} from './helpers'
import type { AddFoodPaneMode, AddFoodRemoteStatus } from './types'

type RepeatCandidateView = {
  food: Food
  servings: number
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
  selectedFood: Food | null
  selectedFoodId: string | null
  onSelectFood: (foodId: string) => void
  onClearSelectedFood: () => void
  servings: number
  onServingsChange: (value: number) => void
  onSubmitFood: (food: Food, servings: number, keepOpen: boolean) => void
  canUseLastAmount: (food: Food) => boolean
  keepOpenAfterAdd: boolean
  onChangeKeepOpenAfterAdd: (nextValue: boolean) => void
  lookupMessage?: string | null
  isOnline: boolean
  actionError?: string | null
  onOpenCustomFood: () => void
  onOpenScanner: () => void
  onOpenOcr: () => void
  lastLookupResult?: BarcodeLookupResult | null
  onReviewLastScan: () => void
  quickFoods: Food[]
  favoriteFoodIds: Set<string>
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

function LocalFoodCard({
  food,
  mode,
  selectedFoodId,
  onSelectFood,
  onSubmitFood,
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
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {badge ?? food.source}
          </span>
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
            onClick={() => onSubmitFood(food, 1, true)}
          >
            Add 1x
          </button>
          {canUseLastAmount(food) ? (
            <button
              type="button"
              className="action-button-secondary w-full"
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
  selectedFood,
  selectedFoodId,
  onSelectFood,
  onClearSelectedFood,
  servings,
  onServingsChange,
  onSubmitFood,
  canUseLastAmount,
  keepOpenAfterAdd,
  onChangeKeepOpenAfterAdd,
  lookupMessage,
  isOnline,
  actionError,
  onOpenCustomFood,
  onOpenScanner,
  onOpenOcr,
  lastLookupResult,
  onReviewLastScan,
  quickFoods,
  favoriteFoodIds,
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

  return (
    <div ref={contentRef} className="space-y-4" data-add-food-pane="browse">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          className="field pl-11"
          placeholder={personalLibraryEnabled ? 'Search your library first' : 'Search your saved foods'}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

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
          className="space-y-4 rounded-[28px] border border-teal-300 bg-teal-50/80 p-4 dark:border-teal-500/30 dark:bg-teal-500/10"
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

          {mode === 'add' ? <ServingsInput value={servings} onChange={onServingsChange} /> : null}

          <button
            type="button"
            className="action-button w-full"
            onClick={() => onSubmitFood(selectedFood, servings, mode === 'add' && servings !== 1)}
          >
            {mode === 'replace' ? 'Replace food' : 'Add to meal'}
          </button>
        </div>
      ) : null}

      {mode === 'add' ? (
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

      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" className="action-button-secondary gap-2" onClick={onOpenCustomFood}>
          <Plus className="h-4 w-4" />
          Create custom food
        </button>
        <button
          type="button"
          className="action-button-secondary gap-2"
          onClick={onOpenScanner}
          disabled={!isOnline}
        >
          <Camera className="h-4 w-4" />
          Scan barcode
        </button>
        <button
          type="button"
          className="action-button-secondary gap-2"
          onClick={onOpenOcr}
          disabled={!isOnline}
        >
          <Camera className="h-4 w-4" />
          Scan nutrition label
        </button>
      </div>

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

      {!personalLibraryEnabled && quickFoods.length ? (
        <section className="space-y-3">
          <SectionHeader title="Quick add" detail="Sorted by recent use" />
          <div className="grid gap-3">
            {quickFoods.map((food) => (
              <LocalFoodCard
                key={food.id}
                food={food}
                mode={mode}
                selectedFoodId={selectedFoodId}
                onSelectFood={onSelectFood}
                onSubmitFood={onSubmitFood}
                canUseLastAmount={canUseLastAmount}
                favoriteFoodIds={favoriteFoodIds}
                onToggleFavoriteFood={onToggleFavoriteFood}
              />
            ))}
          </div>
        </section>
      ) : null}

      {personalLibraryEnabled && shortQuery && repeatCandidates.length ? (
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

      {savedMealSearchResults.length ? (
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

      {recipeSearchResults.length ? (
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

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              {personalLibraryEnabled ? 'Your library' : debouncedQuery ? 'Search results' : 'All foods'}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
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

      {foodCatalogSearchEnabled && (catalogSearchResults.length || catalogCollapsed) ? (
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
      ) : debouncedQuery && foodCatalogSearchEnabled && isOnline && remoteStatus === 'unavailable' ? (
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
