import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from './router'

const CHALLENGE = {
  id: '6f1c2b1e-0000-4000-8000-000000000001',
  level: 'senior',
  topic: 'recommender_systems',
  scenario_md: 'Design the home feed for a news app with 40M daily users.',
  state: { kind: 'awaiting', round: 1 },
  rounds: [],
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

function stubFetch(...replies: Array<() => Promise<Response>>) {
  const fetchMock = vi.fn()
  for (const reply of replies) fetchMock.mockImplementationOnce(reply)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app shell', () => {
  it('opens on Practice, with the header and navigation', () => {
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Practice' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'honing-mle-skills home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('heading', { level: 1, name: 'Practice' })).toBeInTheDocument()
  })

  it('navigates to History and back to Practice', async () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })

    await userEvent.click(within(nav).getByRole('link', { name: 'History' }))
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Practice' })).not.toHaveAttribute('aria-current')

    await userEvent.click(within(nav).getByRole('link', { name: 'Practice' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Practice' })).toBeInTheDocument()
  })

  it('shows a not-found page for an unknown path, inside the shell', () => {
    renderAt('/nope')

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('serves the design demo on /design, outside the shell', () => {
    renderAt('/design')

    expect(screen.getByRole('heading', { level: 1, name: 'Field Notes' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})

describe('challenge page', () => {
  it('loads the challenge, then shows its topic, level and scenario', async () => {
    const fetchMock = stubFetch(json(CHALLENGE))

    renderAt(`/c/${CHALLENGE.id}`)

    expect(screen.getByRole('status')).toHaveTextContent('Loading the challenge…')
    expect(await screen.findByRole('heading', { level: 1, name: 'Recommender systems' })).toBeInTheDocument()
    expect(screen.getByText('Senior')).toBeInTheDocument()
    expect(screen.getByText(CHALLENGE.scenario_md)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/challenges/${CHALLENGE.id}`)
  })

  it('shows the error state when the backend fails, and retries', async () => {
    stubFetch(json({ detail: `No challenge ${CHALLENGE.id}` }, 404), json(CHALLENGE))

    renderAt(`/c/${CHALLENGE.id}`)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nothing here')
    expect(alert).toHaveTextContent(`No challenge ${CHALLENGE.id}`)

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Recommender systems' })).toBeInTheDocument()
  })

  it('shows the same error state when the server cannot be reached', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')))

    renderAt(`/c/${CHALLENGE.id}`)

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
  })
})
