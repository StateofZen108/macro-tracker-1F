import { expect, test } from '@playwright/test'
import {
  assertAddFoodDialogAccessibility,
  assertReviewQueuePrimaryAction,
  clearClientStorageAndReload,
  createBackupChickenAndExport,
  expectBackupRestored,
  goToCoach,
  goToHome,
  goToWorkouts,
  installDeniedCameraShim,
  resetQaApp,
  runQaScenario,
  seedBodyProgressMissingPhoto,
  seedReviewQueuePending,
  seedWorkoutGuidance,
} from './helpers/qaRelease'
import { entryRow, getAddFoodSearchInput, goToSettings, goToWeight, openMealSheet } from './helpers/app'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await resetQaApp(page)
})

test('clean_install_baseline', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'clean_install_baseline', async ({ runAccessibilityAudit }) => {
    await goToHome(page)
    await expect(page.getByText(/dashboard/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^home$/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /^settings$/i }).first()).toBeVisible()
    await runAccessibilityAudit()
  })
})

test('repeat_logging_fast_path', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'repeat_logging_fast_path', async ({ runAccessibilityAudit }) => {
    await openMealSheet(page)
    const addFoodSheet = page.getByRole('dialog', { name: /add food/i })
    const searchInput = await getAddFoodSearchInput(page)
    await searchInput.fill('Banana')
    await expect(addFoodSheet.getByRole('button', { name: /banana/i }).first()).toBeVisible()
    await addFoodSheet.getByRole('button', { name: /^add 1x$/i }).first().click()
    await expect(addFoodSheet).toBeVisible()
    await expect(searchInput).toHaveValue('Banana')
    await assertAddFoodDialogAccessibility(page)
    await runAccessibilityAudit()
  })
})

test('review_queue_pending', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'review_queue_pending', async ({ runAccessibilityAudit }) => {
    await seedReviewQueuePending(page)
    await goToHome(page)
    await assertReviewQueuePrimaryAction(page)
    await expect(page.getByRole('button', { name: /open blocked log day|review in settings/i }).first()).toBeVisible()
    await runAccessibilityAudit()
  })
})

test('training_guidance_stale_readiness', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'training_guidance_stale_readiness', async ({ runAccessibilityAudit }) => {
    await seedWorkoutGuidance(page)
    await goToWorkouts(page)
    await expect(page.getByText(/hold steady/i).first()).toBeVisible()
    await expect(page.getByText(/medium confidence/i).first()).toBeVisible()
    await expect(page.getByText(/no garmin readiness snapshot is available yet/i).first()).toBeVisible()
    await runAccessibilityAudit()
  })
})

test('training_guidance_manual_override', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'training_guidance_manual_override', async ({ runAccessibilityAudit }) => {
    await seedWorkoutGuidance(page)

    await goToWorkouts(page)
    await page.getByRole('button', { name: /^push$/i }).click()
    await expect(page.getByText(/^manual$/i).first()).toBeVisible()
    await expect(page.getByText(/review today's training signals/i).first()).toBeVisible()

    await goToHome(page)
    await expect(page.getByText(/manual workout override/i).first()).toBeVisible()

    await goToCoach(page)
    await expect(page.getByText(/^manual$/i).first()).toBeVisible()
    await expect(page.getByText(/today's training action/i).first()).toBeVisible()

    await runAccessibilityAudit()
  })
})

test('progress_story_missing_photo', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'progress_story_missing_photo', async ({ runAccessibilityAudit }) => {
    await seedBodyProgressMissingPhoto(page)

    await goToWeight(page)
    await page.getByRole('button', { name: /^7d$/i }).click()
    await expect(page.getByText(/7-day progress looks on track/i).first()).toBeVisible()
    await expect(page.getByText(/photo compare is missing but your waist trend still supports the cut/i).first()).toBeVisible()
    await expect(page.getByText(/missing compare photo for/i).first()).toBeVisible()

    await goToHome(page)
    await expect(page.getByText(/7-day progress looks on track/i).first()).toBeVisible()
    await expect(page.getByText(/compare photo missing/i).first()).toBeVisible()

    await runAccessibilityAudit()
  })
})

test('offline_local_logging_only', async ({ page, context }, testInfo) => {
  await runQaScenario(page, testInfo, 'offline_local_logging_only', async ({ runAccessibilityAudit }) => {
    await openMealSheet(page)
    await context.setOffline(true)
    await page.waitForFunction(() => navigator.onLine === false)
    await expect(page.getByText(/offline/i).first()).toBeVisible()
    await expect(page.getByText(/local foods still work/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /scan barcode/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /scan nutrition label/i })).toBeDisabled()
    await assertAddFoodDialogAccessibility(page)
    await runAccessibilityAudit()
    await context.setOffline(false)
  })
})

test('food_catalog_5xx_fallback', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'food_catalog_5xx_fallback', async ({ runAccessibilityAudit }) => {
    await page.route('**/api/food-catalog/search**', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unavailable' }),
      })
    })

    await openMealSheet(page)
    const searchInput = await getAddFoodSearchInput(page)
    await searchInput.fill('yakitori')
    await expect(page.getByText(/remote catalog search is temporarily unavailable/i).first()).toBeVisible()
    await expect(page.getByText(/selected food/i)).toHaveCount(0)
    await assertAddFoodDialogAccessibility(page)
    await runAccessibilityAudit()
  })
})

test('barcode_permission_denied', async ({ page }, testInfo) => {
  await installDeniedCameraShim(page)
  await resetQaApp(page)

  await runQaScenario(page, testInfo, 'barcode_permission_denied', async ({ runAccessibilityAudit }) => {
    await openMealSheet(page)
    await page.getByRole('button', { name: /scan barcode/i }).click()
    await expect(page.getByText(/camera access was denied/i).first()).toBeVisible()
    await expect(page.getByText(/manual barcode entry/i).first()).toBeVisible()
    await expect(page.getByPlaceholder('0123456789012')).toBeVisible()
    await assertAddFoodDialogAccessibility(page)
    await runAccessibilityAudit()
  })
})

test('export_restore_roundtrip', async ({ page }, testInfo) => {
  await runQaScenario(page, testInfo, 'export_restore_roundtrip', async ({ runAccessibilityAudit }) => {
    const backupPath = await createBackupChickenAndExport(page)
    await clearClientStorageAndReload(page)
    await expect(entryRow(page, 'Backup Chicken')).toBeHidden()

    await goToSettings(page)
    await page.locator('input[type="file"][accept="application/json"]').setInputFiles(backupPath)
    await expect(page.getByText(/backup preview/i).first()).toBeVisible()
    await page.getByRole('button', { name: /apply import/i }).click()
    await expect(page.getByText(/replaced .* foods/i).first()).toBeVisible()
    await expectBackupRestored(page)
    await runAccessibilityAudit()
  })
})
