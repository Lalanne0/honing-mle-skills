import { describe, expect, it } from 'vitest'
import { dimensionName, feedbackTone, sheetHeadline, wordCount } from './grading'

describe('dimensionName', () => {
  it('turns a rubric key into a display name', () => {
    expect(dimensionName('trade_offs')).toBe('Trade offs')
    expect(dimensionName('requirements')).toBe('Requirements')
  })
})

describe('feedbackTone', () => {
  it('is strong when the mean score is 4 or more', () => {
    expect(feedbackTone({ a: 4, b: 4 })).toBe('strong')
    expect(feedbackTone({ a: 5, b: 3 })).toBe('strong')
  })

  it('is partial below a mean of 4', () => {
    expect(feedbackTone({ a: 4, b: 3 })).toBe('partial')
    expect(feedbackTone({})).toBe('partial')
  })
})

describe('sheetHeadline', () => {
  it('celebrates a completed challenge whatever the tone', () => {
    expect(sheetHeadline('complete', 'partial')).toBe('Challenge complete!')
    expect(sheetHeadline('complete', 'strong')).toBe('Challenge complete!')
  })

  it('names the tone of a follow-up', () => {
    expect(sheetHeadline('follow_up', 'strong')).toBe('Solid design!')
    expect(sheetHeadline('follow_up', 'partial')).toBe('Getting there')
  })
})

describe('wordCount', () => {
  it('counts words separated by any whitespace', () => {
    expect(wordCount('  one two\nthree\t four ')).toBe(4)
  })

  it('is zero for blank text', () => {
    expect(wordCount('   \n')).toBe(0)
  })
})
