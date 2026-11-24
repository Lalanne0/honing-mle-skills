/** How the history and topic stats are shown. Pure functions over what the API sends. */
import type { DimensionStat, HistoryFilters, Level, State, Topic, TopicStats } from '../api/client'
import { LEVEL_LABELS, TOPIC_LABELS } from '../api/labels'

/** MAX_ROUNDS in docs/glossary.md. */
export const MAX_ROUNDS = 3

const TOPICS = Object.keys(TOPIC_LABELS) as Topic[]

/** One bar on the stats page. `stats` is null for a topic never tried. */
export type TopicRow = { topic: Topic; stats: TopicStats | null }

/** Every topic: the attempted ones in the order given (weakest first), then the untried ones in topic order. */
export function topicRows(stats: readonly TopicStats[]): TopicRow[] {
  const tried = new Set(stats.map((s) => s.topic))
  const untried = TOPICS.filter((topic) => !tried.has(topic)).map((topic) => ({ topic, stats: null }))
  return [...stats.map((s) => ({ topic: s.topic, stats: s })), ...untried]
}

export type Focus = { topic: Topic; averageScore: number; dimensions: DimensionStat[] }

/** The weakest topic with a graded round, and its weakest dimensions. Null before anything is graded. */
export function focusNext(stats: readonly TopicStats[]): Focus | null {
  for (const { topic, average_score, weakest_dimensions } of stats) {
    if (average_score !== null) return { topic, averageScore: average_score, dimensions: weakest_dimensions }
  }
  return null
}

const FINISHED_LABELS = { completed: 'Completed', revealed: 'Revealed' } as const

export function stateLabel(state: State): string {
  return state.kind === 'awaiting' ? `Round ${state.round} of ${MAX_ROUNDS}` : FINISHED_LABELS[state.kind]
}

function oneOf<T extends string>(labels: Record<T, string>, value: string | null): T | null {
  return value !== null && Object.hasOwn(labels, value) ? (value as T) : null
}

/** The history filters from the address bar. An unknown value means no filter. */
export function parseFilters(params: URLSearchParams): HistoryFilters {
  return {
    topic: oneOf<Topic>(TOPIC_LABELS, params.get('topic')),
    level: oneOf<Level>(LEVEL_LABELS, params.get('level')),
  }
}

const EXCERPT_LENGTH = 120
const MARKS = /^[\s#>*+-]+|[*_`]/g

/** The scenario's first line of text, without markdown marks, cut on a word to fit a history row. */
export function excerpt(markdown: string): string {
  const line = markdown.split('\n').find((text) => text.trim()) ?? ''
  const text = line.replace(MARKS, '').trim()
  if (text.length <= EXCERPT_LENGTH) return text
  const cut = text.slice(0, EXCERPT_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

/** MAX_SCORE in docs/glossary.md. */
const MAX_SCORE = 5

/** A weighted score (0 to 100) in whole points. */
export function points(score: number): string {
  return String(Math.round(score))
}

/** A dimension's average score, out of MAX_SCORE, to one decimal at most. */
export function dimensionAverage(score: number): string {
  return `${Math.round(score * 10) / 10}/${MAX_SCORE}`
}

/** A trend in whole points, signed, with a true minus sign. */
export function trendLabel(trend: number): string {
  const rounded = Math.round(trend)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded)} pts`
}

export function attemptsLabel(attempts: number): string {
  return attempts === 1 ? '1 attempt' : `${attempts} attempts`
}
