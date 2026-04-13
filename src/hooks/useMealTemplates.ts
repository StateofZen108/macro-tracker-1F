import { useState, useSyncExternalStore } from 'react'
import type {
  ActionResult,
  AppActionError,
  FoodLogEntry,
  MealTemplate,
  MealTemplateEntry,
  MealType,
} from '../types'
import { isSyncEnabled } from '../utils/sync/core'
import { subscribeToStorage } from '../utils/storage/core'
import { loadMealTemplates, saveMealTemplates } from '../utils/storage/templates'

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

function sortTemplates(templates: MealTemplate[]): MealTemplate[] {
  return [...templates].sort((left, right) => {
    if (left.usageCount !== right.usageCount) {
      return right.usageCount - left.usageCount
    }

    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

function normalizeTemplateName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isFoodLogEntry(entry: FoodLogEntry | MealTemplateEntry): entry is FoodLogEntry {
  return 'date' in entry && 'meal' in entry
}

function buildTemplateEntries(entries: FoodLogEntry[]): MealTemplateEntry[] {
  return entries.map((entry, index) => ({
    id: crypto.randomUUID(),
    foodId: entry.foodId,
    snapshot: entry.snapshot,
    servings: entry.servings,
    createdAt: new Date(Date.now() + index).toISOString(),
  }))
}

function buildTemplateEntriesFromInputs(
  entries: Array<FoodLogEntry | MealTemplateEntry>,
): MealTemplateEntry[] {
  return entries.map((entry, index) => ({
    id: isFoodLogEntry(entry) ? crypto.randomUUID() : entry.id,
    foodId: entry.foodId,
    snapshot: entry.snapshot,
    servings: entry.servings,
    createdAt: isFoodLogEntry(entry)
      ? new Date(Date.now() + index).toISOString()
      : entry.createdAt,
  }))
}

export function useMealTemplates() {
  const storedTemplates = useSyncExternalStore(subscribeToStorage, loadMealTemplates, loadMealTemplates)
  const templates = sortTemplates(storedTemplates.filter((template) => !template.deletedAt))
  const [lastError, setLastError] = useState<AppActionError | null>(null)

  function persistTemplates(nextTemplates: MealTemplate[]): ActionResult<void> {
    const result = saveMealTemplates(sortTemplates(nextTemplates))
    setLastError(result.ok ? null : result.error)
    return result
  }

  function findNameCollision(name: string, excludeTemplateId?: string): MealTemplate | null {
    const normalizedName = normalizeTemplateName(name)
    if (!normalizedName) {
      return null
    }

    return (
      loadMealTemplates().find(
        (template) =>
          !template.deletedAt &&
          template.id !== excludeTemplateId &&
          normalizeTemplateName(template.name) === normalizedName,
      ) ?? null
    )
  }

  function createTemplate(
    name: string,
    defaultMeal: MealType,
    entries: FoodLogEntry[],
  ): ActionResult<MealTemplate> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateName',
          message: 'Saved meal name is required.',
        },
      }
      setLastError(result.error)
      return result
    }

    const collision = findNameCollision(trimmedName)
    if (collision) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateNameTaken',
          message: `${collision.name} already exists. Rename this saved meal or replace the existing one.`,
        },
      }
      setLastError(result.error)
      return result
    }

    if (!entries.length) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateEntries',
          message: 'Add at least one logged food before saving a saved meal.',
        },
      }
      setLastError(result.error)
      return result
    }

    const now = new Date().toISOString()
    const createdTemplate: MealTemplate = {
      id: crypto.randomUUID(),
      name: trimmedName,
      defaultMeal,
      entries: buildTemplateEntries(entries),
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
    }

    const result = persistTemplates([...loadMealTemplates(), createdTemplate])
    if (!result.ok) {
      return result as ActionResult<MealTemplate>
    }

    setLastError(null)
    return ok(createdTemplate)
  }

  function updateTemplate(
    templateId: string,
    updates: {
      name?: string
      defaultMeal?: MealType
      entries?: Array<FoodLogEntry | MealTemplateEntry>
    },
  ): ActionResult<MealTemplate> {
    const currentTemplate = loadMealTemplates().find((template) => template.id === templateId)
    if (!currentTemplate) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateNotFound',
          message: 'That saved meal no longer exists.',
        },
      }
      setLastError(result.error)
      return result
    }

    const nextName = updates.name?.trim() ?? currentTemplate.name
    if (!nextName) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateName',
          message: 'Saved meal name is required.',
        },
      }
      setLastError(result.error)
      return result
    }

    const collision = findNameCollision(nextName, currentTemplate.id)
    if (collision) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateNameTaken',
          message: `${collision.name} already exists. Rename this saved meal or replace the existing one.`,
        },
      }
      setLastError(result.error)
      return result
    }

    const nextEntries = updates.entries
      ? buildTemplateEntriesFromInputs(updates.entries)
      : currentTemplate.entries
    if (!nextEntries.length) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateEntries',
          message: 'Saved meals need at least one item.',
        },
      }
      setLastError(result.error)
      return result
    }

    const updatedTemplate: MealTemplate = {
      ...currentTemplate,
      name: nextName,
      defaultMeal: updates.defaultMeal ?? currentTemplate.defaultMeal,
      entries: nextEntries,
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
    }

    const result = persistTemplates(
      loadMealTemplates().map((template) =>
        template.id === templateId ? updatedTemplate : template,
      ),
    )
    if (!result.ok) {
      return result as ActionResult<MealTemplate>
    }

    return ok(updatedTemplate)
  }

  function renameTemplate(templateId: string, name: string): ActionResult<MealTemplate> {
    return updateTemplate(templateId, { name })
  }

  function replaceTemplateEntries(
    templateId: string,
    defaultMeal: MealType,
    entries: Array<FoodLogEntry | MealTemplateEntry>,
  ): ActionResult<MealTemplate> {
    return updateTemplate(templateId, { defaultMeal, entries })
  }

  function incrementTemplateUsage(templateId: string): ActionResult<void> {
    const nextTemplates = loadMealTemplates().map((template) =>
      template.id === templateId
        ? {
            ...template,
            usageCount: template.usageCount + 1,
            lastUsedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : template,
    )

    return persistTemplates(nextTemplates)
  }

  function archiveTemplate(templateId: string): ActionResult<MealTemplate> {
    const archivedTemplate = loadMealTemplates().find((template) => template.id === templateId)
    if (!archivedTemplate) {
      const result: ActionResult<MealTemplate> = {
        ok: false,
        error: {
          code: 'templateNotFound',
          message: 'That saved meal no longer exists.',
        },
      }
      setLastError(result.error)
      return result
    }

    const result = persistTemplates(
      loadMealTemplates().filter((template) => template.id !== templateId),
    )
    if (!result.ok) {
      return result as ActionResult<MealTemplate>
    }

    return ok(archivedTemplate)
  }

  function deleteTemplate(templateId: string): ActionResult<void> {
    if (!isSyncEnabled()) {
      return persistTemplates(loadMealTemplates().filter((template) => template.id !== templateId))
    }

    const deletedAt = new Date().toISOString()
    return persistTemplates(
      loadMealTemplates().map((template) =>
        template.id === templateId
          ? {
              ...template,
              updatedAt: deletedAt,
              deletedAt,
            }
          : template,
      ),
    )
  }

  function restoreTemplate(template: MealTemplate): ActionResult<void> {
    const nextTemplates = sortTemplates(
      loadMealTemplates()
        .filter((currentTemplate) => currentTemplate.id !== template.id)
        .concat({
          ...template,
          updatedAt: new Date().toISOString(),
          deletedAt: undefined,
        }),
    )

    return persistTemplates(nextTemplates)
  }

  return {
    templates,
    createTemplate,
    updateTemplate,
    renameTemplate,
    replaceTemplateEntries,
    incrementTemplateUsage,
    archiveTemplate,
    deleteTemplate,
    restoreTemplate,
    findNameCollision,
    lastError,
  }
}
