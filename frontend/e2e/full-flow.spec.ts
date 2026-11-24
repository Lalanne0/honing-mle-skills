import { expect, test } from '@playwright/test'
import { answer, FAKE_SCORE, feedback, HIDDEN_BEFORE_REVEAL, historyRow, startChallenge } from './flow'

test('answer every round, reveal, and find the challenge in history with its score', async ({ page }) => {
  // Leak check: record every API response body until the reveal is asked for.
  // (The app's own source mentions the field names, so only /api/ responses are checked.)
  const bodies: Promise<string>[] = []
  let revealing = false
  page.on('response', (response) => {
    if (!revealing && new URL(response.url()).pathname.startsWith('/api/')) bodies.push(response.text())
  })

  const id = await startChallenge(page)
  await expect(page.getByRole('heading', { name: 'Your answer' })).toBeVisible()

  await answer(page, 'Round 1: a model server behind a load balancer.')
  await expect(feedback(page)).toContainText('Fake follow-up: how would this scale 10x?')
  await page.getByRole('button', { name: 'Answer follow-up' }).click()

  await expect(page.getByRole('heading', { name: 'Follow-up' })).toBeVisible()
  await answer(page, 'Round 2: autoscale replicas and batch requests.')
  await page.getByRole('button', { name: 'Answer follow-up' }).click()

  // FakeLLM always asks a follow-up, so the third and last round completes the challenge.
  await answer(page, 'Round 3: shard by model and cache hot predictions.')
  await expect(feedback(page)).not.toContainText('Follow-up question')

  await test.step('nothing before reveal carried the reference solution or rubric', async () => {
    const seen = await Promise.all(bodies)
    expect(seen.length).toBeGreaterThan(0)
    for (const secret of HIDDEN_BEFORE_REVEAL) {
      expect(seen.filter((body) => body.includes(secret))).toEqual([])
    }
  })

  revealing = true
  await feedback(page).getByRole('button', { name: 'See reference' }).click()
  await expect(page.getByRole('heading', { name: 'Comparison' })).toBeVisible()
  await expect(page.getByText('Fake comparison of 3 rounds.')).toBeVisible()
  await expect(page.getByText('Fake reference solution.')).toBeVisible()
  await expect(page.getByText('Round 3 of 3, the last one graded.')).toBeVisible()

  const row = await historyRow(page, id)
  await expect(row).toContainText('Revealed')
  await expect(row.locator('.row__score')).toHaveText(`${FAKE_SCORE}/100`)
})
