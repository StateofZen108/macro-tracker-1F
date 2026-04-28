import type {
  ActionResult,
  FoodLogEntry,
  FoodSnapshot,
  HistoryImportFileKind,
  HistoryImportPreview,
  HistoryImportPreviewOptions,
  HistoryImportProvider,
  HistoryImportWarning,
  ParsedHistoryPayload,
  WeightEntry,
} from '../../types'
import { buildMacrofactorReplayReport } from '../../domain/cutOs'
import { formatDateKey } from '../dates'
import { parseCsv } from '../import/csv'
import { loadAllFoodLogs, saveFoodLog } from './logs'
import { initializeStorage, isStorageInitialized } from './schema'
import { loadSettings, saveSettings } from './settings'
import { loadWeights, saveWeights } from './weights'

export interface HistoryImportSourceFile {
  name: string
  text: string
}

export const SUPPORTED_HISTORY_IMPORT_HEADERS: Record<HistoryImportFileKind, readonly string[]> = {
  macrofactor_food_rows: [
    'Date',
    'Meal',
    'Food Name',
    'Brand',
    'Serving Quantity',
    'Serving Unit',
    'Servings',
    'Calories',
    'Protein',
    'Carbs',
    'Fat',
    'Fiber',
    'Barcode',
    'Logged At',
  ],
  macrofactor_weights: ['Date', 'Weight', 'Unit', 'Logged At'],
  renpho_weights: ['Date', 'Time', 'Weight', 'Unit', 'BMI', 'Body Fat %', 'Muscle Mass'],
}

interface ParsedCsvFile {
  name: string
  headers: string[]
  rows: Array<Record<string, string>>
}

interface ParsedFoodRow {
  provider: 'macrofactor'
  date: string
  meal: FoodLogEntry['meal']
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  servings: number
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  barcode?: string
  createdAt: string
  updatedAt?: string
}

interface ParsedWeightRow {
  date: string
  weight: number
  unit: WeightEntry['unit']
  createdAt: string
  updatedAt?: string
}

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, error: { code, message } }
}

function normalizeHeader(value: string): string {
  return value.trim()
}

function getTimestamp(record: { updatedAt?: string; createdAt: string }): string {
  return record.updatedAt ?? record.createdAt
}

function areExactHeaders(headers: string[], expectedHeaders: readonly string[]): boolean {
  if (headers.length !== expectedHeaders.length) {
    return false
  }

  const actual = [...headers].map(normalizeHeader).sort()
  const expected = [...expectedHeaders].map(normalizeHeader).sort()
  return actual.every((value, index) => value === expected[index])
}

function hashString(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function normalizeTextForComparison(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeMeal(rawMeal: string): FoodLogEntry['meal'] {
  const value = rawMeal.trim().toLocaleLowerCase()
  if (value.includes('breakfast')) {
    return 'breakfast'
  }
  if (value.includes('lunch')) {
    return 'lunch'
  }
  if (value.includes('dinner')) {
    return 'dinner'
  }

  return 'snack'
}

function parseNumber(rawValue: string): number | null {
  const normalized = rawValue.trim()
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized.replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseCsvFile(file: HistoryImportSourceFile): ActionResult<ParsedCsvFile> {
  const rows = parseCsv(file.text)
    .map((row) => row.map((value) => value.trim()))
    .filter((row) => row.some((value) => value.length > 0))

  if (rows.length < 2) {
    return fail('invalidHistoryImport', `${file.name} is empty or missing data rows.`)
  }

  const headers = rows[0].map(normalizeHeader)
  const body = rows.slice(1).map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = row[index] ?? ''
    })
    return record
  })

  return ok({
    name: file.name,
    headers,
    rows: body,
  })
}

function classifyFile(
  provider: HistoryImportProvider,
  headers: string[],
): HistoryImportFileKind | null {
  if (provider === 'macrofactor') {
    if (areExactHeaders(headers, SUPPORTED_HISTORY_IMPORT_HEADERS.macrofactor_food_rows)) {
      return 'macrofactor_food_rows'
    }
    if (areExactHeaders(headers, SUPPORTED_HISTORY_IMPORT_HEADERS.macrofactor_weights)) {
      return 'macrofactor_weights'
    }
    return null
  }

  if (areExactHeaders(headers, SUPPORTED_HISTORY_IMPORT_HEADERS.renpho_weights)) {
    return 'renpho_weights'
  }

  return null
}

function parseDateOnly(rawValue: string): string | null {
  const value = rawValue.trim()
  if (!value) {
    return null
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return null
}

function parseNaiveTimestamp(rawValue: string): Date | null {
  const value = rawValue.trim()
  if (!value) {
    return null
  }

  const isoMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (isoMatch) {
    const [, year, month, day, hour, minute, second] = isoMatch
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? '0'),
    )
  }

  const amPmMatch = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i,
  )
  if (amPmMatch) {
    const [, month, day, year, rawHour, minute, second, meridiem] = amPmMatch
    let hour = Number(rawHour)
    if (meridiem.toUpperCase() === 'AM') {
      hour = hour === 12 ? 0 : hour
    } else if (hour !== 12) {
      hour += 12
    }

    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour,
      Number(minute),
      Number(second ?? '0'),
    )
  }

  return null
}

function hasExplicitTimezone(rawValue: string): boolean {
  const value = rawValue.trim()
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
}

function resolveImportedDate(
  dateValue: string,
  timestampValue?: string,
): ActionResult<{ date: string; timestamp?: string }> {
  const timestampCandidate = timestampValue?.trim() ? timestampValue.trim() : undefined
  const combinedCandidate = timestampCandidate ?? dateValue.trim()

  if (combinedCandidate) {
    if (hasExplicitTimezone(combinedCandidate)) {
      const parsed = new Date(combinedCandidate)
      if (!Number.isNaN(parsed.getTime())) {
        return ok({
          date: formatDateKey(parsed),
          timestamp: parsed.toISOString(),
        })
      }
    }

    const parsedNaive = parseNaiveTimestamp(combinedCandidate)
    if (parsedNaive) {
      return ok({
        date: formatDateKey(parsedNaive),
        timestamp: parsedNaive.toISOString(),
      })
    }
  }

  const parsedDate = parseDateOnly(dateValue)
  if (parsedDate) {
    return ok({ date: parsedDate })
  }

  return fail('invalidHistoryImport', `Unable to parse a date from "${dateValue}".`)
}

function buildFoodRowKey(row: ParsedFoodRow): string {
  return [
    row.provider,
    row.date,
    row.meal,
    normalizeTextForComparison(row.name),
    row.servingSize.toString(),
    row.servingUnit.trim().toLocaleLowerCase(),
    row.servings.toString(),
    row.calories.toString(),
    row.protein.toString(),
    row.carbs.toString(),
    row.fat.toString(),
    row.updatedAt ?? row.createdAt,
  ].join('|')
}

function countRowRichness(row: ParsedFoodRow): number {
  let richness = 0
  if (row.brand) {
    richness += 1
  }
  if (row.servingSize !== 1 || row.servingUnit !== 'serving') {
    richness += 1
  }
  if (row.fiber !== undefined) {
    richness += 1
  }
  if (row.barcode) {
    richness += 1
  }
  if (row.updatedAt) {
    richness += 1
  }
  return richness
}

function chooseRicherFoodRow(left: ParsedFoodRow, right: ParsedFoodRow): ParsedFoodRow {
  const leftRichness = countRowRichness(left)
  const rightRichness = countRowRichness(right)
  if (leftRichness !== rightRichness) {
    return leftRichness > rightRichness ? left : right
  }

  return getTimestamp(left) <= getTimestamp(right) ? left : right
}

function buildSnapshotIdentity(snapshot: FoodSnapshot): string {
  return [
    normalizeTextForComparison(snapshot.name),
    normalizeTextForComparison(snapshot.brand),
    snapshot.servingSize.toString(),
    snapshot.servingUnit.trim().toLocaleLowerCase(),
    snapshot.calories.toString(),
    snapshot.protein.toString(),
    snapshot.carbs.toString(),
    snapshot.fat.toString(),
    snapshot.fiber?.toString() ?? '',
    snapshot.barcode ?? '',
  ].join('|')
}

function buildFoodSnapshot(row: ParsedFoodRow): FoodSnapshot {
  return {
    name: row.name.trim(),
    brand: normalizeOptionalText(row.brand),
    servingSize: row.servingSize,
    servingUnit: row.servingUnit.trim(),
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    source: 'custom',
    barcode: normalizeOptionalText(row.barcode),
  }
}

function buildDeterministicFoodId(date: string, meal: FoodLogEntry['meal'], snapshot: FoodSnapshot): string {
  return `import:macrofactor:${hashString(`${date}|${meal}|${buildSnapshotIdentity(snapshot)}`)}`
}

function compactFoodRows(rows: ParsedFoodRow[]): FoodLogEntry[] {
  const canonicalRows = new Map<string, ParsedFoodRow>()
  for (const row of rows) {
    const existing = canonicalRows.get(buildFoodRowKey(row))
    canonicalRows.set(buildFoodRowKey(row), existing ? chooseRicherFoodRow(existing, row) : row)
  }

  const compactedEntries = new Map<string, FoodLogEntry>()
  for (const row of canonicalRows.values()) {
    const snapshot = buildFoodSnapshot(row)
    const id = buildDeterministicFoodId(row.date, row.meal, snapshot)
    const existing = compactedEntries.get(id)
    if (!existing) {
      compactedEntries.set(id, {
        id,
        date: row.date,
        meal: row.meal,
        snapshot,
        servings: row.servings,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        foodId: undefined,
        needsReview: false,
      })
      continue
    }

    compactedEntries.set(id, {
      ...existing,
      servings: existing.servings + row.servings,
      updatedAt:
        (existing.updatedAt ?? existing.createdAt) >= getTimestamp(row) ? existing.updatedAt : row.updatedAt ?? row.createdAt,
    })
  }

  return [...compactedEntries.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function parseMacroFactorFoodRows(file: ParsedCsvFile): {
  rows: ParsedFoodRow[]
  skippedRows: number
} {
  let skippedRows = 0
  const parsedRows: ParsedFoodRow[] = []

  for (const row of file.rows) {
    const dateResult = resolveImportedDate(row.Date, row['Logged At'])
    const calories = parseNumber(row.Calories)
    const protein = parseNumber(row.Protein)
    const carbs = parseNumber(row.Carbs)
    const fat = parseNumber(row.Fat)

    if (
      !dateResult.ok ||
      !row['Food Name']?.trim() ||
      calories === null ||
      protein === null ||
      carbs === null ||
      fat === null
    ) {
      skippedRows += 1
      continue
    }

    const servingQuantity = parseNumber(row['Serving Quantity']) ?? 1
    const servings = parseNumber(row.Servings) ?? 1
    const fiber = parseNumber(row.Fiber) ?? undefined
    parsedRows.push({
      provider: 'macrofactor',
      date: dateResult.data.date,
      meal: normalizeMeal(row.Meal),
      name: row['Food Name'].trim(),
      brand: normalizeOptionalText(row.Brand),
      servingSize: servingQuantity,
      servingUnit: normalizeOptionalText(row['Serving Unit']) ?? 'serving',
      servings,
      calories,
      protein,
      carbs,
      fat,
      fiber,
      barcode: normalizeOptionalText(row.Barcode),
      createdAt: dateResult.data.timestamp ?? `${dateResult.data.date}T00:00:00.000Z`,
      updatedAt: dateResult.data.timestamp,
    })
  }

  return {
    rows: parsedRows,
    skippedRows,
  }
}

function parseWeightRows(
  rows: Array<Record<string, string>>,
  options: { dateKey: string; timestampKey?: string; unitKey: string; weightKey: string },
): {
  rows: ParsedWeightRow[]
  skippedRows: number
} {
  let skippedRows = 0
  const parsedRows: ParsedWeightRow[] = []

  for (const row of rows) {
    const dateResult = resolveImportedDate(row[options.dateKey], options.timestampKey ? row[options.timestampKey] : undefined)
    const weight = parseNumber(row[options.weightKey])
    const unitValue = row[options.unitKey]?.trim().toLocaleLowerCase()
    if (!dateResult.ok || weight === null || (unitValue !== 'lb' && unitValue !== 'kg')) {
      skippedRows += 1
      continue
    }

    parsedRows.push({
      date: dateResult.data.date,
      weight,
      unit: unitValue,
      createdAt: dateResult.data.timestamp ?? `${dateResult.data.date}T00:00:00.000Z`,
      updatedAt: dateResult.data.timestamp,
    })
  }

  return {
    rows: parsedRows,
    skippedRows,
  }
}

function dedupeWeights(rows: ParsedWeightRow[]): WeightEntry[] {
  const byDate = new Map<string, ParsedWeightRow>()
  for (const row of rows) {
    const existing = byDate.get(row.date)
    if (!existing || getTimestamp(existing) <= getTimestamp(row)) {
      byDate.set(row.date, row)
    }
  }

  return [...byDate.values()].map((row) => ({
    id: `import:weight:${row.date}`,
    date: row.date,
    weight: row.weight,
    unit: row.unit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

function summarizeDateRange(payload: ParsedHistoryPayload): HistoryImportPreview['dateRange'] {
  const dates = [
    ...payload.foodLogEntries.map((entry) => entry.date),
    ...payload.weights.map((entry) => entry.date),
  ].sort()
  if (!dates.length) {
    return undefined
  }

  return {
    start: dates[0],
    end: dates[dates.length - 1],
  }
}

function buildUnsupportedFileWarning(provider: HistoryImportProvider, fileName: string): HistoryImportWarning {
  if (provider === 'macrofactor') {
    return {
      code: 'unsupportedHistoryImportFile',
      fileName,
      message:
        'Unsupported MacroFactor export format. This importer only supports the checked-in item-level food rows and weight export shapes. Day-level nutrition totals are not enough to build item-level food entries.',
    }
  }

  return {
    code: 'unsupportedHistoryImportFile',
    fileName,
    message:
      'Unsupported Renpho export format. This importer only supports the checked-in weight history CSV shape.',
  }
}

export async function previewHistoryImport(
  provider: HistoryImportProvider,
  files: HistoryImportSourceFile[],
  options: HistoryImportPreviewOptions = {
    localDates: new Set<string>(),
    includeMacrofactorReplay: true,
  },
): Promise<ActionResult<HistoryImportPreview>> {
  if (!files.length) {
    return fail('invalidHistoryImport', 'Select at least one file to preview.')
  }

  const warnings: HistoryImportWarning[] = []
  const fileKinds = new Set<HistoryImportFileKind>()
  const parsedFoodRows: ParsedFoodRow[] = []
  const parsedWeightRows: ParsedWeightRow[] = []
  let skippedRows = 0
  let supportedFiles = 0
  let unsupportedFiles = 0

  for (const sourceFile of files) {
    const parsedFileResult = parseCsvFile(sourceFile)
    if (!parsedFileResult.ok) {
      return parsedFileResult as ActionResult<HistoryImportPreview>
    }

    const parsedFile = parsedFileResult.data
    const fileKind = classifyFile(provider, parsedFile.headers)
    if (!fileKind) {
      unsupportedFiles += 1
      warnings.push(buildUnsupportedFileWarning(provider, sourceFile.name))
      continue
    }

    supportedFiles += 1
    fileKinds.add(fileKind)

    if (fileKind === 'macrofactor_food_rows') {
      const parsed = parseMacroFactorFoodRows(parsedFile)
      parsedFoodRows.push(...parsed.rows)
      skippedRows += parsed.skippedRows
      continue
    }

    if (fileKind === 'macrofactor_weights') {
      const parsed = parseWeightRows(parsedFile.rows, {
        dateKey: 'Date',
        timestampKey: 'Logged At',
        weightKey: 'Weight',
        unitKey: 'Unit',
      })
      parsedWeightRows.push(...parsed.rows)
      skippedRows += parsed.skippedRows
      continue
    }

    const parsed = parseWeightRows(parsedFile.rows, {
      dateKey: 'Date',
      timestampKey: 'Time',
      weightKey: 'Weight',
      unitKey: 'Unit',
    })
    parsedWeightRows.push(...parsed.rows)
    skippedRows += parsed.skippedRows
    warnings.push({
      code: 'historyImportIgnoredColumns',
      fileName: sourceFile.name,
      message:
        'Body-composition columns were detected and ignored. This app currently imports weight only.',
    })
  }

  if (supportedFiles === 0) {
    return fail('unsupportedHistoryImport', 'No supported files were detected in the selected import set.')
  }

  const payload: ParsedHistoryPayload = {
    provider,
    foodLogEntries: compactFoodRows(parsedFoodRows),
    weights: dedupeWeights(parsedWeightRows),
  }

  if (payload.foodLogEntries.length === 0 && payload.weights.length === 0) {
    return fail('emptyHistoryImport', 'The selected files did not contain any importable rows.')
  }

  if (skippedRows > 0) {
    warnings.push({
      code: 'historyImportSkippedRows',
      message: `${skippedRows} row${skippedRows === 1 ? '' : 's'} were skipped because required fields were missing or invalid.`,
    })
  }

  const preview: HistoryImportPreview = {
    provider,
    fileKinds: [...fileKinds.values()],
    counts: {
      logEntries: payload.foodLogEntries.length,
      logDays: new Set(payload.foodLogEntries.map((entry) => entry.date)).size,
      weights: payload.weights.length,
      skippedRows,
      supportedFiles,
      unsupportedFiles,
    },
    dateRange: summarizeDateRange(payload),
    warnings,
    payload,
  }

  if (provider === 'macrofactor' && options.includeMacrofactorReplay) {
    preview.macrofactorReplayReport = buildMacrofactorReplayReport({
      preview,
      localDates: new Set(options.localDates),
    }) ?? undefined
  }

  return ok(preview)
}

function mergeFoodEntries(
  existingEntries: FoodLogEntry[],
  importedEntries: FoodLogEntry[],
): FoodLogEntry[] {
  const byId = new Map(existingEntries.map((entry) => [entry.id, entry]))
  for (const importedEntry of importedEntries) {
    const existing = byId.get(importedEntry.id)
    if (!existing || getTimestamp(existing) <= getTimestamp(importedEntry)) {
      byId.set(importedEntry.id, importedEntry)
    }
  }

  return [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

function mergeWeights(existingWeights: WeightEntry[], importedWeights: WeightEntry[]): WeightEntry[] {
  const byDate = new Map(existingWeights.map((entry) => [entry.date, entry]))
  for (const importedEntry of importedWeights) {
    const existing = byDate.get(importedEntry.date)
    const existingTimestamp = existing ? existing.deletedAt ?? existing.updatedAt ?? existing.createdAt : ''
    const importedTimestamp = importedEntry.deletedAt ?? importedEntry.updatedAt ?? importedEntry.createdAt
    if (!existing || existingTimestamp <= importedTimestamp) {
      byDate.set(importedEntry.date, importedEntry)
    }
  }

  return [...byDate.values()]
}

async function ensureStorageReady(): Promise<void> {
  if (!isStorageInitialized()) {
    await initializeStorage()
  }
}

export async function applyHistoryImport(
  payload: ParsedHistoryPayload,
): Promise<ActionResult<HistoryImportPreview['counts']>> {
  try {
    await ensureStorageReady()

    const existingLogsByDate = loadAllFoodLogs()
    const importedDates = new Set(payload.foodLogEntries.map((entry) => entry.date))
    for (const date of importedDates) {
      const mergedEntries = mergeFoodEntries(
        existingLogsByDate[date] ?? [],
        payload.foodLogEntries.filter((entry) => entry.date === date),
      )
      const saveLogResult = saveFoodLog(date, mergedEntries)
      if (!saveLogResult.ok) {
        return saveLogResult as ActionResult<HistoryImportPreview['counts']>
      }
    }

    const saveWeightsResult = saveWeights(mergeWeights(loadWeights(), payload.weights))
    if (!saveWeightsResult.ok) {
      return saveWeightsResult as ActionResult<HistoryImportPreview['counts']>
    }

    const nextSettings = {
      ...loadSettings(),
      lastImportAt: new Date().toISOString(),
    }
    const saveSettingsResult = saveSettings(nextSettings)
    if (!saveSettingsResult.ok) {
      return saveSettingsResult as ActionResult<HistoryImportPreview['counts']>
    }

    return ok({
      logEntries: payload.foodLogEntries.length,
      logDays: new Set(payload.foodLogEntries.map((entry) => entry.date)).size,
      weights: payload.weights.length,
      skippedRows: 0,
      supportedFiles: 0,
      unsupportedFiles: 0,
    })
  } catch (error) {
    return fail(
      'historyImportFailed',
      error instanceof Error ? error.message : 'Unable to import this history file right now.',
    )
  }
}
