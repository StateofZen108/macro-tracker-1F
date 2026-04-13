import { Camera, Plus, Search, Star, Undo2, X } from 'lucide-react'
import type { RefObject } from 'react'
import type { Food, UnifiedFoodSearchResult } from '../../types'
import { ServingsInput } from '../ServingsInput'
import {
  describeFood,
  formatServingsLabel,
  getRemoteCatalogStatusLabel,
} from './helpers'
import type { AddFoodPaneMode, AddFoodRemoteStatus } from './types'

export interface BrowsePaneProps {
  mode: AddFoodPaneMode
  query: string
  searchInputRef?: RefObject<HTMLInputElement | null>
  contentRef?: RefObject<HTMLDivElement | null>
  onQueryChange: (value: string) => void
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
  lastLookupResult?: import('../../types').BarcodeLookupResult | null
  onReviewLastScan: () => void
  quickFoods: Food[]
  favoriteFoodIds: Set<string>
  onToggleFavoriteFood?: (foodId: string) => void
  savedMealSearchResults: UnifiedFoodSearchResult[]
  onApplySavedMealSelection: (savedMealId: string) => void
  recipeSearchResults: UnifiedFoodSearchResult[]
  onConfirmRecipeSelection: (recipeId: string) => void
  foodCatalogSearchEnabled: boolean
  catalogSearchResults: UnifiedFoodSearchResult[]
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
  discardAction?: (() => void) | null
  discardMessage: string
  onCancelDiscard: () => void
}

export function BrowsePane({
  mode,
  query,
  searchInputRef,
  contentRef,
  onQueryChange,
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
  foodCatalogSearchEnabled,
  catalogSearchResults,
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
  discardAction,
  discardMessage,
  onCancelDiscard,
}: BrowsePaneProps) {
  return (
    <div ref={contentRef} className="space-y-4" data-add-food-pane="browse">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchInputRef}
          className="field pl-11"
          placeholder="Search your saved foods"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      {selectedFood ? (
        <div className="space-y-4 rounded-[28px] border border-teal-300 bg-teal-50/80 p-4 dark:border-teal-500/30 dark:bg-teal-500/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
                Selected food
              </p>
              <p className="font-display text-2xl text-slate-900 dark:text-white">{selectedFood.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-300">
                {selectedFood.brand ? `${selectedFood.brand} • ` : ''}
                {selectedFood.servingSize}
                {selectedFood.servingUnit}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                {describeFood(selectedFood)}
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

      {lookupMessage && !selectedFood ? (
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

      {quickFoods.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              Quick add
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">Sorted by recent use</p>
          </div>
          <div className="grid gap-3">
            {quickFoods.map((food) => (
              <div
                key={food.id}
                className={`rounded-[24px] border p-4 text-left transition ${
                  selectedFoodId === food.id
                    ? 'border-teal-400 bg-teal-50 shadow-glow dark:border-teal-500/50 dark:bg-teal-500/10'
                    : 'border-black/5 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900'
                }`}
              >
                <button type="button" className="w-full text-left" onClick={() => onSelectFood(food.id)}>
                  <p className="font-semibold text-slate-900 dark:text-white">{food.name}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                      {food.brand ? `${food.brand} • ` : ''}
                    {food.servingSize}
                    {food.servingUnit}
                  </p>
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
                        Add {formatServingsLabel(food.lastServings ?? 1)}x
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
            ))}
          </div>
        </section>
      ) : null}

      {savedMealSearchResults.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              Saved meals
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">Replay frozen snapshots</p>
          </div>
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
                      {Math.round(result.calories ?? 0)} cal • {Math.round(result.protein ?? 0)}P • {Math.round(
                        result.carbs ?? 0,
                      )}C • {Math.round(result.fat ?? 0)}F
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              Recipes
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">Log as one recipe entry</p>
          </div>
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
                      {Math.round(result.calories ?? 0)} cal • {Math.round(result.protein ?? 0)}P • {Math.round(
                        result.carbs ?? 0,
                      )}C • {Math.round(result.fat ?? 0)}F
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

      {foodCatalogSearchEnabled && catalogSearchResults.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              Remote catalog
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              {getRemoteCatalogStatusLabel(remoteStatus, remoteLoadingMore)}
            </p>
          </div>
          <div className="grid gap-3">
            {catalogSearchResults.map((result) => (
              <div
                key={result.id}
                className="rounded-[24px] border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-slate-900/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{result.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      {result.brand ? `${result.brand} • ` : ''}
                      {result.servingSize ?? 1}
                      {result.servingUnit ?? 'serving'}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      {Math.round(result.calories ?? 0)} cal • {Math.round(result.protein ?? 0)}P • {Math.round(
                        result.carbs ?? 0,
                      )}C • {Math.round(result.fat ?? 0)}F
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {result.stale ? 'cached' : 'remote'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    className="action-button-secondary w-full"
                    onClick={() => onImportCatalogFood(result, false)}
                  >
                    Save locally
                  </button>
                  {mode === 'add' ? (
                    <button
                      type="button"
                      className="action-button w-full"
                      onClick={() => onImportCatalogFood(result, true)}
                    >
                      Import and add 1x
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {hasMoreRemoteResults ? (
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

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              {debouncedQuery ? 'Search results' : 'All foods'}
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
                        {food.brand ? `${food.brand} • ` : ''}
                        {food.servingSize}
                        {food.servingUnit}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {food.source}
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
                        Add {formatServingsLabel(food.lastServings ?? 1)}x
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

      {discardAction ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold">Discard current changes?</p>
          <p className="mt-1">{discardMessage}</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="action-button-secondary flex-1" onClick={onCancelDiscard}>
              Keep editing
            </button>
            <button type="button" className="action-button flex-1" onClick={discardAction}>
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
