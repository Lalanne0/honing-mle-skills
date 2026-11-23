import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function stubFetch(response: Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(() => response))
}

describe('App', () => {
  afterEach(() => vi.unstubAllGlobals())

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
})
