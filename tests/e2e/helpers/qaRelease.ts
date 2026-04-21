import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import {
  QA_SCENARIO_CATALOG,
  evaluateAccessibilityViolations,
  loadJsonFile,
  writeJsonFile,
} from '../../../scripts/qa-release/shared.mjs'
import {
  ensureMealExpanded,
  entryRow,
  getAddFoodDialog,
  goToLog,
  goToSettings,
  resetApp,
  safeClick,
} from './app'

const QA_LANE_ID = process.env.QA_RELEASE_LANE_ID ?? 'dev_smoke'
const QA_RESULTS_DIR = process.env.QA_RELEASE_RESULTS_DIR
  ? path.resolve(process.env.QA_RELEASE_RESULTS_DIR)
  : path.resolve(process.cwd(), 'test-results', 'qa-release', QA_LANE_ID)
const QA_ACCESSIBILITY_ALLOWLIST_PATH = process.env.QA_ACCESSIBILITY_ALLOWLIST_PATH
  ? path.resolve(process.env.QA_ACCESSIBILITY_ALLOWLIST_PATH)
  : path.resolve(process.cwd(), 'tests', 'fixtures', 'qa', 'accessibility-allowlist.json')

type QaScenarioId =
  | 'clean_install_baseline'
  | 'repeat_logging_fast_path'
  | 'review_queue_pending'
  | 'training_guidance_stale_readiness'
  | 'training_guidance_manual_override'
  | 'progress_story_missing_photo'
  | 'offline_local_logging_only'
  | 'food_catalog_5xx_fallback'
  | 'barcode_permission_denied'
  | 'export_restore_roundtrip'

type QaScenarioContext = {
  addEvidence: (label: string, options?: { fullPage?: boolean }) => Promise<string>
  runAccessibilityAudit: () => Promise<void>
  recordFindings: (
    findings: Array<Record<string, unknown>>,
    options?: { validationErrors?: string[]; expiredAllowlistEntries?: Array<Record<string, unknown>> },
  ) => void
}

function getScenarioDefinition(id: QaScenarioId) {
  const scenario = QA_SCENARIO_CATALOG.find((entry) => entry.id === id)
  if (!scenario) {
    throw new Error(`Unknown QA scenario ${id}.`)
  }
  return scenario
}

async function deleteDatabases(page: Page): Promise<void> {
  await page.evaluate(async () => {
    async function deleteDatabase(name: string): Promise<void> {
      await new Promise<void>((resolve) => {
        const request = window.indexedDB.deleteDatabase(name)
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      })
    }

    await deleteDatabase('macrotracker-app')
    await deleteDatabase('macrotracker-storage')
    await deleteDatabase('macrotracker-body-progress')
  })
}

export async function resetQaApp(page: Page): Promise<void> {
  await resetApp(page)
}

export async function goToHome(page: Page): Promise<void> {
  const homeButton = page.getByRole('button', { name: /^home$/i }).first()
  await expect(homeButton).toBeVisible()
  await safeClick(homeButton)
}

export async function goToCoach(page: Page): Promise<void> {
  const coachButton = page.getByRole('button', { name: /^coach$/i }).first()
  await expect(coachButton).toBeVisible()
  await safeClick(coachButton)
}

export async function goToWorkouts(page: Page): Promise<void> {
  const workoutsButton = page.getByRole('button', { name: /^workouts$/i }).first()
  await expect(workoutsButton).toBeVisible()
  await safeClick(workoutsButton)
}

async function setSettingsPatch(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate((nextPatch) => {
    const currentSettings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    window.localStorage.setItem(
      'mt_settings',
      JSON.stringify({
        ...currentSettings,
        ...nextPatch,
      }),
    )
  }, patch)
}

export async function seedReviewQueuePending(page: Page): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  await page.evaluate(({ todayDate }) => {
    window.localStorage.setItem(
      'mt_food_review_queue',
      JSON.stringify([
        {
          id: 'qa-review-1',
          status: 'pending',
          source: 'catalog_import',
          title: 'Protein bar needs review',
          reason: 'Imported nutrition still needs manual confirmation.',
          createdAt: `${todayDate}T08:00:00.000Z`,
          updatedAt: `${todayDate}T08:00:00.000Z`,
          linkedEntryDate: todayDate,
        },
      ]),
    )
  }, { todayDate: today })
  await page.reload({ waitUntil: 'domcontentloaded' })
}

export async function seedWorkoutGuidance(page: Page, options?: { manualOverride?: 'push' | 'hold' | 'back_off' | 'neutral' }): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const priorDate = new Date(`${today}T00:00:00.000Z`)
  priorDate.setUTCDate(priorDate.getUTCDate() - 4)
  const latestDate = new Date(`${today}T00:00:00.000Z`)
  latestDate.setUTCDate(latestDate.getUTCDate() - 1)
  const priorKey = priorDate.toISOString().slice(0, 10)
  const latestKey = latestDate.toISOString().slice(0, 10)
  const now = new Date().toISOString()

  await page.evaluate(
    ({ todayDate, priorDateKey, latestDateKey, nowIso, manualOverride }) => {
      const programId = 'qa-program'
      const templateId = 'qa-template'
      const exerciseId = 'qa-squat'

      window.localStorage.setItem(
        'mt_workout_programs',
        JSON.stringify([
          {
            id: programId,
            name: 'QA Strength',
            goal: 'strength_preservation',
            templates: [
              {
                id: templateId,
                programId,
                name: 'Day A',
                slotKey: 'day-a',
                createdAt: nowIso,
                updatedAt: nowIso,
                exercises: [
                  {
                    id: exerciseId,
                    name: 'Back Squat',
                    muscleGroup: 'legs',
                    equipment: ['barbell'],
                    targetSets: 3,
                    targetReps: 5,
                    targetLoad: 140,
                    rir: 2,
                    restSeconds: 120,
                  },
                ],
              },
            ],
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ]),
      )

      window.localStorage.setItem(
        'mt_workout_sessions',
        JSON.stringify([
          {
            id: 'qa-session-prior',
            programId,
            templateId,
            slotKey: 'day-a',
            date: priorDateKey,
            createdAt: `${priorDateKey}T07:00:00.000Z`,
            updatedAt: `${priorDateKey}T07:00:00.000Z`,
            completedAt: `${priorDateKey}T07:00:00.000Z`,
            exercises: [
              {
                templateExerciseId: exerciseId,
                name: 'Back Squat',
                sets: [
                  { reps: 5, load: 145, rir: 2 },
                  { reps: 5, load: 145, rir: 2 },
                  { reps: 5, load: 145, rir: 2 },
                ],
              },
            ],
          },
          {
            id: 'qa-session-latest',
            programId,
            templateId,
            slotKey: 'day-a',
            date: latestDateKey,
            createdAt: `${latestDateKey}T07:00:00.000Z`,
            updatedAt: `${latestDateKey}T07:00:00.000Z`,
            completedAt: `${latestDateKey}T07:00:00.000Z`,
            exercises: [
              {
                templateExerciseId: exerciseId,
                name: 'Back Squat',
                sets: [
                  { reps: 5, load: 130, rir: 3 },
                  { reps: 5, load: 130, rir: 3 },
                  { reps: 5, load: 130, rir: 3 },
                ],
              },
            ],
          },
        ]),
      )

      window.localStorage.setItem('mt_progression_decisions', '[]')
      window.localStorage.setItem('mt_garmin_modifier_records', '[]')
      window.localStorage.setItem('mt_garmin_workout_summaries', '[]')

      const currentSettings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
      const nextSettings = {
        ...currentSettings,
        workoutActionOverrides: manualOverride
          ? [
              {
                date: todayDate,
                action: manualOverride,
                updatedAt: `${todayDate}T08:00:00.000Z`,
              },
            ]
          : [],
      }
      window.localStorage.setItem('mt_settings', JSON.stringify(nextSettings))
    },
    {
      todayDate: today,
      priorDateKey: priorKey,
      latestDateKey: latestKey,
      nowIso: now,
      manualOverride: options?.manualOverride ?? null,
    },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
}

export async function seedBodyProgressMissingPhoto(page: Page): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const priorDate = new Date(`${today}T00:00:00.000Z`)
  priorDate.setUTCDate(priorDate.getUTCDate() - 7)
  const priorKey = priorDate.toISOString().slice(0, 10)

  await setSettingsPatch(page, {
    bodyProgressFocusState: {
      comparePreset: '7d',
      lastSelectedPose: 'front',
    },
  })

  await page.evaluate(
    async ({ todayDate, compareDate }) => {
      await new Promise<void>((resolve, reject) => {
        const request = window.indexedDB.open('macrotracker-body-progress', 1)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('snapshots')) {
            const store = database.createObjectStore('snapshots', { keyPath: 'id' })
            store.createIndex('date', 'date', { unique: false })
            store.createIndex('updatedAt', 'updatedAt', { unique: false })
          }
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('snapshots', 'readwrite')
          const store = transaction.objectStore('snapshots')
          store.put({
            id: 'qa-compare-snapshot',
            date: compareDate,
            metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 81 }],
            photos: [],
            createdAt: `${compareDate}T08:00:00.000Z`,
            updatedAt: `${compareDate}T08:00:00.000Z`,
          })
          store.put({
            id: 'qa-latest-snapshot',
            date: todayDate,
            metrics: [{ key: 'waist', label: 'Waist', unit: 'cm', value: 79 }],
            photos: [
              {
                id: 'qa-front-photo',
                pose: 'front',
                fileName: 'front.png',
                contentType: 'image/png',
                dataUrl:
                  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=',
                createdAt: `${todayDate}T08:00:00.000Z`,
                updatedAt: `${todayDate}T08:00:00.000Z`,
              },
            ],
            createdAt: `${todayDate}T08:00:00.000Z`,
            updatedAt: `${todayDate}T08:00:00.000Z`,
          })
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
        }
      })
    },
    {
      todayDate: today,
      compareDate: priorKey,
    },
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
}

export async function installDeniedCameraShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nextMediaDevices = {
      ...(navigator.mediaDevices ?? {}),
      getUserMedia: async () => {
        const error = new Error('denied')
        error.name = 'NotAllowedError'
        throw error
      },
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: nextMediaDevices,
    })
  })
}

async function expectFocusContained(page: Page, container: Locator, steps = 5): Promise<void> {
  const firstFocusable = container
    .locator('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')
    .first()
  await expect(firstFocusable).toBeVisible()
  await firstFocusable.focus()

  for (let index = 0; index < steps; index += 1) {
    await expect
      .poll(async () =>
        container.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBeTruthy()
    await page.keyboard.press('Tab')
  }
}

export async function runQaScenario(
  page: Page,
  testInfo: TestInfo,
  scenarioId: QaScenarioId,
  body: (context: QaScenarioContext) => Promise<void>,
): Promise<void> {
  const scenario = getScenarioDefinition(scenarioId)
  const startedAt = new Date().toISOString()
  const evidencePaths: string[] = []
  const findings: Array<Record<string, unknown>> = []
  const validationErrors: string[] = []
  const expiredAllowlistEntries: Array<Record<string, unknown>> = []

  async function addEvidence(label: string, options?: { fullPage?: boolean }): Promise<string> {
    const safeLabel = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
    const screenshotPath = testInfo.outputPath(`${scenarioId}-${safeLabel}.png`)
    await page.screenshot({
      path: screenshotPath,
      fullPage: options?.fullPage ?? true,
    })
    evidencePaths.push(screenshotPath)
    return screenshotPath
  }

  async function runAccessibilityAudit(): Promise<void> {
    const allowlistEntries = loadJsonFile(QA_ACCESSIBILITY_ALLOWLIST_PATH, [])
    const builder = new AxeBuilder({ page })
    for (const scope of scenario.accessibilityScopes) {
      builder.include(scope)
    }

    const report = await builder.analyze()
    const evaluation = evaluateAccessibilityViolations({
      scenarioId,
      laneId: QA_LANE_ID,
      violations: report.violations,
      allowlistEntries,
    })

    findings.push(...evaluation.findings)
    validationErrors.push(...evaluation.validationErrors)
    expiredAllowlistEntries.push(...evaluation.expiredEntries)

    if (evaluation.validationErrors.length > 0 || evaluation.findings.length > 0) {
      throw new Error(
        `Accessibility gate failed for ${scenarioId}: ${[
          ...evaluation.validationErrors,
          ...evaluation.findings.map((finding) => `${finding.ruleId ?? finding.id}`),
        ].join(', ')}`,
      )
    }
  }

  function recordFindings(
    nextFindings: Array<Record<string, unknown>>,
    options?: { validationErrors?: string[]; expiredAllowlistEntries?: Array<Record<string, unknown>> },
  ): void {
    findings.push(...nextFindings)
    validationErrors.push(...(options?.validationErrors ?? []))
    expiredAllowlistEntries.push(...(options?.expiredAllowlistEntries ?? []))
  }

  let status: 'passed' | 'failed' | 'aborted' = 'passed'
  let thrownError: unknown = null

  try {
    await body({
      addEvidence,
      runAccessibilityAudit,
      recordFindings,
    })
  } catch (error) {
    status = 'failed'
    thrownError = error
    await addEvidence('failure')
  } finally {
    fs.mkdirSync(QA_RESULTS_DIR, { recursive: true })
    writeJsonFile(path.join(QA_RESULTS_DIR, `${scenarioId}.json`), {
      scenarioId,
      laneId: QA_LANE_ID,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      failureModes: scenario.failureModes,
      accessibilityScopes: scenario.accessibilityScopes,
      evidencePaths,
      findings,
      validationErrors,
      expiredAllowlistEntries,
    })
  }

  if (thrownError) {
    throw thrownError
  }
}

export async function assertAddFoodDialogAccessibility(page: Page): Promise<void> {
  const dialog = getAddFoodDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /close sheet/i })).toBeVisible()
  await expectFocusContained(page, dialog)
}

export async function assertReviewQueuePrimaryAction(page: Page): Promise<void> {
  await expect(page.getByText(/do this now/i).first()).toBeVisible()
  await expect(page.getByText(/clear pending review items/i).first()).toBeVisible()
  await expect(page.getByText(/review-required logging blocked/i).first()).toBeVisible()
}

export async function createBackupChickenAndExport(page: Page): Promise<string> {
  const now = new Date().toISOString()
  await page.evaluate(
    async ({ nowIso }) => {
      const foodId = 'qa-backup-chicken'
      const entryId = 'qa-backup-entry'
      const now = new Date()
      const todayDate = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`
      const storageKeys = {
        foods: 'mt_foods',
        settings: 'mt_settings',
        weights: 'mt_weights',
        mealTemplates: 'mt_meal_templates',
        wellness: 'mt_wellness',
        recoveryCheckIns: 'mt_recovery_check_ins',
        dietPhases: 'mt_diet_phases',
        dietPhaseEvents: 'mt_diet_phase_events',
      }

      function readJson<T>(key: string, fallback: T): T {
        try {
          const raw = window.localStorage.getItem(key)
          return raw ? (JSON.parse(raw) as T) : fallback
        } catch {
          return fallback
        }
      }

      async function writeIndexedDbSnapshot(snapshot: {
        foods: unknown[]
        settings: Record<string, unknown> | null
        weights: unknown[]
        mealTemplates: unknown[]
        wellness: unknown[]
        recoveryCheckIns: unknown[]
        dietPhases: unknown[]
        dietPhaseEvents: unknown[]
        logsByDate: Record<string, unknown[]>
      }): Promise<void> {
        await new Promise<void>((resolve, reject) => {
          const request = window.indexedDB.open('macrotracker-storage', 2)

          request.onupgradeneeded = () => {
            const database = request.result
            for (const storeName of [
              'meta',
              'foods',
              'settings',
              'weights',
              'mealTemplates',
              'wellness',
              'recoveryCheckIns',
              'dietPhases',
              'dietPhaseEvents',
              'logs',
              'diagnostics',
            ]) {
              if (!database.objectStoreNames.contains(storeName)) {
                database.createObjectStore(storeName)
              }
            }
          }

          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const database = request.result
            const transaction = database.transaction(
              [
                'foods',
                'settings',
                'weights',
                'mealTemplates',
                'wellness',
                'recoveryCheckIns',
                'dietPhases',
                'dietPhaseEvents',
                'logs',
              ],
              'readwrite',
            )

            transaction.objectStore('foods').put(snapshot.foods, 'default')
            if (snapshot.settings) {
              transaction.objectStore('settings').put(snapshot.settings, 'default')
            }
            transaction.objectStore('weights').put(snapshot.weights, 'default')
            transaction.objectStore('mealTemplates').put(snapshot.mealTemplates, 'default')
            transaction.objectStore('wellness').put(snapshot.wellness, 'default')
            transaction.objectStore('recoveryCheckIns').put(snapshot.recoveryCheckIns, 'default')
            transaction.objectStore('dietPhases').put(snapshot.dietPhases, 'default')
            transaction.objectStore('dietPhaseEvents').put(snapshot.dietPhaseEvents, 'default')

            const logStore = transaction.objectStore('logs')
            const clearLogsRequest = logStore.clear()
            clearLogsRequest.onerror = () => reject(clearLogsRequest.error)
            clearLogsRequest.onsuccess = () => {
              for (const [dateKey, entries] of Object.entries(snapshot.logsByDate)) {
                logStore.put(entries, dateKey)
              }
            }

            transaction.oncomplete = () => {
              database.close()
              resolve()
            }
            transaction.onerror = () => {
              database.close()
              reject(transaction.error)
            }
          }
        })
      }

      const nextFood = {
        id: foodId,
        name: 'Backup Chicken',
        servingSize: 1,
        servingUnit: 'serving',
        calories: 180,
        protein: 30,
        carbs: 0,
        fat: 4,
        source: 'custom',
        usageCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastUsedAt: nowIso,
        lastServings: 1,
        lastMealType: 'breakfast',
      }

      const foods = readJson<Array<Record<string, unknown>>>(storageKeys.foods, []).filter((food) => food.id !== foodId)
      const nextFoods = [...foods, nextFood]
      const nextEntry = {
        id: entryId,
        foodId,
        snapshot: {
          name: 'Backup Chicken',
          servingSize: 1,
          servingUnit: 'serving',
          calories: 180,
          protein: 30,
          carbs: 0,
          fat: 4,
          source: 'custom',
        },
        date: todayDate,
        meal: 'breakfast',
        servings: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      const existingEntries = readJson<Array<Record<string, unknown>>>(`mt_log_${todayDate}`, []).filter((entry) => entry.id !== entryId)
      const nextEntries = [...existingEntries, nextEntry]

      window.localStorage.setItem(storageKeys.foods, JSON.stringify(nextFoods))
      window.localStorage.setItem(`mt_log_${todayDate}`, JSON.stringify(nextEntries))

      await writeIndexedDbSnapshot({
        foods: nextFoods,
        settings: readJson<Record<string, unknown> | null>(storageKeys.settings, null),
        weights: readJson<unknown[]>(storageKeys.weights, []),
        mealTemplates: readJson<unknown[]>(storageKeys.mealTemplates, []),
        wellness: readJson<unknown[]>(storageKeys.wellness, []),
        recoveryCheckIns: readJson<unknown[]>(storageKeys.recoveryCheckIns, []),
        dietPhases: readJson<unknown[]>(storageKeys.dietPhases, []),
        dietPhaseEvents: readJson<unknown[]>(storageKeys.dietPhaseEvents, []),
        logsByDate: {
          [todayDate]: nextEntries,
        },
      })
    },
    {
      nowIso: now,
    },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })

  await goToLog(page)
  await ensureMealExpanded(page, 'breakfast')
  await expect(entryRow(page, 'Backup Chicken')).toBeVisible()

  await goToSettings(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    safeClick(page.getByRole('button', { name: /export backup/i })),
  ])

  const downloadPath = await download.path()
  if (!downloadPath) {
    throw new Error('Backup export did not produce a file path.')
  }
  return downloadPath
}

export async function clearClientStorageAndReload(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
  await deleteDatabases(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
}

export async function expectBackupRestored(page: Page): Promise<void> {
  await goToLog(page)
  await ensureMealExpanded(page, 'breakfast')
  await expect(entryRow(page, 'Backup Chicken')).toBeVisible()
}
