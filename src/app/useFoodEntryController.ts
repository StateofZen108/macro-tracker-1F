import { useEffect, useState } from 'react'
import type {
  ActionResult,
  AppActionError,
  CaptureConvenienceSource,
  Food,
  FoodLogEntry,
  FoodSnapshot,
  MealType,
} from '../types'
import { calculateFoodNutrition } from '../utils/macros'
import type { UndoAction } from './useUndoQueue'

export type AddFoodInitialMode = 'browse' | 'scanner' | 'ocr' | 'custom'

export type FoodSheetContext =
  | {
      kind: 'add'
      meal: MealType
      entryContext: 'meal_slot' | 'global_add'
      captureSource?: CaptureConvenienceSource | null
      initialMode?: AddFoodInitialMode
    }
  | {
      kind: 'replace'
      entryId: string
    }

interface QuickAddPayload {
  meal: MealType
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

interface UseFoodEntryControllerOptions {
  entries: FoodLogEntry[]
  addEntry: (meal: MealType, food: Food, servings: number) => ActionResult<FoodLogEntry>
  addSnapshotEntry: (
    meal: MealType,
    snapshot: FoodSnapshot,
    servings: number,
  ) => ActionResult<FoodLogEntry>
  replaceEntryFood: (entryId: string, food: Food) => ActionResult<void>
  deleteEntry: (entryId: string) => ActionResult<void>
  restoreEntry: (entry: FoodLogEntry) => ActionResult<void>
  updateEntryServings: (entryId: string, servings: number) => ActionResult<void>
  reportError: (error: AppActionError | string | null) => void
  queueUndoAction: (item: UndoAction) => void
  scrollEntryIntoView: (entryId: string, meal: MealType) => void
  ensureEditableIntakeDay: (onContinue: () => void) => void
}

export function useFoodEntryController({
  entries,
  addEntry,
  addSnapshotEntry,
  replaceEntryFood,
  deleteEntry,
  restoreEntry,
  updateEntryServings,
  reportError,
  queueUndoAction,
  scrollEntryIntoView,
  ensureEditableIntakeDay,
}: UseFoodEntryControllerOptions) {
  const [foodSheetContext, setFoodSheetContext] = useState<FoodSheetContext | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingServings, setEditingServings] = useState(1)
  const [editingError, setEditingError] = useState<string | null>(null)
  const [foodSheetDirty, setFoodSheetDirty] = useState(false)
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ entryId: string; meal: MealType } | null>(null)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddDirty, setQuickAddDirty] = useState(false)
  const [copyPreviousOpen, setCopyPreviousOpen] = useState(false)
  const [copyPreviousDirty, setCopyPreviousDirty] = useState(false)
  const [templateSheetMeal, setTemplateSheetMeal] = useState<MealType | null>(null)
  const [saveTemplateMeal, setSaveTemplateMeal] = useState<MealType | null>(null)
  const [saveTemplateDirty, setSaveTemplateDirty] = useState(false)
  const [saveRecipeMeal, setSaveRecipeMeal] = useState<MealType | null>(null)
  const [saveRecipeDirty, setSaveRecipeDirty] = useState(false)

  const editingEntry = entries.find((entry) => entry.id === editingEntryId) ?? null
  const editingNutrition = editingEntry
    ? calculateFoodNutrition(editingEntry.snapshot, editingServings)
    : null
  const editSheetDirty = Boolean(editingEntry && editingServings !== editingEntry.servings)

  useEffect(() => {
    if (!pendingScrollTarget || foodSheetContext !== null) {
      return
    }

    scrollEntryIntoView(pendingScrollTarget.entryId, pendingScrollTarget.meal)
    const timeoutId = window.setTimeout(() => {
      setPendingScrollTarget(null)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [entries, foodSheetContext, pendingScrollTarget, scrollEntryIntoView])

  function closeFoodSheet(): void {
    setFoodSheetContext(null)
    setFoodSheetDirty(false)
  }

  function openAddFood(
    meal: MealType,
    options?: {
      entryContext?: 'meal_slot' | 'global_add'
      captureSource?: CaptureConvenienceSource | null
      initialMode?: AddFoodInitialMode
    },
  ): void {
    ensureEditableIntakeDay(() => {
      setFoodSheetContext({
        kind: 'add',
        meal,
        entryContext: options?.entryContext ?? 'meal_slot',
        captureSource: options?.captureSource ?? null,
        initialMode: options?.initialMode ?? 'browse',
      })
      reportError(null)
    })
  }

  function openReplaceFood(entryId: string): void {
    setFoodSheetContext({ kind: 'replace', entryId })
    setFoodSheetDirty(false)
    setEditingEntryId(null)
    setEditingError(null)
  }

  function openQuickAdd(): void {
    ensureEditableIntakeDay(() => {
      setQuickAddOpen(true)
      reportError(null)
    })
  }

  function closeQuickAdd(): void {
    setQuickAddOpen(false)
    setQuickAddDirty(false)
  }

  function openCopyPrevious(): void {
    setCopyPreviousOpen(true)
    reportError(null)
  }

  function closeCopyPrevious(): void {
    setCopyPreviousOpen(false)
    setCopyPreviousDirty(false)
  }

  function openTemplateSheet(meal: MealType): void {
    setTemplateSheetMeal(meal)
    reportError(null)
  }

  function closeTemplateSheet(): void {
    setTemplateSheetMeal(null)
  }

  function openSaveTemplate(meal: MealType): void {
    setSaveTemplateMeal(meal)
    reportError(null)
  }

  function closeSaveTemplate(): void {
    setSaveTemplateMeal(null)
    setSaveTemplateDirty(false)
  }

  function openSaveRecipe(meal: MealType): void {
    setSaveRecipeMeal(meal)
    reportError(null)
  }

  function closeSaveRecipe(): void {
    setSaveRecipeMeal(null)
    setSaveRecipeDirty(false)
  }

  function closeEditSheet(): void {
    setEditingEntryId(null)
    setEditingError(null)
  }

  function openEditSheet(entryId: string): void {
    const entry = entries.find((currentEntry) => currentEntry.id === entryId)
    if (!entry) {
      return
    }

    setEditingServings(entry.servings)
    setEditingEntryId(entryId)
    setEditingError(null)
  }

  function handleConfirmFood(food: Food, servings: number) {
    if (!foodSheetContext) {
      return {
        ok: false as const,
        error: { code: 'missingContext', message: 'Food action context was lost.' },
      }
    }

    if (foodSheetContext.kind === 'replace') {
      const result = replaceEntryFood(foodSheetContext.entryId, food)
      if (!result.ok) {
        reportError(result.error)
        return result
      }

      reportError(null)
      setEditingError(null)
      return result
    }

    const meal = foodSheetContext.meal
    const result = addEntry(meal, food, servings)
    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    setPendingScrollTarget({ entryId: result.data.id, meal })
    return result
  }

  function handleQuickAdd(payload: QuickAddPayload): ActionResult<FoodLogEntry> {
    const result = addSnapshotEntry(
      payload.meal,
      {
        name: payload.name,
        servingSize: 1,
        servingUnit: 'entry',
        calories: payload.calories,
        protein: payload.protein,
        carbs: payload.carbs,
        fat: payload.fat,
        source: 'custom',
      },
      1,
    )

    if (!result.ok) {
      reportError(result.error)
      return result
    }

    reportError(null)
    scrollEntryIntoView(result.data.id, payload.meal)
    return result
  }

  function handleDeleteEntry(entryId: string): void {
    const entry = entries.find((currentEntry) => currentEntry.id === entryId)
    if (!entry) {
      return
    }

    const result = deleteEntry(entryId)
    if (!result.ok) {
      setEditingError(result.error.message)
      reportError(result.error)
      return
    }

    reportError(null)
    queueUndoAction({
      id: crypto.randomUUID(),
      title: 'Entry removed',
      description: entry.snapshot.name,
      actionLabel: 'Undo',
      undo: () => restoreEntry(entry),
    })
  }

  function handleAdjustEntryServings(entryId: string, nextServings: number): void {
    const result = updateEntryServings(entryId, Math.max(0.5, nextServings))
    if (!result.ok) {
      reportError(result.error)
      return
    }

    reportError(null)
  }

  function saveEditingEntry(): void {
    if (!editingEntry) {
      return
    }

    const result = updateEntryServings(editingEntry.id, editingServings)
    if (!result.ok) {
      setEditingError(result.error.message)
      reportError(result.error)
      return
    }

    reportError(null)
    setEditingError(null)
    setEditingEntryId(null)
  }

  function closeLogSheets(): void {
    closeFoodSheet()
    closeEditSheet()
    closeQuickAdd()
    closeCopyPrevious()
    closeTemplateSheet()
    closeSaveTemplate()
    closeSaveRecipe()
  }

  return {
    foodSheetContext,
    foodSheetDirty,
    setFoodSheetDirty,
    closeFoodSheet,
    openAddFood,
    openReplaceFood,
    editingEntry,
    editingEntryId,
    editingServings,
    setEditingServings,
    editingError,
    editSheetDirty,
    editingNutrition,
    openEditSheet,
    closeEditSheet,
    saveEditingEntry,
    handleConfirmFood,
    handleQuickAdd,
    handleDeleteEntry,
    handleAdjustEntryServings,
    quickAddOpen,
    quickAddDirty,
    openQuickAdd,
    closeQuickAdd,
    setQuickAddDirty,
    copyPreviousOpen,
    copyPreviousDirty,
    openCopyPrevious,
    closeCopyPrevious,
    setCopyPreviousDirty,
    templateSheetMeal,
    openTemplateSheet,
    closeTemplateSheet,
    saveTemplateMeal,
    saveTemplateDirty,
    openSaveTemplate,
    closeSaveTemplate,
    setSaveTemplateDirty,
    saveRecipeMeal,
    saveRecipeDirty,
    openSaveRecipe,
    closeSaveRecipe,
    setSaveRecipeDirty,
    closeLogSheets,
  }
}
