import { describe, expect, it } from 'vitest'
import { pageFor } from './routes'

describe('pageFor', () => {
  it('serves the design demo on /design, with or without a trailing slash', () => {
    expect(pageFor('/design')).toBe('design')
    expect(pageFor('/design/')).toBe('design')
  })

  it('serves the app everywhere else', () => {
    expect(pageFor('/')).toBe('app')
    expect(pageFor('/designs')).toBe('app')
  })
})
