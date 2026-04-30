import { expect, test } from '@playwright/test'
import { getAddFoodDialog, openMealSheet, resetApp, safeClick } from './helpers/app'

test.beforeEach(async ({ page }) => {
  await resetApp(page)
})

test('AI meal photo capture creates a review-required draft instead of trusted raw macros', async ({ page }) => {
  await openMealSheet(page)
  const addFoodDialog = getAddFoodDialog(page)

  const chooserPromise = page.waitForEvent('filechooser')
  await safeClick(addFoodDialog.getByRole('button', { name: /^AI meal photo$/i }))
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'chicken-rice-250g.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  })

  await expect(addFoodDialog.getByText('Meal photo draft')).toBeVisible()
  await expect(addFoodDialog.getByText('chicken rice 250g')).toBeVisible()
  await expect(addFoodDialog.getByText(/low confidence/i)).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^review manual entry$/i })).toBeVisible()

  await safeClick(addFoodDialog.getByRole('button', { name: /^review manual entry$/i }))
  await expect(addFoodDialog.getByText('Review meal photo draft')).toBeVisible()
  await expect(addFoodDialog.getByText(/draft only/i)).toBeVisible()
  await expect(addFoodDialog.getByRole('button', { name: /^review and save$/i })).toBeVisible()
})
