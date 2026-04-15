import { expect, test } from '@playwright/test'
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

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('starts an active PSMF phase with a required end date', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'standard_cut',
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await expect(section).toContainText('No active PSMF phase scheduled.')

  await section.getByRole('button', { name: /^Start PSMF phase$/i }).first().click()
  await section.getByLabel(/^Start date$/i).fill(todayDateKey())
  await section.getByLabel(/^End date$/i).fill(offsetDateKey(14))
  await section.getByLabel(/^Notes$/i).fill('Aggressive phase')
  await section.getByRole('button', { name: /^Start PSMF phase$/i }).last().click()

  await expect(section).toContainText('PSMF active until')

  const phases = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_diet_phases') ?? '[]'))
  expect(phases).toHaveLength(1)
  expect(phases[0]).toMatchObject({
    type: 'psmf',
    status: 'active',
    startDate: todayDateKey(),
    plannedEndDate: offsetDateKey(14),
    notes: 'Aggressive phase',
  })
})

test('extends an expired PSMF phase back into active status', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [
      {
        id: 'phase-expired-psmf',
        type: 'psmf',
        status: 'expired',
        startDate: offsetDateKey(-14),
        plannedEndDate: offsetDateKey(-1),
        actualEndDate: offsetDateKey(-1),
        createdAt: `${offsetDateKey(-14)}T07:00:00.000Z`,
        updatedAt: `${offsetDateKey(-1)}T07:00:00.000Z`,
      },
    ],
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await expect(section).toContainText('PSMF phase expired on')

  await section.getByRole('button', { name: /^Extend phase$/i }).click()
  await section.getByLabel(/^New end date$/i).fill(offsetDateKey(10))
  await section.getByRole('button', { name: /^Save end date$/i }).click()

  await expect(section).toContainText('PSMF active until')

  const phases = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_diet_phases') ?? '[]'))
  expect(phases[0]).toMatchObject({
    status: 'active',
    plannedEndDate: offsetDateKey(10),
  })
})

test('schedules and edits a future refeed inside the active PSMF phase', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await section.getByRole('button', { name: /^Schedule refeed$/i }).first().click()
  await section.getByLabel(/^Refeed date$/i).fill(offsetDateKey(3))
  await section.getByLabel(/^Refeed calories$/i).fill('2600')
  await section.getByLabel(/^Notes$/i).fill('Original refeed')
  await section.getByRole('button', { name: /^Schedule refeed$/i }).last().click()

  await expect(section).toContainText('Planned refeed on')
  await section.getByRole('button', { name: /^Edit refeed$/i }).click()
  await section.getByLabel(/^Refeed calories$/i).fill('2700')
  await section.locator('textarea').last().fill('Updated refeed')
  await section.getByRole('button', { name: /^Save refeed changes$/i }).click()

  const events = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_diet_phase_events') ?? '[]'))
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({
    date: offsetDateKey(3),
    calorieTargetOverride: 2700,
    notes: 'Updated refeed',
  })
})

test('starts a diet break from an active PSMF phase and auto-completes the prior phase', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [buildActivePsmfPhase()],
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await section.getByRole('button', { name: /^Start diet break$/i }).first().click()
  await section.getByLabel(/^Start date$/i).fill(todayDateKey())
  await section.getByLabel(/^End date$/i).fill(offsetDateKey(6))
  await section.getByLabel(/^Diet break calories$/i).fill('2800')
  await section.getByLabel(/^Notes$/i).fill('Planned break')
  await section.getByRole('button', { name: /^Start diet break$/i }).last().click()

  await expect(section).toContainText('Diet break active until')

  const phases = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_diet_phases') ?? '[]'))
  expect(phases).toHaveLength(2)
  expect(phases.find((phase: { type: string }) => phase.type === 'psmf')).toMatchObject({
    status: 'completed',
    actualEndDate: offsetDateKey(-1),
  })
  expect(phases.find((phase: { type: string }) => phase.type === 'diet_break')).toMatchObject({
    status: 'active',
    calorieTargetOverride: 2800,
    plannedEndDate: offsetDateKey(6),
    notes: 'Planned break',
  })
})

test('renders planned phases in upcoming sections instead of collapsing to the empty state', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [
      {
        id: 'phase-planned-psmf',
        type: 'psmf',
        status: 'planned',
        startDate: offsetDateKey(2),
        plannedEndDate: offsetDateKey(12),
        createdAt: `${todayDateKey()}T07:00:00.000Z`,
        updatedAt: `${todayDateKey()}T07:00:00.000Z`,
      },
      {
        id: 'phase-planned-break',
        type: 'diet_break',
        status: 'planned',
        startDate: offsetDateKey(13),
        plannedEndDate: offsetDateKey(18),
        calorieTargetOverride: 2600,
        createdAt: `${todayDateKey()}T07:00:00.000Z`,
        updatedAt: `${todayDateKey()}T07:00:00.000Z`,
      },
    ],
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await expect(section).toContainText('Upcoming phases')
  await expect(section).toContainText('PSMF scheduled from')
  await expect(section).toContainText('Diet break scheduled from')
  await expect(section).toContainText('No active PSMF phase scheduled.')
})

test('uses the shared notes editor for historical phase notes', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    fatLossMode: 'psmf',
    phases: [
      {
        id: 'phase-completed-history',
        type: 'psmf',
        status: 'completed',
        startDate: offsetDateKey(-20),
        plannedEndDate: offsetDateKey(-10),
        actualEndDate: offsetDateKey(-11),
        notes: 'Original completed note',
        createdAt: `${offsetDateKey(-20)}T07:00:00.000Z`,
        updatedAt: `${offsetDateKey(-11)}T07:00:00.000Z`,
      },
    ],
  })
  await goToSettings(page)

  const section = page.getByTestId('psmf-diet-phase-section')
  await section.getByRole('button', { name: /^Edit notes$/i }).click()

  const dialog = page.getByRole('dialog', { name: /^Edit phase notes$/i })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel(/^Notes$/i).fill('Updated completed phase note')
  await dialog.getByRole('button', { name: /^Save notes$/i }).click()
  await expect(dialog).toBeHidden()

  const phases = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mt_diet_phases') ?? '[]'))
  expect(phases[0]).toMatchObject({
    id: 'phase-completed-history',
    notes: 'Updated completed phase note',
  })
})
