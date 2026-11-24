import { expect, test } from '@playwright/test'
import { answer, answerEditor, FAKE_SCORE, historyRow, startChallenge } from './flow'

test('starting a new challenge mid-loop leaves the first one where it was', async ({ page }) => {
  const first = await startChallenge(page, 'Feature stores')
  await answer(page, 'Round 1: an offline and an online store.')
  await page.getByRole('button', { name: 'Answer follow-up' }).click()
  await expect(page.getByRole('heading', { name: 'Follow-up' })).toBeVisible()

  await page.getByRole('link', { name: 'New challenge' }).click()
  await expect(page).toHaveURL(/\/$/)
  const second = await startChallenge(page, 'Data pipelines')

  expect(second).not.toBe(first)
  await expect(page.getByRole('heading', { name: 'Your answer' })).toBeVisible()
  await expect(answerEditor(page)).toHaveText('')

  const firstRow = await historyRow(page, first)
  await expect(firstRow).toContainText('Round 2 of 3')
  await expect(firstRow.locator('.row__score')).toHaveText(`${FAKE_SCORE}/100`)
  const secondRow = page.locator(`a[href="/c/${second}"]`)
  await expect(secondRow).toContainText('Round 1 of 3')
  await expect(secondRow.locator('.row__score')).toHaveText('No score')

  await firstRow.click()
  await expect(page.getByRole('heading', { name: 'Follow-up' })).toBeVisible()
  await expect(page.getByText('Fake follow-up: how would this scale 10x?')).toBeVisible()
})
