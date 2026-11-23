import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeedbackSheet } from './FeedbackSheet'

describe('FeedbackSheet', () => {
  it('announces the headline and message when open', () => {
    render(
      <FeedbackSheet open tone="partial" headline="Getting there" actionLabel="Answer follow-up" onAction={() => {}}>
        How would you keep the feed fresh?
      </FeedbackSheet>,
    )

    const sheet = screen.getByRole('status')
    expect(sheet).toHaveTextContent('Getting there')
    expect(sheet).toHaveTextContent('How would you keep the feed fresh?')
    expect(sheet).toHaveAttribute('data-tone', 'partial')
  })

  it('runs its one primary action', async () => {
    const onAction = vi.fn()
    render(
      <FeedbackSheet open tone="strong" headline="Solid design!" actionLabel="See reference" onAction={onAction}>
        Covers the main tradeoffs.
      </FeedbackSheet>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'See reference' }))

    expect(onAction).toHaveBeenCalledOnce()
  })

  it('renders nothing when closed', () => {
    render(
      <FeedbackSheet open={false} tone="strong" headline="Solid design!" actionLabel="See reference" onAction={() => {}}>
        Hidden.
      </FeedbackSheet>,
    )

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
