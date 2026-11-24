import { expect, test } from '@playwright/test'
import { answerEditor, feedback, startChallenge, submitButton } from './flow'

test('a double click on submit sends one answer, and the server refuses a second one for the same round', async ({
  page,
}) => {
  const id = await startChallenge(page)
  const answers = `**/api/challenges/${id}/answers`
  let sent = 0
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  // Hold the grade so the second click lands while the first answer is still in flight.
  await page.route(answers, async (route) => {
    sent += 1
    await held
    await route.continue()
  })

  await answerEditor(page).fill('Round 1: one answer, sent once.')
  await submitButton(page).dblclick()
  await expect(submitButton(page)).toHaveText('Grading…')
  await expect(submitButton(page)).toBeDisabled()
  release()

  await expect(feedback(page)).toContainText('Fake comment.')
  expect(sent).toBe(1)

  const again = await page.request.post(`/api/challenges/${id}/answers`, {
    data: { round: 1, answer_md: 'The same round again.' },
  })
  expect(again.status()).toBe(409)
})
