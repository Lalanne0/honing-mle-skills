import { expect, test } from '@playwright/test'
import { historyRow, startChallenge } from './flow'

test('reveal before answering shows the reference and leaves the challenge unscored', async ({ page }) => {
  const id = await startChallenge(page)

  await page.getByRole('button', { name: 'Reveal solution' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Reveal the solution?' })
  await confirm.getByRole('button', { name: 'Keep answering' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible()

  await page.getByRole('button', { name: 'Reveal solution' }).click()
  await confirm.getByRole('button', { name: 'Reveal' }).click()

  await expect(page.getByText('Fake reference solution.')).toBeVisible()
  await expect(page.getByText('You revealed the solution before answering.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reveal solution' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeHidden()

  const row = await historyRow(page, id)
  await expect(row).toContainText('Revealed')
  await expect(row.locator('.row__score')).toHaveText('No score')
})
