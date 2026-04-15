import { expect, test } from '@playwright/test'
import { goToSettings, goToWeight, resetApp } from '../helpers/app'
import { seedPsmfGarminFeatureState } from '../helpers/seed'

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function offsetDateKey(offsetDays: number): string {
  const date = new Date(`${todayDateKey()}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function buildActivePsmfPhase() {
  return {
    id: 'phase-active-psmf',
    type: 'psmf',
    status: 'active',
    startDate: offsetDateKey(-3),
    plannedEndDate: offsetDateKey(7),
    createdAt: `${offsetDateKey(-3)}T07:00:00.000Z`,
    updatedAt: `${offsetDateKey(-3)}T07:00:00.000Z`,
  }
}

function currentCheckInWeekEndDate(): string {
  const weekEnd = new Date(`${todayDateKey()}T00:00:00.000Z`)
  weekEnd.setUTCDate(weekEnd.getUTCDate() - 1)
  while (weekEnd.getUTCDay() !== 1) {
    weekEnd.setUTCDate(weekEnd.getUTCDate() - 1)
  }
  return weekEnd.toISOString().slice(0, 10)
}

function buildBaselineWellnessEntries() {
  const weekEndDate = currentCheckInWeekEndDate()
  return [
    ...Array.from({ length: 18 }, (_, index) => {
      const date = (() => {
        const cursor = new Date(`${weekEndDate}T00:00:00.000Z`)
        cursor.setUTCDate(cursor.getUTCDate() - (index + 4))
        return cursor.toISOString().slice(0, 10)
      })()
      return {
        date,
        provider: 'garmin',
        steps: 8500,
        sleepMinutes: 450,
        restingHeartRate: 56,
        stressScore: 28,
        bodyBatteryMax: 78,
        intensityMinutes: 30,
        derivedCardioMinutes: 20,
        sourceUpdatedAt: `${date}T06:00:00.000Z`,
        updatedAt: `${date}T06:00:00.000Z`,
      }
    }),
    ...[0, -1, -2].map((offset) => {
      const date = (() => {
        const cursor = new Date(`${weekEndDate}T00:00:00.000Z`)
        cursor.setUTCDate(cursor.getUTCDate() + offset)
        return cursor.toISOString().slice(0, 10)
      })()
      return {
        date,
        provider: 'garmin',
        steps: 3500,
        sleepMinutes: 300,
        restingHeartRate: 67,
        stressScore: 74,
        bodyBatteryMax: 20,
        intensityMinutes: 8,
        derivedCardioMinutes: 0,
        sourceUpdatedAt: `${date}T06:00:00.000Z`,
        updatedAt: `${date}T06:00:00.000Z`,
      }
    }),
  ]
}

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('manual red recovery on two of the last three days forces a coaching hold', async ({ page }) => {
  const weekEndDate = currentCheckInWeekEndDate()
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
    recoveryCheckIns: [0, -1, -2].map((offset) => {
      const date = (() => {
        const cursor = new Date(`${weekEndDate}T00:00:00.000Z`)
        cursor.setUTCDate(cursor.getUTCDate() + offset)
        return cursor.toISOString().slice(0, 10)
      })()
      return {
        date,
        energyScore: 5,
        hungerScore: 3,
        sorenessScore: 5,
        sleepQualityScore: 2,
        updatedAt: `${date}T08:00:00.000Z`,
      }
    }),
    wellness: buildBaselineWellnessEntries(),
  })
  await goToWeight(page)

  await expect(page.getByText('Hold for more data').first()).toBeVisible()
  await expect(
    page.getByText('Recovery strain has stayed high on most recent days. Hold targets until recovery improves.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /apply suggestion/i })).toHaveCount(0)
  await expect(page.getByTestId('weight-preview-supplemental')).toContainText('Recovery hold')

  await goToSettings(page)
  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: red')
})

test('same-day refeeds lock date and calories after logging begins for that day', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
    phaseEvents: [
      {
        id: 'refeed-today',
        phaseId: 'phase-active-psmf',
        type: 'refeed_day',
        date: todayDateKey(),
        calorieTargetOverride: 2600,
        notes: 'Original same-day refeed',
        createdAt: `${todayDateKey()}T07:00:00.000Z`,
        updatedAt: `${todayDateKey()}T07:00:00.000Z`,
      },
    ],
    todayFoodLog: true,
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await expect(section).toContainText('Planned refeed on')
  await expect(section.getByRole('button', { name: /^Delete refeed$/i })).toHaveCount(0)

  await section.getByRole('button', { name: /^Edit refeed$/i }).click()
  const dialog = page.getByRole('dialog', { name: /^Edit refeed notes$/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: /^Notes$/i }).fill('Notes updated after logging')
  await dialog.getByRole('button', { name: /^Save notes$/i }).click()

  const events = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_diet_phase_events') ?? '[]'))
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    date: todayDateKey(),
    calorieTargetOverride: 2600,
    notes: 'Notes updated after logging',
  })
})

test('weight card renders every refeed inside the current decision window in ascending order', async ({ page }) => {
  const weekEndDate = currentCheckInWeekEndDate()
  const dateWithinWindow = (offsetFromWeekEnd: number) => {
    const cursor = new Date(`${weekEndDate}T00:00:00.000Z`)
    cursor.setUTCDate(cursor.getUTCDate() + offsetFromWeekEnd)
    return cursor.toISOString().slice(0, 10)
  }
  const refeedOne = dateWithinWindow(-5)
  const refeedTwo = dateWithinWindow(-1)

  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
    phaseEvents: [
      {
        id: 'refeed-window-one',
        phaseId: 'phase-active-psmf',
        type: 'refeed_day',
        date: refeedOne,
        calorieTargetOverride: 2550,
        createdAt: `${refeedOne}T07:00:00.000Z`,
        updatedAt: `${refeedOne}T07:00:00.000Z`,
      },
      {
        id: 'refeed-window-two',
        phaseId: 'phase-active-psmf',
        type: 'refeed_day',
        date: refeedTwo,
        calorieTargetOverride: 2650,
        createdAt: `${refeedTwo}T07:00:00.000Z`,
        updatedAt: `${refeedTwo}T07:00:00.000Z`,
      },
    ],
    recoveryCheckIns: [
      {
        date: weekEndDate,
        energyScore: 3,
        hungerScore: 3,
        sorenessScore: 2,
        sleepQualityScore: 3,
        updatedAt: `${weekEndDate}T07:00:00.000Z`,
      },
    ],
    wellness: buildBaselineWellnessEntries(),
  })
  await goToWeight(page)

  const supplemental = page.getByTestId('weight-preview-supplemental')
  const text = ((await supplemental.textContent()) ?? '').replace(/\s+/g, ' ')
  const expectedRefeedOne = new Date(`${refeedOne}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const expectedRefeedTwo = new Date(`${refeedTwo}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  expect(text).toContain(`Planned refeed on ${expectedRefeedOne}`)
  expect(text).toContain(`Planned refeed on ${expectedRefeedTwo}`)
})
