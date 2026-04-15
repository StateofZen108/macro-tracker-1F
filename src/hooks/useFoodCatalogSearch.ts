import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type {
  CatalogFood,
  FavoriteFood,
  Food,
  MealType,
  Recipe,
  RemoteCatalogHit,
  SavedMeal,
  UnifiedFoodSearchResult,
} from '../types'
import {
  buildUnifiedSearchResults,
  deriveSearchMatchKind,
  isStrongLocalHit,
} from '../domain/foodCatalog/search'
import { recordDiagnosticsEvent } from '../utils/diagnostics'
import { searchRemoteFoodCatalog } from '../utils/foodCatalog'
import {
  loadCatalogCache,
  subscribeToCatalogCache,
  upsertRemoteCatalogHits,
} from '../utils/storage/catalogCache'

interface UseFoodCatalogSearchOptions {
  enabled?: boolean
  query: string
  foods: Food[]
  savedMeals: SavedMeal[]
  recipes: Recipe[]
  favorites: FavoriteFood[]
  targetMeal?: MealType
  isOnline: boolean
}

function mapRemoteHitToSearchResult(
  query: string,
  hit: RemoteCatalogHit,
): UnifiedFoodSearchResult | null {
  const matchKind = deriveSearchMatchKind(query, hit)
  if (!matchKind) {
    return null
  }

  const now = new Date().toISOString()
  const cacheKey = `${hit.provider}:${hit.remoteKey}`
  const record: CatalogFood = {
    id: `catalog-${cacheKey}`,
    remoteKey: hit.remoteKey,
    provider: hit.provider,
    name: hit.name,
    brand: hit.brand,
    servingSize: hit.servingSize,
    servingUnit: hit.servingUnit,
    calories: hit.calories,
    protein: hit.protein,
    carbs: hit.carbs,
    fat: hit.fat,
    fiber: hit.fiber,
    barcode: hit.barcode,
    imageUrl: hit.imageUrl,
    importConfidence: hit.importConfidence,
    sourceQuality: hit.sourceQuality,
    sourceQualityNote: hit.sourceQualityNote,
    importTrust: hit.importTrust,
    cachedAt: now,
    staleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now,
  }

  return {
    source: 'off_remote',
    matchKind,
    id: `remote-${cacheKey}`,
    name: hit.name,
    brand: hit.brand,
    servingSize: hit.servingSize,
    servingUnit: hit.servingUnit,
    calories: hit.calories,
    protein: hit.protein,
    carbs: hit.carbs,
    fat: hit.fat,
    score: 0,
    record,
    provider: hit.provider,
    importConfidence: hit.importConfidence,
    sourceQuality: hit.sourceQuality,
    sourceQualityNote: hit.sourceQualityNote,
    importTrust: hit.importTrust,
  }
}

function resolveSearchLocale(): 'en-GB' | 'en-US' {
  const locale =
    typeof navigator === 'undefined' || typeof navigator.language !== 'string'
      ? 'en-GB'
      : navigator.language
  return locale.toLowerCase().startsWith('en-us') ? 'en-US' : 'en-GB'
}

function mergeRemoteResults(
  currentResults: UnifiedFoodSearchResult[],
  nextResults: UnifiedFoodSearchResult[],
): UnifiedFoodSearchResult[] {
  const merged = new Map(currentResults.map((result) => [result.id, result]))
  for (const result of nextResults) {
    merged.set(result.id, result)
  }
  return [...merged.values()]
}

export function useFoodCatalogSearch({
  enabled = true,
  query,
  foods,
  savedMeals,
  recipes,
  favorites,
  targetMeal,
  isOnline,
}: UseFoodCatalogSearchOptions) {
  const locale = useMemo(() => resolveSearchLocale(), [])
  const failureSignatureRef = useRef<string | null>(null)
  const [remoteState, setRemoteState] = useState<{
    results: UnifiedFoodSearchResult[]
    status: 'idle' | 'loading' | 'ok' | 'unavailable'
    nextCursor?: string
    loadingMore: boolean
  }>({
    results: [],
    status: 'idle',
    nextCursor: undefined,
    loadingMore: false,
  })

  const cachedRemote = useSyncExternalStore(
    subscribeToCatalogCache,
    loadCatalogCache,
    loadCatalogCache,
  )

  const localResults = useMemo(
    () =>
      buildUnifiedSearchResults({
        query,
        foods,
        savedMeals,
        recipes,
        favorites,
        cachedRemote,
        targetMeal,
      }),
    [cachedRemote, favorites, foods, query, recipes, savedMeals, targetMeal],
  )

  const normalizedQuery = query.trim()
  const hasBarcodeMatch = localResults.some((result) => result.matchKind === 'barcode')
  const strongLocalHitCount = localResults.filter(isStrongLocalHit).length

  const recordSearchFailure = useCallback(
    (signature: string, payload: Record<string, unknown>) => {
      if (failureSignatureRef.current === signature) {
        return
      }

      failureSignatureRef.current = signature
      void recordDiagnosticsEvent({
        eventType: 'food_catalog_search_failed',
        severity: 'warning',
        scope: 'diagnostics',
        message: 'Remote food catalog search was unavailable.',
        recordKey: normalizedQuery || undefined,
        payload,
      })
    },
    [normalizedQuery],
  )

  const fetchRemotePage = useCallback(
    async (cursor?: string, append = false): Promise<void> => {
      const result = await searchRemoteFoodCatalog({
        query: normalizedQuery,
        cursor,
        locale,
      })
      if (!result.ok || result.data.remoteStatus === 'unavailable') {
        recordSearchFailure(
          `${normalizedQuery}:${cursor ?? 'initial'}:${result.ok ? 'unavailable' : result.error.code}`,
          {
            cursor: cursor ?? null,
            result: result.ok ? 'unavailable' : result.error.code,
          },
        )
        setRemoteState((current) => ({
          results: append ? current.results : [],
          status: 'unavailable',
          nextCursor: undefined,
          loadingMore: false,
        }))
        return
      }

      failureSignatureRef.current = null
      void upsertRemoteCatalogHits(result.data.results)
      const mappedResults = result.data.results
        .map((hit) => mapRemoteHitToSearchResult(normalizedQuery, hit))
        .filter((value): value is UnifiedFoodSearchResult => value !== null)

      setRemoteState((current) => ({
        results: append ? mergeRemoteResults(current.results, mappedResults) : mappedResults,
        status: 'ok',
        nextCursor: result.data.nextCursor,
        loadingMore: false,
      }))
    },
    [locale, normalizedQuery, recordSearchFailure],
  )

  useEffect(() => {
    let cancelled = false

    async function runRemoteSearch(): Promise<void> {
      if (
        !enabled ||
        !isOnline ||
        normalizedQuery.length < 3 ||
        strongLocalHitCount >= 8 ||
        hasBarcodeMatch
      ) {
        if (!cancelled) {
          failureSignatureRef.current = null
          setRemoteState({
            results: [],
            status: 'idle',
            nextCursor: undefined,
            loadingMore: false,
          })
        }
        return
      }

      if (!cancelled) {
        setRemoteState({
          results: [],
          status: 'loading',
          nextCursor: undefined,
          loadingMore: false,
        })
      }

      await fetchRemotePage()
      if (cancelled) {
        return
      }
    }

    void runRemoteSearch()

    return () => {
      cancelled = true
    }
  }, [
    enabled,
    fetchRemotePage,
    hasBarcodeMatch,
    isOnline,
    normalizedQuery,
    strongLocalHitCount,
  ])

  const loadMoreRemoteResults = useCallback(() => {
    if (
      !enabled ||
      remoteState.loadingMore ||
      !remoteState.nextCursor ||
      remoteState.status !== 'ok'
    ) {
      return
    }

    setRemoteState((current) => ({
      ...current,
      loadingMore: true,
    }))
    void fetchRemotePage(remoteState.nextCursor, true)
  }, [enabled, fetchRemotePage, remoteState.loadingMore, remoteState.nextCursor, remoteState.status])

  return {
    localResults,
    remoteResults: remoteState.results,
    remoteStatus: remoteState.status,
    nextCursor: remoteState.nextCursor,
    hasMoreRemoteResults: Boolean(remoteState.nextCursor),
    remoteLoadingMore: remoteState.loadingMore,
    loadMoreRemoteResults,
  }
}
