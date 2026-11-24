import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../router'

const CHALLENGE = {
  id: '6f1c2b1e-0000-4000-8000-000000000002',
  level: 'junior',
  topic: 'feature_stores',
  scenario_md: 'Design a feature store for a food-delivery app.',
  state: { kind: 'awaiting', round: 1 },
  rounds: [],
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

function stubFetch(...replies: Array<() => Promise<Response>>) {
  const fetchMock = vi.fn()
  for (const reply of replies) fetchMock.mockImplementationOnce(reply)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderStart() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  return router
}

const levelGroup = () => screen.getByRole('radiogroup', { name: 'Level' })
const topicGroup = () => screen.getByRole('group', { name: 'Topic' })
const startButton = () => screen.getByRole('button', { name: 'Start challenge' })
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
  JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) as unknown

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('start screen', () => {
  it('offers three levels with Mid picked, and every topic with Surprise me picked', () => {
    renderStart()

    const levels = within(levelGroup()).getAllByRole('radio')
    expect(levels.map((radio) => radio.getAttribute('value'))).toEqual(['junior', 'mid', 'senior'])
    expect(within(levelGroup()).getByRole('radio', { name: /^Mid/ })).toBeChecked()

    const chips = within(topicGroup()).getAllByRole('button')
    expect(chips).toHaveLength(11)
    expect(chips[0]).toHaveAccessibleName('Surprise me')
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('keeps one topic picked at a time, and can go back to Surprise me', async () => {
    renderStart()
    const chip = (name: string) => within(topicGroup()).getByRole('button', { name })

    await userEvent.click(chip('Model serving'))
    expect(chip('Model serving')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Surprise me')).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(chip('Surprise me'))
    expect(chip('Surprise me')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Model serving')).toHaveAttribute('aria-pressed', 'false')
  })

  it('starts a challenge at the picked level and topic, shows loading, then opens it', async () => {
    let reply!: (response: Response) => void
    const fetchMock = stubFetch(() => new Promise((resolve) => (reply = resolve)), json(CHALLENGE))
    const router = renderStart()

    await userEvent.click(within(levelGroup()).getByRole('radio', { name: /^Junior/ }))
    await userEvent.click(within(topicGroup()).getByRole('button', { name: 'Feature stores' }))
    await userEvent.click(startButton())

    expect(fetchMock.mock.calls[0][0]).toBe('/api/challenges')
    expect(sentBody(fetchMock)).toEqual({ level: 'junior', topic: 'feature_stores' })
    expect(screen.getByRole('status')).toHaveTextContent('Generating your scenario…')
    expect(startButton()).toBeDisabled()

    reply(new Response(JSON.stringify(CHALLENGE), { status: 201 }))

    expect(await screen.findByText(CHALLENGE.scenario_md)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/c/${CHALLENGE.id}`)
  })

  it('leaves the topic out when Surprise me is picked', async () => {
    const fetchMock = stubFetch(json(CHALLENGE, 201), json(CHALLENGE))
    renderStart()

    await userEvent.click(startButton())

    expect(sentBody(fetchMock)).toEqual({ level: 'mid' })
  })

  it('shows the error and keeps the picks when starting fails, then starts again on retry', async () => {
    const fetchMock = stubFetch(
      json({ detail: 'The model gave an invalid reply twice.' }, 502),
      json(CHALLENGE, 201),
      json(CHALLENGE),
    )
    const router = renderStart()

    await userEvent.click(within(levelGroup()).getByRole('radio', { name: /^Senior/ }))
    await userEvent.click(startButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The model call failed')
    expect(alert).toHaveTextContent('The model gave an invalid reply twice.')
    expect(within(levelGroup()).getByRole('radio', { name: /^Senior/ })).toBeChecked()
    expect(startButton()).toBeEnabled()

    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(sentBody(fetchMock, 1)).toEqual({ level: 'senior' })
    expect(await screen.findByText(CHALLENGE.scenario_md)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/c/${CHALLENGE.id}`)
  })

  it('cancels the request when the user leaves before the scenario is ready', async () => {
    const fetchMock = vi.fn(
      (_path: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderStart()

    await userEvent.click(startButton())
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal
    expect(signal.aborted).toBe(false)

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'History' }))

    expect(signal.aborted).toBe(true)
    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
