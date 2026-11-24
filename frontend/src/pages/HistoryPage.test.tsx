import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChallengeSummary, TopicStats } from '../api/client'
import { routes } from '../router'

const SUMMARY: ChallengeSummary = {
  id: '6f1c2b1e-0000-4000-8000-000000000001',
  created_at: '2026-11-20T10:00:00Z',
  level: 'mid',
  topic: 'feature_stores',
  scenario_md: '# Food delivery\n\nDesign a feature store for a food-delivery app.',
  state: { kind: 'completed' },
  rounds_answered: 2,
  score: 41.6,
}

const IN_PROGRESS: ChallengeSummary = {
  ...SUMMARY,
  id: '6f1c2b1e-0000-4000-8000-000000000002',
  level: 'senior',
  topic: 'model_serving',
  scenario_md: 'Serve a ranking model at 10k QPS.',
  state: { kind: 'awaiting', round: 1 },
  rounds_answered: 0,
  score: null,
}

const STATS: TopicStats[] = [
  {
    topic: 'feature_stores',
    attempts: 3,
    graded: 2,
    average_score: 41.6,
    trend: -5,
    weakest_dimensions: [
      { key: 'trade_offs', average_score: 1.5 },
      { key: 'online_offline_skew', average_score: 2 },
    ],
  },
  { topic: 'model_serving', attempts: 1, graded: 0, average_score: null, trend: null, weakest_dimensions: [] },
]

type Replies = { stats?: unknown; history?: (url: URL) => unknown; status?: number }

/** A fetch that answers /api/stats and /api/challenges, and records what was asked. */
function stubBackend({ stats = STATS, history = () => [SUMMARY, IN_PROGRESS], status = 200 }: Replies = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const body = url.pathname === '/api/stats' ? stats : history(url)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderHistory(path = '/history') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const historyCalls = (fetchMock: ReturnType<typeof stubBackend>) =>
  fetchMock.mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith('/api/challenges'))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('history page', () => {
  it('names the weakest topic and its weakest dimensions in the Focus next card', async () => {
    stubBackend()
    renderHistory()

    const focus = await screen.findByRole('region', { name: 'Focus next' })

    expect(within(focus).getByText('Feature stores')).toBeInTheDocument()
    expect(within(focus).getByText('42/100 average')).toBeInTheDocument()
    expect(within(focus).getByText('Trade offs')).toBeInTheDocument()
    expect(within(focus).getByText('1.5/5')).toBeInTheDocument()
    expect(within(focus).getByText('Online offline skew')).toBeInTheDocument()
  })

  it('asks for a graded round when nothing has been graded yet', async () => {
    stubBackend({ stats: [STATS[1]] })
    renderHistory()

    const focus = await screen.findByRole('region', { name: 'Focus next' })

    expect(within(focus).getByText(/Answer a round to see/)).toBeInTheDocument()
  })

  it('shows a bar for every topic, with untried topics marked not tried yet', async () => {
    stubBackend()
    renderHistory()

    const bars = await screen.findByRole('list', { name: 'Score by topic' })
    const rows = within(bars).getAllByRole('listitem')

    expect(rows).toHaveLength(10)
    expect(within(rows[0]).getByText('Feature stores')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('meter', { name: 'Feature stores' })).toHaveAttribute('aria-valuenow', '42')
    expect(within(rows[0]).getByText('42 avg · 3 attempts')).toBeInTheDocument()
    expect(within(rows[0]).getByText('−5 pts')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Not graded yet · 1 attempt')).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('meter')).not.toBeInTheDocument()
    expect(within(rows[2]).getByText('Not tried yet')).toBeInTheDocument()
  })

  it('lists past challenges, each opening the challenge', async () => {
    stubBackend()
    const router = renderHistory()

    const list = await screen.findByRole('list', { name: 'Past challenges' })
    const rows = within(list).getAllByRole('link')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAccessibleName(/Feature stores/)
    expect(within(rows[0]).getByText('Food delivery')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Completed')).toBeInTheDocument()
    expect(within(rows[0]).getByText('42')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Round 1 of 3')).toBeInTheDocument()
    expect(within(rows[1]).getByText('No score')).toBeInTheDocument()

    await userEvent.click(rows[0])
    expect(router.state.location.pathname).toBe(`/c/${SUMMARY.id}`)
  })

  it('filters the history by topic and level, keeping the filters in the address', async () => {
    const fetchMock = stubBackend({
      history: (url) => (url.searchParams.get('topic') === 'model_serving' ? [IN_PROGRESS] : [SUMMARY, IN_PROGRESS]),
    })
    const router = renderHistory()
    await screen.findByRole('list', { name: 'Past challenges' })

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Topic' }), 'model_serving')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Level' }), 'senior')

    expect(await screen.findByText('Round 1 of 3')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Past challenges' })).getAllByRole('link')).toHaveLength(1)
    expect(historyCalls(fetchMock).at(-1)).toBe('/api/challenges?topic=model_serving&level=senior')
    expect(router.state.location.search).toBe('?topic=model_serving&level=senior')
  })

  it('reads the filters from the address', async () => {
    const fetchMock = stubBackend()
    renderHistory('/history?level=junior')

    await screen.findByRole('list', { name: 'Past challenges' })

    expect(screen.getByRole('combobox', { name: 'Level' })).toHaveValue('junior')
    expect(screen.getByRole('combobox', { name: 'Topic' })).toHaveValue('')
    expect(historyCalls(fetchMock)).toEqual(['/api/challenges?level=junior'])
  })

  it('says when no challenge matches the filters, and can clear them', async () => {
    const fetchMock = stubBackend({ history: (url) => (url.search ? [] : [SUMMARY]) })
    const router = renderHistory('/history?topic=model_serving')

    expect(await screen.findByText('No challenges match these filters.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(await screen.findByRole('list', { name: 'Past challenges' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(historyCalls(fetchMock).at(-1)).toBe('/api/challenges')
  })

  it('shows an empty state on first use, pointing to Practice', async () => {
    const fetchMock = stubBackend({ stats: [] })
    const router = renderHistory()

    expect(await screen.findByRole('heading', { name: 'No challenges yet' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Focus next' })).not.toBeInTheDocument()
    expect(historyCalls(fetchMock)).toEqual([])

    await userEvent.click(screen.getByRole('link', { name: 'Start your first challenge' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows an error with a retry when the stats fail to load', async () => {
    stubBackend({ stats: { detail: 'Database is locked.' }, status: 500 })
    renderHistory()

    expect(await screen.findByRole('alert')).toHaveTextContent('Database is locked.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
