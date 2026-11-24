import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from './draft'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('draft', () => {
  it('keeps one draft per challenge and round', () => {
    saveDraft('a', 1, 'first answer')
    saveDraft('a', 2, 'second answer')
    saveDraft('b', 1, 'other challenge')

    expect(loadDraft('a', 1)).toBe('first answer')
    expect(loadDraft('a', 2)).toBe('second answer')
    expect(loadDraft('b', 1)).toBe('other challenge')
  })

  it('is empty when nothing was saved', () => {
    expect(loadDraft('a', 1)).toBe('')
  })

  it('is gone once cleared', () => {
    saveDraft('a', 1, 'answer')
    clearDraft('a', 1)

    expect(loadDraft('a', 1)).toBe('')
    expect(localStorage.length).toBe(0)
  })

  it('removes the entry instead of storing an empty draft', () => {
    saveDraft('a', 1, 'answer')
    saveDraft('a', 1, '')

    expect(localStorage.length).toBe(0)
  })

  it('never throws when storage is unavailable', () => {
    const broken = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(broken)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(broken)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(broken)

    expect(() => saveDraft('a', 1, 'answer')).not.toThrow()
    expect(() => clearDraft('a', 1)).not.toThrow()
    expect(loadDraft('a', 1)).toBe('')
  })
})
