import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'

describe('Chip', () => {
  it('reports whether it is selected', () => {
    render(
      <>
        <Chip selected onSelect={() => {}}>Surprise me</Chip>
        <Chip selected={false} onSelect={() => {}}>Model serving</Chip>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Surprise me' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Model serving' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('asks to be selected when clicked', async () => {
    const onSelect = vi.fn()
    render(<Chip selected={false} onSelect={onSelect}>Feature stores</Chip>)

    await userEvent.click(screen.getByRole('button', { name: 'Feature stores' }))

    expect(onSelect).toHaveBeenCalledOnce()
  })
})
