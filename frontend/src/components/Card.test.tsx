import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('shows its content inside a titled section', () => {
    render(
      <Card title="Design a feature store">
        <p>40M daily users</p>
      </Card>,
    )

    const section = screen.getByRole('region', { name: 'Design a feature store' })
    expect(section).toHaveTextContent('40M daily users')
  })
})
