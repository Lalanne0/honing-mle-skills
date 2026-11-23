import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DesignPage } from './DesignPage'

describe('DesignPage', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('shows every base component', () => {
    render(<DesignPage />)

    for (const name of ['Button', 'Card', 'Chip', 'ScoreBar', 'ProgressPips', 'FeedbackSheet']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('meter').length).toBeGreaterThan(0)
  })

  it('switches between light and dark themes', async () => {
    render(<DesignPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(document.documentElement.dataset.theme).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('selects one topic chip at a time', async () => {
    render(<DesignPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Model serving' }))

    expect(screen.getByRole('button', { name: 'Model serving' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Surprise me' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('opens each feedback sheet and closes it from its action', async () => {
    render(<DesignPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Show partial feedback' }))
    const sheet = screen.getByRole('status')
    expect(sheet).toHaveTextContent('Getting there')

    await userEvent.click(within(sheet).getByRole('button', { name: 'Answer follow-up' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Show strong feedback' }))
    expect(screen.getByRole('status')).toHaveTextContent('Solid design!')
  })
})
