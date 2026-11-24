import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoreBar } from './ScoreBar'

describe('ScoreBar', () => {
  it('shows the dimension, its score out of 5 and the comment', () => {
    render(<ScoreBar name="Serving and latency" score={2} comment="No candidate-generation stage." />)

    expect(screen.getByText('Serving and latency')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByText('No candidate-generation stage.')).toBeInTheDocument()
  })

  it('exposes the score as a meter from 0 to 5', () => {
    render(<ScoreBar name="Problem framing" score={4} comment="Clear objective." />)

    const meter = screen.getByRole('meter', { name: 'Problem framing' })
    expect(meter).toHaveAttribute('aria-valuenow', '4')
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '5')
  })

  it('fills one segment per point', () => {
    render(<ScoreBar name="Data" score={3} comment="Ok." />)

    const segments = screen.getByRole('meter').querySelectorAll('[data-filled]')
    expect([...segments].map((s) => s.getAttribute('data-filled'))).toEqual(['true', 'true', 'true', 'false', 'false'])
  })

  it('leaves the comment out when there is none', () => {
    const { container } = render(<ScoreBar name="Data" score={3} />)

    expect(container.querySelector('.score__comment')).toBeNull()
  })
})
