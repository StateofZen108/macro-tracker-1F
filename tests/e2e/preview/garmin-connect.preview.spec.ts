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
    'Connect Garmin once. After that, MacroTracker keeps sleep, stress, Body Battery, steps, and cardio snapshots updated automatically in the background.',
  )
  await expect(section.getByRole('button', { name: /^Connect Garmin$/i })).toBeVisible()
})

test('renders the connected stale-data Garmin state with troubleshooting actions', async ({ page }) => {
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
    'Garmin is connected and background automation is active. Fresh wellness snapshots sync into MacroTracker automatically.',
  )
  await expect(section).toContainText('Last synced: 2026-04-13 08:15 UTC')
  await expect(section).toContainText(
    'Garmin automation is behind. Snapshots older than 6 hours can delay recovery updates until the next successful sync.',
  )
  await expect(section.getByRole('button', { name: /^Disconnect$/i })).toBeVisible()
  await expect(section.getByText('Troubleshooting')).toBeVisible()
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
    'Garmin background sync is temporarily rate limited. It will resume after 2026-04-13 18:00 UTC.',
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
  await expect(section).toContainText(
    'Garmin needs to be reconnected before automatic background sync can resume.',
  )
  await expect(section.getByRole('button', { name: /^Reconnect Garmin$/i })).toBeVisible()
})

test('renders the deployment-disabled Garmin state', async ({ page }) => {
  await seedPsmfGarminFeatureState(page, {
    goalMode: 'lose',
    previewUi: {
      dietPhase: activePhasePreview,
      recovery: { severity: 'green' },
      garmin: {
        kind: 'not_enabled',
      },
    },
  })
  await goToSettings(page)

  const section = page.getByTestId('garmin-section')
  await expect(section).toContainText('Garmin is not enabled in this deployment.')
  await expect(section.getByRole('button', { name: /^Connect Garmin$/i })).toHaveCount(0)
})
