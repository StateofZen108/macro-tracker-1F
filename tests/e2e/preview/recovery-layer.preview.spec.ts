import { expect, type Locator, test } from '@playwright/test'
import { goToSettings, resetApp } from '../helpers/app'
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

async function selectRecoveryScore(
  section: Locator,
  index: number,
  value: string,
) {
  await section.getByRole('combobox').nth(index).selectOption(value)
}

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('saves and deletes a manual recovery check-in for today', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
  })
  await goToSettings(page)

  const section = page.getByTestId('recovery-section')
  await expect(section).toContainText('No recovery check-in for today yet.')

  await selectRecoveryScore(section, 0, '5')
  await selectRecoveryScore(section, 1, '2')
  await selectRecoveryScore(section, 2, '5')
  await selectRecoveryScore(section, 3, '1')
  await section.getByLabel(/^Recovery notes$/i).fill('Rough day')
  await section.getByRole('button', { name: /^Save recovery$/i }).click()

  await expect(section).toContainText('Saved for today.')

  const recordsAfterSave = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('mt_recovery_check_ins') ?? '[]'),
  )
  expect(recordsAfterSave).toHaveLength(1)
  expect(recordsAfterSave[0]).toMatchObject({
    date: todayDateKey(),
    energyScore: 5,
    hungerScore: 2,
    sorenessScore: 5,
    sleepQualityScore: 1,
    notes: 'Rough day',
  })

  await section.getByRole('button', { name: /^Delete today's check-in$/i }).click()
  await expect(section).toContainText('No recovery check-in for today yet.')

  const recordsAfterDelete = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('mt_recovery_check_ins') ?? '[]'),
  )
  expect(recordsAfterDelete).toHaveLength(0)
})

test('renders a red recovery severity state when preview and stored recovery data agree', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
    recoveryCheckIns: [
      {
        date: todayDateKey(),
        energyScore: 5,
        hungerScore: 3,
        sorenessScore: 5,
        sleepQualityScore: 2,
        notes: 'Today is rough',
        updatedAt: `${todayDateKey()}T08:00:00.000Z`,
      },
    ],
    wellness: [
      {
        date: todayDateKey(),
        provider: 'garmin',
        steps: 4000,
        sleepMinutes: 300,
        restingHeartRate: 66,
        stressScore: 72,
        bodyBatteryMax: 22,
        intensityMinutes: 10,
        derivedCardioMinutes: 0,
        sourceUpdatedAt: `${todayDateKey()}T06:00:00.000Z`,
        updatedAt: `${todayDateKey()}T06:00:00.000Z`,
      },
    ],
    previewUi: {
      dietPhase: {
        kind: 'active_psmf',
        activeUntilLabel: offsetDateKey(7),
      },
      recovery: {
        severity: 'red',
      },
      garmin: {
        kind: 'not_connected',
      },
    },
  })
  await goToSettings(page)

  await expect(page.getByTestId('recovery-section')).toContainText('Recovery: red')
})
