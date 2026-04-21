import type { Page } from '@playwright/test'
import { goToLog } from './app'

type CoachWave1Scenario =
  | 'standard_cut_actionable'
  | 'standard_cut_personal_floor_clamp'
  | 'psmf_no_further_decrease'
  | 'fat_loss_mode_stabilization_hold'
  | 'goal_mode_stabilization_hold'

type PsmfGarminPreviewUiState = {
  dietPhase?: {
    kind: 'no_active_phase' | 'active_psmf' | 'expired_psmf' | 'diet_break_active'
    activeUntilLabel?: string
    expiredOnLabel?: string
  }
  recovery?: {
    severity: 'green' | 'yellow' | 'red'
  }
  garmin?: {
    kind:
      | 'not_enabled'
      | 'not_connected'
      | 'connected'
      | 'syncing'
      | 'rate_limited'
      | 'reconnect_required'
      | 'error'
    lastSyncedLabel?: string
    rateLimitedUntilLabel?: string
    stale?: boolean
  }
  weight?: {
    supplementalLines?: string[]
    blockedReasonLabels?: string[]
  }
}

type PersonalLibraryScenario =
  | 'repeat_this_meal'
  | 'remote_import_reuse'
  | 'archived_remote_match'

type PsmfGarminFeatureSeedOptions = {
  goalMode?: 'lose' | 'maintain' | 'gain'
  fatLossMode?: 'standard_cut' | 'psmf'
  phases?: Array<Record<string, unknown>>
  phaseEvents?: Array<Record<string, unknown>>
  recoveryCheckIns?: Array<Record<string, unknown>>
  wellness?: Array<Record<string, unknown>>
  previewUi?: PsmfGarminPreviewUiState | null
  todayFoodLog?: boolean
}

async function restoreLogLanding(page: Page): Promise<void> {
  await goToLog(page)
}

async function clearSeededPersistentStores(page: Page): Promise<void> {
  await syncSeededPersistentStoresFromLocalStorage(page)
}

async function syncSeededPersistentStoresFromLocalStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const dbName = 'macrotracker-storage'
    const dbVersion = 2
    const coreDomains = ['foods', 'settings', 'weights', 'mealTemplates', 'logsByDate']
    const storeNames = [
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
    ] as const

    const parseJson = <T,>(key: string): T | undefined => {
      const raw = window.localStorage.getItem(key)
      if (raw === null) {
        return undefined
      }

      try {
        return JSON.parse(raw) as T
      } catch {
        return undefined
      }
    }

    const openDatabase = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion)

        request.onupgradeneeded = () => {
          const database = request.result
          for (const storeName of storeNames) {
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName)
            }
          }
        }

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })

    const requestToPromise = <T,>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
      })

    const db = await openDatabase()
    try {
      const transaction = db.transaction([...storeNames], 'readwrite')
      const readExisting = async <T,>(storeName: (typeof storeNames)[number]) => {
        return requestToPromise<T | undefined>(transaction.objectStore(storeName).get('default'))
      }

      const foods = parseJson<unknown[]>('mt_foods') ?? (await readExisting<unknown[]>('foods')) ?? []
      const settings = parseJson<Record<string, unknown>>('mt_settings') ?? (await readExisting<Record<string, unknown>>('settings'))
      const weights = parseJson<unknown[]>('mt_weights') ?? (await readExisting<unknown[]>('weights')) ?? []
      const mealTemplates =
        parseJson<unknown[]>('mt_meal_templates') ?? (await readExisting<unknown[]>('mealTemplates')) ?? []
      const wellness = parseJson<unknown[]>('mt_wellness') ?? (await readExisting<unknown[]>('wellness')) ?? []
      const recoveryCheckIns =
        parseJson<unknown[]>('mt_recovery_check_ins') ?? (await readExisting<unknown[]>('recoveryCheckIns')) ?? []
      const dietPhases = parseJson<unknown[]>('mt_diet_phases') ?? (await readExisting<unknown[]>('dietPhases')) ?? []
      const dietPhaseEvents =
        parseJson<unknown[]>('mt_diet_phase_events') ?? (await readExisting<unknown[]>('dietPhaseEvents')) ?? []

      if (settings) {
        transaction.objectStore('foods').put(foods, 'default')
        transaction.objectStore('settings').put(settings, 'default')
        transaction.objectStore('weights').put(weights, 'default')
        transaction.objectStore('mealTemplates').put(mealTemplates, 'default')
        transaction.objectStore('wellness').put(wellness, 'default')
        transaction.objectStore('recoveryCheckIns').put(recoveryCheckIns, 'default')
        transaction.objectStore('dietPhases').put(dietPhases, 'default')
        transaction.objectStore('dietPhaseEvents').put(dietPhaseEvents, 'default')
      }

      const logsStore = transaction.objectStore('logs')
      await requestToPromise(logsStore.clear())
      for (const [key, rawValue] of Object.entries(window.localStorage)) {
        if (!key.startsWith('mt_log_')) {
          continue
        }

        const date = key.replace('mt_log_', '')
        try {
          logsStore.put(JSON.parse(rawValue), date)
        } catch {
          logsStore.put([], date)
        }
      }

      transaction.objectStore('meta').put(
        {
          migratedDomains: coreDomains,
          completedAt: new Date().toISOString(),
        },
        'migrationState',
      )

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally {
      db.close()
    }
  })
}

async function seedCoachingWindow(
  page: Page,
  options: {
    loggedDays: number
    weighInDays: number
    recentImport?: boolean
    markCompleteDays?: boolean
    fastingDays?: number
  },
) {
  await page.evaluate(({ loggedDays, weighInDays, recentImport, markCompleteDays, fastingDays }) => {
    const today = new Date()
    const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')

    settings.goalMode = 'lose'
    settings.coachingEnabled = true
    settings.coachingDismissedAt = undefined
    settings.lastImportAt = recentImport ? new Date().toISOString() : undefined
    window.localStorage.setItem('mt_settings', JSON.stringify(settings))
    window.localStorage.removeItem('mt_day_meta')

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mt_log_')) {
        window.localStorage.removeItem(key)
      }
    }

    const logEntry = (dateKey: string, index: number) => ({
      id: `seed-log-${dateKey}`,
      date: dateKey,
      meal: 'breakfast',
      servings: 1,
      createdAt: new Date(today.getTime() - index * 60000).toISOString(),
      snapshot: {
        name: 'Coaching meal',
        servingSize: 1,
        servingUnit: 'entry',
        calories: 2000,
        protein: 160,
        carbs: 190,
        fat: 70,
        source: 'custom',
      },
    })

    for (let index = 0; index < 21; index += 1) {
      const date = new Date(today)
      date.setDate(today.getDate() - index)
      const dateKey = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`

      if (index < loggedDays) {
        window.localStorage.setItem(`mt_log_${dateKey}`, JSON.stringify([logEntry(dateKey, index)]))
      } else {
        window.localStorage.removeItem(`mt_log_${dateKey}`)
      }
    }

    const dayMeta = []
    for (let index = 0; index < (markCompleteDays ? loggedDays : 0); index += 1) {
      const date = new Date(today)
      date.setDate(today.getDate() - index)
      const dateKey = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
      dayMeta.push({
        date: dateKey,
        status: index < (fastingDays ?? 0) ? 'fasting' : 'complete',
        updatedAt: new Date(today.getTime() - index * 15000).toISOString(),
      })

      if (index < (fastingDays ?? 0)) {
        window.localStorage.removeItem(`mt_log_${dateKey}`)
      }
    }

    if (dayMeta.length) {
      window.localStorage.setItem('mt_day_meta', JSON.stringify(dayMeta))
    }

    const weights = Array.from({ length: weighInDays }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - index)
      return {
        id: `seed-weight-${index}`,
        date: `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`,
        weight: 200 - index * 0.15,
        unit: 'lb',
        createdAt: new Date(today.getTime() - index * 30000).toISOString(),
      }
    })

    window.localStorage.setItem('mt_weights', JSON.stringify(weights))
  }, options)

  await clearSeededPersistentStores(page)
  await page.reload()
  await restoreLogLanding(page)
}

async function seedWeeklyCheckInWindow(page: Page) {
  await page.evaluate(() => {
    const today = new Date()
    const cursor = new Date(today)
    cursor.setDate(cursor.getDate() - 1)
    while (cursor.getDay() !== 1) {
      cursor.setDate(cursor.getDate() - 1)
    }

    const formatDateKey = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`

    const weekStart = new Date(cursor)
    weekStart.setDate(weekStart.getDate() - 6)
    const priorWeekEnd = new Date(weekStart)
    priorWeekEnd.setDate(priorWeekEnd.getDate() - 1)
    const priorWeekStart = new Date(priorWeekEnd)
    priorWeekStart.setDate(priorWeekStart.getDate() - 6)
    const extraWindowEnd = new Date(priorWeekStart)
    extraWindowEnd.setDate(extraWindowEnd.getDate() - 1)
    const extraWindowStart = new Date(extraWindowEnd)
    extraWindowStart.setDate(extraWindowEnd.getDate() - 2)

    const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    settings.goalMode = 'lose'
    settings.coachingEnabled = true
    settings.checkInWeekday = 1
    settings.targetWeeklyRatePercent = -0.5
    settings.dailyStepTarget = 8000
    settings.weeklyCardioMinuteTarget = 120
    window.localStorage.setItem('mt_settings', JSON.stringify(settings))

    const buildDates = (start: Date) =>
      Array.from({ length: 7 }, (_, index) => {
        const nextDate = new Date(start)
        nextDate.setDate(start.getDate() + index)
        return formatDateKey(nextDate)
      })

    const currentDates = buildDates(weekStart)
    const priorDates = buildDates(priorWeekStart)
    const extraDates = buildDates(extraWindowStart).slice(0, 3)

    const makeLogEntry = (dateKey: string, index: number) => ({
      id: `prep-log-${dateKey}`,
      date: dateKey,
      meal: 'breakfast',
      servings: 1,
      createdAt: new Date(today.getTime() - index * 60000).toISOString(),
      snapshot: {
        name: 'Prep meal',
        servingSize: 1,
        servingUnit: 'entry',
        calories: 2000,
        protein: 180,
        carbs: 210,
        fat: 55,
        source: 'custom',
      },
    })

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mt_log_')) {
        window.localStorage.removeItem(key)
      }
    }

    currentDates.forEach((dateKey, index) => {
      window.localStorage.setItem(`mt_log_${dateKey}`, JSON.stringify([makeLogEntry(dateKey, index)]))
    })
    priorDates.forEach((dateKey, index) => {
      window.localStorage.setItem(`mt_log_${dateKey}`, JSON.stringify([makeLogEntry(dateKey, index + 7)]))
    })
    extraDates.forEach((dateKey, index) => {
      window.localStorage.setItem(`mt_log_${dateKey}`, JSON.stringify([makeLogEntry(dateKey, index + 14)]))
    })

    const dayMeta = [...currentDates, ...priorDates, ...extraDates].map((dateKey, index) => ({
      date: dateKey,
      status: 'complete',
      updatedAt: new Date(today.getTime() - index * 15000).toISOString(),
    }))
    window.localStorage.setItem('mt_day_meta', JSON.stringify(dayMeta))

    const activityLog = [...currentDates, ...priorDates, ...extraDates].map((dateKey, index) => ({
      date: dateKey,
      steps: 9000,
      cardioMinutes: 20,
      cardioType: 'walk',
      notes: index === 0 ? 'Prep walk' : undefined,
      updatedAt: new Date(today.getTime() - index * 10000).toISOString(),
    }))
    window.localStorage.setItem('mt_activity_log', JSON.stringify(activityLog))

    const weights = [
      { date: priorDates[0], weight: 200.6 },
      { date: priorDates[2], weight: 200.4 },
      { date: priorDates[4], weight: 200.3 },
      { date: priorDates[6], weight: 200.3 },
      { date: currentDates[0], weight: 199.95 },
      { date: currentDates[2], weight: 199.95 },
      { date: currentDates[4], weight: 199.9 },
      { date: currentDates[6], weight: 199.9 },
      { date: extraDates[0], weight: 200.7 },
      { date: extraDates[2], weight: 200.65 },
    ].map((entry, index) => ({
      id: `prep-weight-${index}`,
      date: entry.date,
      weight: entry.weight,
      unit: 'lb',
      createdAt: new Date(today.getTime() - index * 30000).toISOString(),
    }))
    window.localStorage.setItem('mt_weights', JSON.stringify(weights))
  })

  await clearSeededPersistentStores(page)
  await page.reload()
  await restoreLogLanding(page)
}

async function seedCoachWave1Scenario(page: Page, scenario: CoachWave1Scenario) {
  await page.evaluate((selectedScenario: CoachWave1Scenario) => {
    const formatDateKey = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`

    const offsetDateKey = (dateKey: string, offsetDays: number) => {
      const date = new Date(`${dateKey}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + offsetDays)
      return formatDateKey(date)
    }

    const today = new Date()
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() - 1)
    while (weekEnd.getDay() !== 1) {
      weekEnd.setDate(weekEnd.getDate() - 1)
    }

    const windowDates = Array.from({ length: 21 }, (_, index) => {
      const nextDate = new Date(weekEnd)
      nextDate.setDate(weekEnd.getDate() - (20 - index))
      return formatDateKey(nextDate)
    })

    const clearStorage = () => {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith('mt_log_')) {
          window.localStorage.removeItem(key)
        }
      }
      window.localStorage.removeItem('mt_day_meta')
      window.localStorage.removeItem('mt_activity_log')
      window.localStorage.removeItem('mt_weights')
      window.localStorage.removeItem('mt_checkin_history')
      window.localStorage.removeItem('mt_coach_decisions')
      window.localStorage.removeItem('mt_preview_psmf_garmin_ui')
    }

    const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    clearStorage()

    const baseSettings = {
      ...settings,
      weightUnit: 'lb',
      goalMode: 'lose',
      fatLossMode: 'standard_cut',
      coachingEnabled: true,
      checkInWeekday: 1,
      targetWeeklyRatePercent: -0.75,
      calorieTarget: 2400,
      proteinTarget: 180,
      carbTarget: 270,
      fatTarget: 60,
      dailyStepTarget: 8000,
      weeklyCardioMinuteTarget: 120,
      coachingMinCalories: undefined,
      coachingDismissedAt: undefined,
      lastImportAt: undefined,
      goalModeChangedAt: undefined,
      goalModeChangedFrom: undefined,
      fatLossModeChangedAt: undefined,
      askCoachEnabled: true,
      shareInterventionsWithCoach: true,
      coachCitationsExpanded: true,
    }

    const scenarioSettings = (() => {
      switch (selectedScenario) {
        case 'standard_cut_actionable':
          return baseSettings
        case 'standard_cut_personal_floor_clamp':
          return {
            ...baseSettings,
            calorieTarget: 1300,
            carbTarget: 80,
            fatTarget: 40,
            targetWeeklyRatePercent: -0.8,
            coachingMinCalories: 1250,
          }
        case 'psmf_no_further_decrease':
          return {
            ...baseSettings,
            calorieTarget: 1800,
            carbTarget: 110,
            fatTarget: 50,
            fatLossMode: 'psmf',
            targetWeeklyRatePercent: -0.5,
          }
        case 'fat_loss_mode_stabilization_hold':
          return {
            ...baseSettings,
            fatLossMode: 'psmf',
            fatLossModeChangedAt: `${windowDates[19]}T08:00:00.000Z`,
          }
        case 'goal_mode_stabilization_hold':
          return {
            ...baseSettings,
            goalMode: 'maintain',
            calorieTarget: 2200,
            carbTarget: 220,
            targetWeeklyRatePercent: 0,
            goalModeChangedAt: `${windowDates[20]}T08:00:00.000Z`,
            goalModeChangedFrom: 'lose',
          }
      }
    })()

    const previewState: PsmfGarminPreviewUiState = (() => {
      switch (selectedScenario) {
        case 'standard_cut_actionable':
          return {
            dietPhase: { kind: 'no_active_phase' },
            recovery: { severity: 'green' },
            garmin: { kind: 'not_connected' },
          }
        case 'psmf_no_further_decrease':
          return {
            dietPhase: { kind: 'active_psmf', activeUntilLabel: windowDates[20] },
            recovery: { severity: 'green' },
            garmin: { kind: 'connected', lastSyncedLabel: `${windowDates[20]} 08:15 UTC` },
          }
        case 'fat_loss_mode_stabilization_hold':
          return {
            dietPhase: { kind: 'expired_psmf', expiredOnLabel: windowDates[19] },
            recovery: { severity: 'yellow' },
            garmin: { kind: 'rate_limited', rateLimitedUntilLabel: `${windowDates[20]} 12:00 UTC` },
          }
        case 'goal_mode_stabilization_hold':
          return {
            dietPhase: { kind: 'diet_break_active', activeUntilLabel: windowDates[20] },
            recovery: { severity: 'red' },
            garmin: { kind: 'reconnect_required' },
            weight: {
              supplementalLines: [
                `PSMF active until ${windowDates[20]}`,
                `Diet break active until ${windowDates[20]}`,
                `Planned refeed on ${windowDates[19]}`,
                'Recovery strain is elevated this week.',
              ],
              blockedReasonLabels: ['PSMF phase required', 'PSMF phase expired', 'Diet break active', 'Recovery hold'],
            },
          }
      }
    })()

    const phaseSeed = (() => {
      switch (selectedScenario) {
        case 'psmf_no_further_decrease':
          {
            const phaseEndDate = offsetDateKey(windowDates[20], 7)
            return [
              {
                id: 'seed-psmf-phase',
                type: 'psmf',
                status: 'active',
                startDate: windowDates[7],
                plannedEndDate: phaseEndDate,
                createdAt: `${windowDates[7]}T07:00:00.000Z`,
                updatedAt: `${windowDates[7]}T07:00:00.000Z`,
              },
            ]
          }
        case 'fat_loss_mode_stabilization_hold':
          return [
            {
              id: 'seed-expired-psmf-phase',
              type: 'psmf',
              status: 'expired',
              startDate: windowDates[6],
              plannedEndDate: windowDates[19],
              actualEndDate: windowDates[19],
              createdAt: `${windowDates[6]}T07:00:00.000Z`,
              updatedAt: `${windowDates[19]}T07:00:00.000Z`,
            },
          ]
        case 'goal_mode_stabilization_hold':
          {
            const phaseEndDate = offsetDateKey(windowDates[20], 7)
            return [
              {
                id: 'seed-diet-break-phase',
                type: 'diet_break',
                status: 'active',
                startDate: windowDates[18],
                plannedEndDate: phaseEndDate,
                calorieTargetOverride: 2200,
                createdAt: `${windowDates[18]}T07:00:00.000Z`,
                updatedAt: `${windowDates[18]}T07:00:00.000Z`,
              },
            ]
          }
        default:
          return []
      }
    })()

    const phaseEventSeed: Array<Record<string, unknown>> = []

    const weightForScenario = () => {
      switch (selectedScenario) {
        case 'standard_cut_actionable':
        case 'standard_cut_personal_floor_clamp':
        case 'psmf_no_further_decrease':
        case 'fat_loss_mode_stabilization_hold':
        case 'goal_mode_stabilization_hold':
          return 200
      }
    }

    const buildLogEntry = (dateKey: string, index: number) => ({
      id: `${selectedScenario}-log-${dateKey}`,
      date: dateKey,
      meal: 'breakfast',
      servings: 1,
      createdAt: new Date(today.getTime() - index * 60000).toISOString(),
      updatedAt: new Date(today.getTime() - index * 60000).toISOString(),
      snapshot: {
        name: 'Coach seed meal',
        servingSize: 1,
        servingUnit: 'entry',
        calories: scenarioSettings.calorieTarget,
        protein: scenarioSettings.proteinTarget,
        carbs: scenarioSettings.carbTarget,
        fat: scenarioSettings.fatTarget,
        source: 'custom',
      },
    })

    const dayMeta = windowDates.map((dateKey, index) => ({
      date: dateKey,
      status: 'complete',
      updatedAt: new Date(today.getTime() - index * 15000).toISOString(),
    }))
    const activityLog = windowDates.map((dateKey, index) => ({
      date: dateKey,
      steps: 9000,
      cardioMinutes: 20,
      cardioType: 'walk',
      updatedAt: new Date(today.getTime() - index * 10000).toISOString(),
    }))
    const weights = windowDates.map((dateKey) => ({
      id: `${selectedScenario}-weight-${dateKey}`,
      date: dateKey,
      weight: weightForScenario(),
      unit: 'lb',
      createdAt: `${dateKey}T07:00:00.000Z`,
    }))

    for (const [index, dateKey] of windowDates.entries()) {
      window.localStorage.setItem(`mt_log_${dateKey}`, JSON.stringify([buildLogEntry(dateKey, index)]))
    }

    window.localStorage.setItem('mt_settings', JSON.stringify(scenarioSettings))
    window.localStorage.setItem('mt_day_meta', JSON.stringify(dayMeta))
    window.localStorage.setItem('mt_activity_log', JSON.stringify(activityLog))
    window.localStorage.setItem('mt_weights', JSON.stringify(weights))
    window.localStorage.setItem('mt_diet_phases', JSON.stringify(phaseSeed))
    window.localStorage.setItem('mt_diet_phase_events', JSON.stringify(phaseEventSeed))
    window.localStorage.setItem('mt_preview_psmf_garmin_ui', JSON.stringify(previewState))
  }, scenario)

  await clearSeededPersistentStores(page)
  await page.reload()
  await restoreLogLanding(page)
}

async function seedPersonalLibraryScenario(page: Page, scenario: PersonalLibraryScenario) {
  await page.evaluate((selectedScenario: PersonalLibraryScenario) => {
    const today = new Date()
    const formatDateKey = (date: Date) =>
      `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`

    const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
    window.localStorage.setItem(
      'mt_settings',
      JSON.stringify({
        ...settings,
        goalMode: 'lose',
      }),
    )

    const baseFood = {
      id: 'food-greek-yogurt',
      name: 'Greek Yogurt',
      brand: 'Test Dairy',
      servingSize: 170,
      servingUnit: 'g',
      calories: 120,
      protein: 16,
      carbs: 6,
      fat: 0,
      source: 'api',
      provider: 'usda_fdc',
      usageCount: 8,
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-12T09:00:00.000Z',
      lastUsedAt: '2026-04-12T09:00:00.000Z',
      lastServings: 1.5,
      searchAliases: ['greek yogurt', 'test dairy greek yogurt'],
      remoteReferences: [
        {
          provider: 'usda_fdc',
          remoteKey: '12345',
          barcode: '000111222333',
        },
      ],
    }

    const foods =
      selectedScenario === 'archived_remote_match'
        ? [
            {
              ...baseFood,
              archivedAt: '2026-04-12T10:00:00.000Z',
            },
          ]
        : selectedScenario === 'repeat_this_meal'
          ? [baseFood]
          : []

    window.localStorage.setItem('mt_foods', JSON.stringify(foods))

    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mt_log_')) {
        window.localStorage.removeItem(key)
      }
    }

    if (selectedScenario === 'repeat_this_meal') {
      for (let index = 1; index <= 3; index += 1) {
        const date = new Date(today)
        date.setDate(today.getDate() - index)
        const dateKey = formatDateKey(date)
        window.localStorage.setItem(
          `mt_log_${dateKey}`,
          JSON.stringify([
            {
              id: `repeat-log-${dateKey}`,
              foodId: baseFood.id,
              date: dateKey,
              meal: 'breakfast',
              servings: 1.5,
              createdAt: `${dateKey}T08:00:00.000Z`,
              snapshot: {
                name: baseFood.name,
                brand: baseFood.brand,
                servingSize: baseFood.servingSize,
                servingUnit: baseFood.servingUnit,
                calories: baseFood.calories,
                protein: baseFood.protein,
                carbs: baseFood.carbs,
                fat: baseFood.fat,
                source: 'api',
              },
            },
          ]),
        )
      }
    }
  }, scenario)

  await clearSeededPersistentStores(page)
  await page.reload()
  await restoreLogLanding(page)
}

async function seedPsmfGarminFeatureState(
  page: Page,
  {
    goalMode = 'lose',
    fatLossMode = 'standard_cut',
    phases = [],
    phaseEvents = [],
    recoveryCheckIns = [],
    wellness = [],
    previewUi = null,
    todayFoodLog = false,
  }: PsmfGarminFeatureSeedOptions = {},
) {
  await seedCoachWave1Scenario(page, 'standard_cut_actionable')

  await page.evaluate(
    ({
      goalMode,
      fatLossMode,
      phases,
      phaseEvents,
      recoveryCheckIns,
      wellness,
      previewUi,
      todayFoodLog,
    }: PsmfGarminFeatureSeedOptions) => {
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, '0')}-${`${today.getDate()}`.padStart(2, '0')}`
      const settings = JSON.parse(window.localStorage.getItem('mt_settings') ?? '{}')
      const nextSettings = {
        ...settings,
        goalMode,
        fatLossMode,
        coachingEnabled: true,
      }

      window.localStorage.setItem('mt_settings', JSON.stringify(nextSettings))
      window.localStorage.setItem('mt_diet_phases', JSON.stringify(phases))
      window.localStorage.setItem('mt_diet_phase_events', JSON.stringify(phaseEvents))
      window.localStorage.setItem('mt_recovery_check_ins', JSON.stringify(recoveryCheckIns))
      window.localStorage.setItem('mt_wellness', JSON.stringify(wellness))

      if (todayFoodLog) {
        window.localStorage.setItem(
          `mt_log_${todayKey}`,
          JSON.stringify([
            {
              id: `today-log-${todayKey}`,
              date: todayKey,
              meal: 'breakfast',
              servings: 1,
              createdAt: `${todayKey}T08:00:00.000Z`,
              updatedAt: `${todayKey}T08:00:00.000Z`,
              snapshot: {
                name: 'Preview meal',
                servingSize: 1,
                servingUnit: 'entry',
                calories: nextSettings.calorieTarget ?? 2000,
                protein: nextSettings.proteinTarget ?? 180,
                carbs: nextSettings.carbTarget ?? 220,
                fat: nextSettings.fatTarget ?? 60,
                source: 'custom',
              },
            },
          ]),
        )
      }

      if (previewUi) {
        window.localStorage.setItem('mt_preview_psmf_garmin_ui', JSON.stringify(previewUi))
      } else {
        window.localStorage.removeItem('mt_preview_psmf_garmin_ui')
      }
    },
    {
      goalMode,
      fatLossMode,
      phases,
      phaseEvents,
      recoveryCheckIns,
      wellness,
      previewUi,
      todayFoodLog,
    },
  )

  await clearSeededPersistentStores(page)
  await page.reload()
  await restoreLogLanding(page)
}

export {
  seedCoachWave1Scenario,
  seedCoachingWindow,
  seedPersonalLibraryScenario,
  seedPsmfGarminFeatureState,
  seedWeeklyCheckInWindow,
  syncSeededPersistentStoresFromLocalStorage,
}
