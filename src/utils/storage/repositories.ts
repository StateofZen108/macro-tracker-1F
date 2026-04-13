import type {
  Food,
  FoodLogEntry,
  MealTemplate,
  SyncScope,
  UserSettings,
  WeightEntry,
} from '../../types'

export type RepoWriteSource = 'ui' | 'sync' | 'bootstrap' | 'migration' | 'import' | 'system'

export type RepoErrorCode =
  | 'validation'
  | 'notFound'
  | 'storageUnavailable'
  | 'conflict'
  | 'migrationFailed'

export interface RepoError {
  code: RepoErrorCode
  message: string
  retryable: boolean
}

export interface SaveOptions {
  source: RepoWriteSource
  expectedVersion?: number | null
}

export interface SaveResult<T> {
  record: T
  changed: boolean
  version: number
}

export interface ChangeEvent<K> {
  scope: SyncScope | 'diagnostics'
  keys: K[]
  reason: RepoWriteSource
}

export interface CollectionRepository<T, K, Q> {
  loadAll(): Promise<T[]>
  loadByKey(key: K): Promise<T | null>
  query(query: Q): Promise<T[]>
  save(record: T, options: SaveOptions): Promise<SaveResult<T>>
  saveMany(records: T[], options: SaveOptions): Promise<SaveResult<T>[]>
  replaceAll(records: T[], source: RepoWriteSource): Promise<void>
  subscribe(listener: (event: ChangeEvent<K>) => void): () => void
}

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
export type WeightsRepository = CollectionRepository<WeightEntry, string, { includeDeleted?: boolean }>
export type TemplatesRepository = CollectionRepository<
  MealTemplate,
  string,
  { includeDeleted?: boolean; search?: string }
>
export type SettingsRepository = CollectionRepository<UserSettings, 'default', never>
