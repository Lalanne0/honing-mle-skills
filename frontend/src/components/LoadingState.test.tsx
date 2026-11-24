import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  it('announces what is loading as a polite status', () => {
    render(<LoadingState label="Loading the challenge…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading the challenge…')
  })

  it('says "Loading…" by default', () => {
    render(<LoadingState />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })
})
