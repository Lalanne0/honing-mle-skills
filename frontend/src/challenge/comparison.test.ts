import { describe, expect, it } from 'vitest'
import { comparisonRows, finalAnswer } from './comparison'

const RUBRIC = {
  dimensions: [
    { key: 'requirements', name: 'Requirements', weight: 1, full_marks_criteria: 'States SLOs.' },
    { key: 'trade_offs', name: 'Trade-offs', weight: 3, full_marks_criteria: 'Weighs cost and latency.' },
  ],
}
const NOTES = { requirements: 'Clear SLOs.', trade_offs: 'Missed cost.' }

function round(n: number, scores: Record<string, number>) {
  return { n, answer_md: `answer ${n}`, scores, comment: 'c', verdict: { kind: 'complete' as const } }
}

describe('comparisonRows', () => {
  it('pairs each rubric dimension with its note, weight share and last graded score', () => {
    const rounds = [round(1, { requirements: 1, trade_offs: 1 }), round(2, { requirements: 4, trade_offs: 2 })]

    expect(comparisonRows(RUBRIC, NOTES, rounds)).toEqual([
      { key: 'requirements', name: 'Requirements', weightPercent: 25, criteria: 'States SLOs.', score: 4, note: 'Clear SLOs.' },
      { key: 'trade_offs', name: 'Trade-offs', weightPercent: 75, criteria: 'Weighs cost and latency.', score: 2, note: 'Missed cost.' },
    ])
  })

  it('has no score when no round was graded', () => {
    expect(comparisonRows(RUBRIC, NOTES, []).map((row) => row.score)).toEqual([null, null])
  })

  it('rounds weight shares to whole percents', () => {
    const thirds = { dimensions: RUBRIC.dimensions.map((d) => ({ ...d, weight: 1 })).concat({ ...RUBRIC.dimensions[0], key: 'x', weight: 1 }) }

    expect(comparisonRows(thirds, NOTES, []).map((row) => row.weightPercent)).toEqual([33, 33, 33])
  })
})

describe('finalAnswer', () => {
  it('is the answer of the last graded round', () => {
    expect(finalAnswer([round(1, {}), round(2, {})])).toEqual({ round: 2, answer_md: 'answer 2' })
  })

  it('is null when nothing was answered', () => {
    expect(finalAnswer([])).toBeNull()
  })
})
