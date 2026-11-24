import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../router'

// CodeMirror needs real layout, so page tests drive a plain textarea with the same props.
vi.mock('../components/MarkdownEditor', () => ({
  MarkdownEditor: ({
    initialValue,
    onChange,
    label,
    readOnly,
  }: {
    initialValue: string
    onChange: (value: string) => void
    label: string
    readOnly?: boolean
  }) => (
    <textarea
      aria-label={label}
      defaultValue={initialValue}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

const ID = '6f1c2b1e-0000-4000-8000-000000000017'
const SCORES = { requirements: 3, architecture: 3, trade_offs: 3 }
const QUESTION = 'How would this scale 10x?'

const CHALLENGE = {
  id: ID,
  level: 'mid',
  topic: 'model_serving',
  scenario_md: 'Design a **low-latency** model server.',
  state: { kind: 'awaiting', round: 1 },
  rounds: [] as unknown[],
}

function round(n: number, verdict: unknown, answer = `answer ${n}`) {
  return { n, answer_md: answer, scores: SCORES, comment: `Comment on round ${n}.`, verdict }
}
const followUp = { kind: 'follow_up', question: QUESTION }
const RUBRIC = {
  dimensions: [
    { key: 'requirements', name: 'Requirements', weight: 1, full_marks_criteria: 'States latency SLOs.' },
    { key: 'architecture', name: 'Architecture', weight: 2, full_marks_criteria: 'Draws the serving path.' },
    { key: 'trade_offs', name: 'Trade-offs', weight: 1, full_marks_criteria: 'Weighs cost against latency.' },
  ],
}
const NOTES = { requirements: 'SLOs match.', architecture: 'No cache layer.', trade_offs: 'Cost ignored.' }

/** The challenge as the reveal endpoint returns it. */
function revealedFrom(
  challenge: Omit<typeof CHALLENGE, 'state'> & { state: unknown },
  reference = 'Use a **model cache**.',
) {
  return {
    ...challenge,
    state: { kind: 'revealed' },
    reference_md: reference,
    rubric: RUBRIC,
    comparison: { summary_md: 'You covered **latency** well.', notes: NOTES },
  }
}
const complete = { kind: 'complete' }

type Reply = () => Promise<Response>
const json =
  (body: unknown, status = 200): Reply =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

function deferred() {
  let resolve: (response: Response) => void = () => {}
  const promise = new Promise<Response>((r) => (resolve = r))
  return { reply: () => promise, resolve: (body: unknown) => resolve(new Response(JSON.stringify(body))) }
}

function stubFetch(...replies: Reply[]) {
  const fetchMock = vi.fn()
  for (const reply of replies) fetchMock.mockImplementationOnce(reply)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderChallenge() {
  const router = createMemoryRouter(routes, { initialEntries: [`/c/${ID}`] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

const editor = () => screen.findByRole('textbox', { name: 'Your answer' })
const submitButton = () => screen.getByRole('button', { name: /Submit answer|Grading/ })
const sheet = () => screen.getByRole('status', { name: 'Feedback' })
const call = (fetchMock: ReturnType<typeof vi.fn>, n: number) => {
  const [path, init] = fetchMock.mock.calls[n] as [string, RequestInit | undefined]
  return { path, method: init?.method, body: init?.body ? (JSON.parse(init.body as string) as unknown) : undefined }
}

async function answer(text: string) {
  await userEvent.type(await editor(), text)
  await userEvent.click(submitButton())
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('challenge screen', () => {
  it('shows the scenario as Markdown next to an empty editor for round 1', async () => {
    stubFetch(json(CHALLENGE))
    renderChallenge()

    expect(await screen.findByRole('heading', { level: 1, name: 'Model serving' })).toBeInTheDocument()
    expect(screen.getByText('low-latency').tagName).toBe('STRONG')
    expect(await editor()).toHaveValue('')
    expect(screen.getByRole('img', { name: 'Round 1 of 3' })).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'New challenge' })).toHaveAttribute('href', '/')
  })

  it('runs answer, follow-up, answer, complete', async () => {
    const fetchMock = stubFetch(
      json(CHALLENGE),
      json({ round: round(1, followUp), state: { kind: 'awaiting', round: 2 } }),
      json({ round: round(2, complete), state: { kind: 'completed' } }),
    )
    renderChallenge()

    await answer('Cache the model in memory.')

    expect(call(fetchMock, 1)).toEqual({
      path: `/api/challenges/${ID}/answers`,
      method: 'POST',
      body: { round: 1, answer_md: 'Cache the model in memory.' },
    })
    expect(await screen.findByText('Getting there')).toBeInTheDocument()
    expect(within(sheet()).getAllByRole('meter')).toHaveLength(3)
    expect(within(sheet()).getByRole('meter', { name: 'Trade offs' })).toHaveAttribute('aria-valuenow', '3')
    expect(within(sheet()).getByText('Comment on round 1.')).toBeInTheDocument()
    expect(within(sheet()).getByText(QUESTION)).toBeInTheDocument()

    await userEvent.click(within(sheet()).getByRole('button', { name: 'Answer follow-up' }))

    expect(screen.queryByText('Getting there')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Round 2 of 3' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Follow-up' }).parentElement).toHaveTextContent(QUESTION)
    expect(await editor()).toHaveValue('')

    await answer('Shard by tenant.')

    expect(call(fetchMock, 2).body).toEqual({ round: 2, answer_md: 'Shard by tenant.' })
    expect(await screen.findByText('Challenge complete!')).toBeInTheDocument()
    expect(within(sheet()).getByRole('button', { name: 'See reference' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Complete after 2 of 3 rounds' })).toBeInTheDocument()
  })

  it('sends one request for a double click, and keeps submit disabled while grading', async () => {
    const grading = deferred()
    const fetchMock = stubFetch(json(CHALLENGE), grading.reply)
    renderChallenge()
    await userEvent.type(await editor(), 'An answer.')

    await userEvent.dblClick(submitButton())

    expect(submitButton()).toBeDisabled()
    expect(submitButton()).toHaveTextContent('Grading…')
    expect(await editor()).toHaveAttribute('readonly')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => grading.resolve({ round: round(1, followUp), state: { kind: 'awaiting', round: 2 } }))
    expect(await screen.findByText('Getting there')).toBeInTheDocument()
  })

  it('keeps the draft across a reload, per round, and drops it once graded', async () => {
    stubFetch(json(CHALLENGE), json(CHALLENGE))
    const first = renderChallenge()
    await userEvent.type(await editor(), 'Half-written answer')
    first.unmount()

    renderChallenge()

    expect(await editor()).toHaveValue('Half-written answer')

    vi.unstubAllGlobals()
    stubFetch(json({ round: round(1, followUp), state: { kind: 'awaiting', round: 2 } }))
    await userEvent.click(submitButton())
    await userEvent.click(await screen.findByRole('button', { name: 'Answer follow-up' }))

    expect(await editor()).toHaveValue('')
    expect(localStorage.length).toBe(0)
  })

  it('keeps the answer and offers a retry when grading fails', async () => {
    const fetchMock = stubFetch(
      json(CHALLENGE),
      json({ detail: 'The model call failed, so nothing was saved: timeout' }, 502),
      json({ round: round(1, followUp), state: { kind: 'awaiting', round: 2 } }),
    )
    renderChallenge()

    await answer('My answer.')

    expect(await screen.findByRole('alert')).toHaveTextContent('The model call failed')
    expect(await editor()).toHaveValue('My answer.')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(call(fetchMock, 2).body).toEqual({ round: 1, answer_md: 'My answer.' })
    expect(await screen.findByText('Getting there')).toBeInTheDocument()
  })

  it('asks before revealing, and can be cancelled', async () => {
    const fetchMock = stubFetch(json(CHALLENGE))
    renderChallenge()

    await userEvent.click(await screen.findByRole('button', { name: 'Reveal solution' }))

    const confirm = screen.getByRole('alertdialog', { name: 'Reveal the solution?' })
    expect(confirm).toHaveTextContent("You won't be able to answer after revealing.")
    expect(within(confirm).getByRole('button', { name: 'Keep answering' })).toHaveFocus()

    await userEvent.click(within(confirm).getByRole('button', { name: 'Keep answering' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reveals the reference solution once confirmed', async () => {
    const revealed = revealedFrom(CHALLENGE)
    const fetchMock = stubFetch(json(CHALLENGE), json(revealed))
    renderChallenge()

    await userEvent.click(await screen.findByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(call(fetchMock, 1)).toEqual({ path: `/api/challenges/${ID}/reveal`, method: 'POST', body: undefined })
    expect(await screen.findByRole('heading', { name: 'Reference solution' })).toBeInTheDocument()
    expect(screen.getByText('model cache').tagName).toBe('STRONG')
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument()
  })

  it('shows a failed reveal and keeps the editor', async () => {
    stubFetch(json(CHALLENGE), json({ detail: 'Not found' }, 404))
    renderChallenge()

    await userEvent.click(await screen.findByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
    expect(await editor()).toBeInTheDocument()
  })

  it('reveals straight from the completion sheet, since there is nothing left to answer', async () => {
    const revealed = revealedFrom({ ...CHALLENGE, rounds: [round(1, complete, 'Complete answer.')] }, 'Reference.')
    const fetchMock = stubFetch(
      json(CHALLENGE),
      json({ round: round(1, complete), state: { kind: 'completed' } }),
      json(revealed),
    )
    renderChallenge()

    await answer('Complete answer.')
    await screen.findByText('Challenge complete!')
    await userEvent.click(within(sheet()).getByRole('button', { name: 'See reference' }))

    expect(call(fetchMock, 2).path).toBe(`/api/challenges/${ID}/reveal`)
    expect(await screen.findByRole('heading', { name: 'Reference solution' })).toBeInTheDocument()
    const final = screen.getByRole('textbox', { name: 'Your final answer' })
    expect(final).toHaveValue('Complete answer.')
    expect(final).toHaveAttribute('readonly')
    expect(sheet()).toBeEmptyDOMElement()
  })

  it('opens a completed challenge on its summary, with past rounds and no editor', async () => {
    stubFetch(json({ ...CHALLENGE, state: { kind: 'completed' }, rounds: [round(1, followUp), round(2, complete)] }))
    renderChallenge()

    expect(await screen.findByRole('heading', { name: 'Challenge complete' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Complete after 2 of 3 rounds' })).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Round 2')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'See reference' })).toBeInTheDocument()
  })

  it('opens mid-challenge on the current round with its follow-up question', async () => {
    stubFetch(json({ ...CHALLENGE, state: { kind: 'awaiting', round: 2 }, rounds: [round(1, followUp)] }))
    renderChallenge()

    expect(await screen.findByRole('img', { name: 'Round 2 of 3' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Follow-up' }).parentElement).toHaveTextContent(QUESTION)
  })

  it('switches the editor to a Markdown preview and back, with a word count', async () => {
    stubFetch(json(CHALLENGE))
    renderChallenge()
    await userEvent.type(await editor(), 'Use a **cache** here')

    expect(screen.getByText('4 words')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument()
    expect(screen.getByText('cache').tagName).toBe('STRONG')

    await userEvent.click(screen.getByRole('button', { name: 'Write' }))

    expect(await editor()).toHaveValue('Use a **cache** here')
  })

  it('opens a revealed challenge on the reference solution', async () => {
    stubFetch(json(revealedFrom(CHALLENGE, 'Reference text.')))
    renderChallenge()

    expect(await screen.findByRole('heading', { name: 'Reference solution' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reveal solution' })).not.toBeInTheDocument()
    // Revealed before any answer: no round was graded, so there is no progress to show.
    expect(screen.queryByRole('img', { name: /round/i })).not.toBeInTheDocument()
  })

  it('reveals mid-challenge: last answer read-only beside the reference, with the comparison and rubric', async () => {
    const midway = { ...CHALLENGE, state: { kind: 'awaiting', round: 2 }, rounds: [round(1, followUp, 'Round one answer.')] }
    stubFetch(json(midway), json(revealedFrom(midway)))
    renderChallenge()
    await userEvent.type(await editor(), 'Unsent draft')

    await userEvent.click(screen.getByRole('button', { name: 'Reveal solution' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))

    const final = await screen.findByRole('textbox', { name: 'Your final answer' })
    expect(final).toHaveValue('Round one answer.')
    expect(final).toHaveAttribute('readonly')
    expect(screen.getByText('Round 1 of 3, the last one graded.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit answer/ })).not.toBeInTheDocument()
    expect(screen.getByText('model cache').tagName).toBe('STRONG')
    // The challenge takes no more answers, so the unsent draft is dropped.
    expect(localStorage.length).toBe(0)

    const comparison = screen.getByRole('region', { name: 'Comparison' })
    expect(within(comparison).getByText('latency').tagName).toBe('STRONG')
    const rows = within(comparison).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Requirements'),
      expect.stringContaining('Architecture'),
      expect.stringContaining('Trade-offs'),
    ])
    expect(rows[1]).toHaveTextContent('50%')
    expect(rows[1]).toHaveTextContent('Draws the serving path.')
    expect(rows[1]).toHaveTextContent('No cache layer.')
    expect(within(rows[1]).getByRole('meter', { name: 'Architecture' })).toHaveAttribute('aria-valuenow', '3')
  })

  it('makes New challenge the primary action once revealed', async () => {
    stubFetch(json(revealedFrom(CHALLENGE)))
    renderChallenge()

    const link = await screen.findByRole('link', { name: 'New challenge' })
    expect(link).toHaveAttribute('data-variant', 'primary')
    expect(link).toHaveAttribute('href', '/')
  })

  it('keeps New challenge secondary while answering', async () => {
    stubFetch(json(CHALLENGE))
    renderChallenge()

    expect(await screen.findByRole('link', { name: 'New challenge' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('switches between your answer and the reference with tabs on narrow screens', async () => {
    stubFetch(json(revealedFrom({ ...CHALLENGE, state: { kind: 'completed' }, rounds: [round(1, complete)] })))
    renderChallenge()

    const answerTab = await screen.findByRole('tab', { name: 'Your answer' })
    const referenceTab = screen.getByRole('tab', { name: 'Reference solution' })
    expect(answerTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Your answer' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Reference solution' })).toHaveAttribute('data-active', 'false')

    await userEvent.click(referenceTab)

    expect(referenceTab).toHaveAttribute('aria-selected', 'true')
    expect(answerTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel', { name: 'Reference solution' })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Your answer' })).toHaveAttribute('data-active', 'false')
  })

  it('moves between the tabs with the arrow keys, with one tab stop', async () => {
    stubFetch(json(revealedFrom({ ...CHALLENGE, state: { kind: 'completed' }, rounds: [round(1, complete)] })))
    renderChallenge()
    const answerTab = await screen.findByRole('tab', { name: 'Your answer' })
    const referenceTab = screen.getByRole('tab', { name: 'Reference solution' })
    expect(answerTab).toHaveAttribute('tabindex', '0')
    expect(referenceTab).toHaveAttribute('tabindex', '-1')

    act(() => answerTab.focus())
    await userEvent.keyboard('{ArrowRight}')

    expect(referenceTab).toHaveFocus()
    expect(referenceTab).toHaveAttribute('aria-selected', 'true')
    expect(referenceTab).toHaveAttribute('tabindex', '0')
    expect(answerTab).toHaveAttribute('tabindex', '-1')

    await userEvent.keyboard('{ArrowRight}')
    expect(answerTab).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(referenceTab).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(answerTab).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(referenceTab).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(referenceTab).toHaveAttribute('aria-selected', 'true')
  })

  it('says which round the rubric scores come from', async () => {
    const rounds = [round(1, followUp), round(2, complete)]
    stubFetch(json(revealedFrom({ ...CHALLENGE, state: { kind: 'completed' }, rounds })))
    renderChallenge()

    expect(await screen.findByRole('table', { name: 'Rubric, scored on round 2, the last one graded' })).toBeInTheDocument()
  })

  it('says there is nothing to compare when revealed before answering', async () => {
    stubFetch(json(revealedFrom(CHALLENGE)))
    renderChallenge()

    expect(await screen.findByText('You revealed the solution before answering.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Your final answer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.getAllByText('Not graded')).toHaveLength(3)
    expect(screen.getByRole('table', { name: 'Rubric' })).toBeInTheDocument()
  })
})
