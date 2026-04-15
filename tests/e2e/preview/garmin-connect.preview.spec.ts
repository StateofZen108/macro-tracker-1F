import { expect, test } from '@playwright/test'
import { goToSettings, resetApp } from '../helpers/app'
import { seedPsmfGarminFeatureState } from '../helpers/seed'

function offsetDateKey(offsetDays: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

const activePhasePreview = {
  kind: 'active_psmf' as const,
  activeUntilLabel: offsetDateKey(7),
}

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('renders the default not-connected Garmin state', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    previewUi: {
      dietPhase: activePhasePreview,
      recovery: { severity: 'green' },
      garmin: { kind: 'not_connected' },
    },
  })
  await goToSettings(page)

  const section = page.getByTestId('garmin-section')
  await expect(section).toContainText(
    'Connect Garmin to import sleep, stress, Body Battery, steps, and cardio into recovery scoring.',
  )
  await expect(section.getByRole('button', { name: /^Connect Garmin$/i })).toBeVisible()
})

test('renders the connected stale-data Garmin state with sync actions', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    previewUi: {
      dietPhase: activePhasePreview,
      recovery: { severity: 'green' },
      garmin: {
        kind: 'connected',
        lastSyncedLabel: '2026-04-13 08:15 UTC',
        stale: true,
      },
    },
  })
  await goToSettings(page)

  const section = page.getByTestId('garmin-section')
  await expect(section).toContainText(
    'Garmin is connected. Imported wellness data can influence recovery scoring and coaching holds.',
  )
  await expect(section).toContainText('Last synced: 2026-04-13 08:15 UTC')
  await expect(section).toContainText(
    'Garmin data is older than 72 hours and will not trigger high-severity recovery holds.',
  )
  await expect(section.getByRole('button', { name: /^Sync now$/i })).toBeVisible()
  await expect(section.getByRole('button', { name: /^Disconnect$/i })).toBeVisible()
})

test('renders the rate-limited Garmin state', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    previewUi: {
      dietPhase: activePhasePreview,
      recovery: { severity: 'yellow' },
      garmin: {
        kind: 'rate_limited',
        rateLimitedUntilLabel: '2026-04-13 18:00 UTC',
      },
    },
  })
  await goToSettings(page)

  await expect(page.getByTestId('garmin-section')).toContainText(
    'Garmin sync is temporarily rate limited. Try again after 2026-04-13 18:00 UTC.',
  )
})

test('renders the reconnect-required Garmin state', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    previewUi: {
      dietPhase: activePhasePreview,
      recovery: { severity: 'yellow' },
      garmin: {
        kind: 'reconnect_required',
      },
    },
  })
  await goToSettings(page)

  const section = page.getByTestId('garmin-section')
  await expect(section).toContainText('Garmin needs to be reconnected before new data can sync.')
  await expect(section.getByRole('button', { name: /^Reconnect Garmin$/i })).toBeVisible()
})
