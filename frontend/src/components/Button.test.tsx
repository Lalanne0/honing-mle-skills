import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('runs its action when clicked', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Start challenge</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Start challenge' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not submit a surrounding form by default', async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent as SubmitEvent)}>
        <Button>Save</Button>
      </form>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('is primary unless asked to be secondary', () => {
    render(
      <>
        <Button>Answer follow-up</Button>
        <Button variant="secondary">Reveal solution</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Answer follow-up' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toHaveAttribute('data-variant', 'secondary')
  })
})
