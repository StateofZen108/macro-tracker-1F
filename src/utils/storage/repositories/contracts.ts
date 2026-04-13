import type {
  CollectionRepository,
  Food,
  FoodLogEntry,
  MealTemplate,
  SaveOptions,
  SaveResult,
  SyncMutation,
  SyncState,
  UserSettings,
  WeightEntry,
} from '../../../types'

export interface FoodsQuery {
  search?: string
  barcode?: string
  includeArchived?: boolean
}

export interface LogsQuery {
  date?: string
  meal?: FoodLogEntry['meal']
  includeDeleted?: boolean
}

export type FoodsRepository = CollectionRepository<Food, string, FoodsQuery>

export type LogsRepository = CollectionRepository<FoodLogEntry, string, LogsQuery>

export type WeightsRepository = CollectionRepository<WeightEntry, string, { date?: string }>

export type SavedMealsRepository = CollectionRepository<
  MealTemplate,
  string,
  { includeDeleted?: boolean }
>

export interface SettingsRepository {
  load(): Promise<UserSettings>
  save(settings: UserSettings, options: SaveOptions): Promise<SaveResult<UserSettings>>
  subscribe(listener: () => void): () => void
}

export interface SyncRepository {
  loadState(): Promise<SyncState>
  loadQueue(): Promise<SyncMutation[]>
  saveState(state: SyncState): Promise<void>
  saveQueue(queue: SyncMutation[]): Promise<void>
}
