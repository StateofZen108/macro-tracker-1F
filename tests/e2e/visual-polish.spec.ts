import { expect, type Page, test } from '@playwright/test'
import { goToHome, goToLog, goToSettings, goToWeight, openMealSheet, resetApp, safeClick } from './helpers/app'

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const root = document.documentElement
    const body = document.body
    const maxWidth = Math.max(root.clientWidth, window.innerWidth)
    const pageOverflow = Math.max(root.scrollWidth, body.scrollWidth) - maxWidth
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const styles = window.getComputedStyle(element)
        return (
          rect.width > 1 &&
          rect.height > 1 &&
          styles.display !== 'none' &&
          styles.visibility !== 'hidden' &&
          (rect.left < -1 || rect.right > window.innerWidth + 1)
        )
      })
      .slice(0, 5)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        testId: element.getAttribute('data-testid'),
        text: element.textContent?.trim().slice(0, 80),
      }))

    return {
      pageOverflow,
      offenders,
    }
  })

  expect(result.pageOverflow, `${label} page should not horizontally overflow`).toBeLessThanOrEqual(1)
  expect(result.offenders, `${label} should not have offscreen visible elements`).toEqual([])
}

async function captureEvidence(page: Page, testInfo: { outputPath: (name: string) => string }, label: string) {
  await page.screenshot({
    path: testInfo.outputPath(`visual-polish-${label}.png`),
    fullPage: true,
  })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await resetApp(page)
})

test('S22 core paid PWA surfaces fit without clipping or competing primary actions', async ({ page }, testInfo) => {
  await goToLog(page)
  await expect(page.getByTestId('daily-summary-card')).toBeVisible()
  await expect(page.getByTestId('fast-log-primary-search')).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Log')
  await captureEvidence(page, testInfo, 'log')

  await goToHome(page)
  await expect(page.getByTestId('cut-os-activation')).toBeVisible()
  await expect(page.getByRole('button', { name: /Import MacroFactor history/i })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Dashboard')
  await captureEvidence(page, testInfo, 'dashboard')

  await goToWeight(page)
  await expect(page.getByText(/weight/i).first()).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Weight')
  await captureEvidence(page, testInfo, 'weight')

  await safeClick(page.getByRole('button', { name: /^coach$/i }))
  await expect(page.getByText(/Coach ready/i)).toBeVisible()
  await expect(page.getByText(/provider not configured/i)).toBeHidden()
  await expectNoHorizontalOverflow(page, 'Coach')
  await captureEvidence(page, testInfo, 'coach')

  await goToSettings(page)
  await expect(page.getByText(/settings/i).first()).toBeVisible()
  await expectNoHorizontalOverflow(page, 'Settings')
  await captureEvidence(page, testInfo, 'settings')
})

test('S22 Add Food and OCR review entry points fit inside the logger sheet', async ({ page }, testInfo) => {
  await goToLog(page)
  await openMealSheet(page)
  const addFoodDialog = page.getByRole('dialog', { name: /add food/i })

  await expect(addFoodDialog.getByRole('button', { name: /^scan nutrition label$/i })).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^scan barcode$/i })).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^create custom food$/i })).toBeVisible()
  const dialogFits = await addFoodDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  expect(dialogFits).toBe(true)
  await expectNoHorizontalOverflow(page, 'Add Food')
  await captureEvidence(page, testInfo, 'add-food')
})
