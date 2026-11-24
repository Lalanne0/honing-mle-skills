import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('shows a headline for the kind of failure and the detail as an alert', () => {
    render(<ErrorState error={new ApiError('network', 'The server took too long to answer.')} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Can't reach the server")
    expect(alert).toHaveTextContent('The server took too long to answer.')
  })

  it.each([
    ['not_found', 'Nothing here'],
    ['conflict', "That can't be done right now"],
    ['invalid', "The request wasn't valid"],
    ['model_failed', 'The model call failed'],
    ['busy', 'The model is busy'],
    ['server', 'Something went wrong'],
  ] as const)('headlines a %s error as "%s"', (kind, headline) => {
    render(<ErrorState error={new ApiError(kind, 'detail')} />)

    expect(screen.getByRole('heading', { name: headline })).toBeInTheDocument()
  })

  it('offers a retry when given one', async () => {
    const onRetry = vi.fn()
    render(<ErrorState error={new ApiError('server', 'x')} onRetry={onRetry} />)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has no retry button without a retry action', () => {
    render(<ErrorState error={new ApiError('not_found', 'x')} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
