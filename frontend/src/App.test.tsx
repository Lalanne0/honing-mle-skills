import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function stubFetch(response: Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(() => response))
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows the backend as up when the health check answers ok', async () => {
    stubFetch(Promise.resolve(new Response(JSON.stringify({ status: 'ok' }))))

    render(<App />)

    expect(await screen.findByText('Backend: ok')).toBeInTheDocument()
  })

  it('shows the backend as unreachable when the request fails', async () => {
    stubFetch(Promise.reject(new TypeError('network down')))

    render(<App />)

    expect(await screen.findByText('Backend: unreachable')).toBeInTheDocument()
  })

  it('shows the backend as unreachable on an error status even if the body says ok', async () => {
    stubFetch(Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 503 })))

    render(<App />)

    expect(await screen.findByText('Backend: unreachable')).toBeInTheDocument()
  })

  it('ignores a late failure from an abandoned StrictMode effect run', async () => {
    let rejectFirst: (reason: unknown) => void = () => {}
    const first = new Promise<Response>((_, reject) => {
      rejectFirst = reject
    })
    const second = Promise.resolve(new Response(JSON.stringify({ status: 'ok' })))
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second))

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    expect(await screen.findByText('Backend: ok')).toBeInTheDocument()

    expect(fetch).toHaveBeenCalledTimes(2)
    await act(async () => {
      rejectFirst(new TypeError('network down'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(screen.getByText('Backend: ok')).toBeInTheDocument()
  })
})
