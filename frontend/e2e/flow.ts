import { expect, type Page } from '@playwright/test'

/**
 * What no API response may carry before reveal: FakeLLM's reference solution and rubric text,
 * and the field names that would hold them.
 */
export const HIDDEN_BEFORE_REVEAL = ['Fake reference solution.', 'Covers requirements.', 'reference_md', 'full_marks_criteria']

/** FakeLLM scores every dimension 3 of 5, so every graded challenge has a weighted score of 60. */
export const FAKE_SCORE = '60'

/** Start a challenge from the start screen and return its id. */
export async function startChallenge(page: Page, topic = 'Model serving'): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: topic }).click()
  await page.getByRole('button', { name: 'Start challenge' }).click()
  await expect(page).toHaveURL(/\/c\/[^/]+$/)
  await expect(page.getByRole('region', { name: 'Scenario' })).toContainText('Fake mid challenge')
  return new URL(page.url()).pathname.split('/').at(-1) as string
}

export function answerEditor(page: Page) {
  return page.getByRole('textbox', { name: 'Your answer' })
}

export function submitButton(page: Page) {
  return page.getByRole('button', { name: /Submit answer|Grading…/ })
}

export function feedback(page: Page) {
  return page.getByRole('status', { name: 'Feedback' })
}

/** Type an answer for the round on screen, submit it and wait for its grade. */
export async function answer(page: Page, text: string) {
  await answerEditor(page).fill(text)
  await submitButton(page).click()
  await expect(feedback(page)).toContainText('Fake comment.')
}

/** The history row for one challenge. */
export async function historyRow(page: Page, id: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'History' }).click()
  const row = page.locator(`a[href="/c/${id}"]`)
  await expect(row).toBeVisible()
  return row
}
