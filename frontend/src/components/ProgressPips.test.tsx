import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressPips } from './ProgressPips'

function pipStates(): (string | null)[] {
  return [...screen.getByRole('img').querySelectorAll('[data-state]')].map((p) => p.getAttribute('data-state'))
}

describe('ProgressPips', () => {
  it('marks earlier rounds graded and the current round active', () => {
    render(<ProgressPips round={2} complete={false} />)

    expect(screen.getByRole('img', { name: 'Round 2 of 3' })).toBeInTheDocument()
    expect(screen.getByText('Round 2/3')).toBeInTheDocument()
    expect(pipStates()).toEqual(['graded', 'current', 'upcoming'])
  })

  it('marks the last answered round graded once the challenge is complete', () => {
    render(<ProgressPips round={1} complete />)

    expect(screen.getByRole('img', { name: 'Complete after 1 of 3 rounds' })).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(pipStates()).toEqual(['graded', 'upcoming', 'upcoming'])
  })
})
