import { describe, expect, it } from 'vitest'
import type { TopicStats } from '../api/client'
import { TOPIC_LABELS } from '../api/labels'
import {
  attemptsLabel,
  dimensionAverage,
  excerpt,
  focusNext,
  parseFilters,
  points,
  stateLabel,
  topicRows,
  trendLabel,
} from './stats'

function stats(topic: TopicStats['topic'], average_score: number | null, extra: Partial<TopicStats> = {}): TopicStats {
  return { topic, attempts: 1, graded: average_score === null ? 0 : 1, average_score, trend: null, weakest_dimensions: [], ...extra }
}

describe('topicRows', () => {
  it('lists every topic as not tried when there are no stats', () => {
    const rows = topicRows([])

    expect(rows.map((row) => row.topic)).toEqual(Object.keys(TOPIC_LABELS))
    expect(rows.every((row) => row.stats === null)).toBe(true)
  })

  it('keeps the attempted topics in the order given, weakest first, then the untried ones in topic order', () => {
    const given = [stats('feature_stores', 40), stats('model_serving', 80), stats('data_pipelines', null)]

    const rows = topicRows(given)

    expect(rows.slice(0, 3).map((row) => row.stats)).toEqual(given)
    expect(rows.slice(3).map((row) => row.topic)).toEqual([
      'rag_and_llm_apps',
      'batch_vs_streaming_inference',
      'training_pipelines',
      'mlops_monitoring_and_drift',
      'recommender_systems',
      'ab_testing_and_experimentation',
      'privacy_and_security',
    ])
  })
})

describe('focusNext', () => {
  it('names the weakest graded topic and its weakest dimensions', () => {
    const weakest = [{ key: 'trade_offs', average_score: 1.5 }]
    const given = [stats('feature_stores', 40, { weakest_dimensions: weakest }), stats('model_serving', 80)]

    expect(focusNext(given)).toEqual({ topic: 'feature_stores', averageScore: 40, dimensions: weakest })
  })

  it('skips topics with nothing graded', () => {
    expect(focusNext([stats('data_pipelines', null), stats('model_serving', 80)])?.topic).toBe('model_serving')
  })

  it('has nothing to suggest before any round is graded', () => {
    expect(focusNext([stats('data_pipelines', null)])).toBeNull()
    expect(focusNext([])).toBeNull()
  })
})

describe('stateLabel', () => {
  it.each([
    [{ kind: 'awaiting', round: 2 } as const, 'Round 2 of 3'],
    [{ kind: 'completed' } as const, 'Completed'],
    [{ kind: 'revealed' } as const, 'Revealed'],
  ])('labels %o as %s', (state, label) => {
    expect(stateLabel(state)).toBe(label)
  })
})

describe('parseFilters', () => {
  it('reads a known topic and level', () => {
    expect(parseFilters(new URLSearchParams('topic=model_serving&level=senior'))).toEqual({
      topic: 'model_serving',
      level: 'senior',
    })
  })

  it('ignores missing and unknown values', () => {
    expect(parseFilters(new URLSearchParams('topic=astrology&level=intern'))).toEqual({ topic: null, level: null })
    expect(parseFilters(new URLSearchParams(''))).toEqual({ topic: null, level: null })
  })

  it('ignores names inherited from Object', () => {
    expect(parseFilters(new URLSearchParams('topic=toString&level=constructor'))).toEqual({ topic: null, level: null })
  })
})

describe('excerpt', () => {
  it('takes the first line of text without markdown marks', () => {
    expect(excerpt('# Ride pricing\n\nDesign **surge** pricing.')).toBe('Ride pricing')
    expect(excerpt('\n\n- *Design* a `feature` store\nmore')).toBe('Design a feature store')
  })

  it('cuts a long line on a word and adds an ellipsis', () => {
    const line = 'word '.repeat(40).trim()

    const cut = excerpt(line)

    expect(cut.length).toBeLessThanOrEqual(121)
    expect(cut.endsWith('word…')).toBe(true)
  })

  it('keeps a line that fits', () => {
    expect(excerpt('Short scenario.')).toBe('Short scenario.')
  })
})

describe('formatters', () => {
  it('rounds a weighted score to whole points', () => {
    expect(points(41.6)).toBe('42')
    expect(points(41.4)).toBe('41')
  })

  it('shows a dimension average with at most one decimal', () => {
    expect(dimensionAverage(1.5)).toBe('1.5/5')
    expect(dimensionAverage(2)).toBe('2/5')
    expect(dimensionAverage(2.333)).toBe('2.3/5')
  })

  it('signs a trend in points, with a true minus', () => {
    expect(trendLabel(5.2)).toBe('+5 pts')
    expect(trendLabel(-4.6)).toBe('−5 pts')
    expect(trendLabel(0.2)).toBe('±0 pts')
  })

  it('counts attempts', () => {
    expect(attemptsLabel(1)).toBe('1 attempt')
    expect(attemptsLabel(3)).toBe('3 attempts')
  })
})

it('cuts a single long word without losing it', () => {
  expect(excerpt('x'.repeat(200))).toBe(`${'x'.repeat(120)}…`)
})
