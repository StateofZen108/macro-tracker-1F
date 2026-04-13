import type { Page } from '@playwright/test'

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

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = window.indexedDB.deleteDatabase('macrotracker-storage')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()
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

  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = window.indexedDB.deleteDatabase('macrotracker-storage')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()
}

export { seedCoachingWindow, seedWeeklyCheckInWindow }
