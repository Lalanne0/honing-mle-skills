import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, type ChallengeSummary, type HistoryFilters, type Level, type Topic, type TopicStats } from '../api/client'
import { LEVEL_LABELS, TOPIC_LABELS } from '../api/labels'
import { useApi } from '../api/useApi'
import { dimensionName } from '../challenge/grading'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
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
  type TopicRow,
} from '../history/stats'
import './history-page.css'

const LEVELS = Object.keys(LEVEL_LABELS) as Level[]
const TOPICS = Object.keys(TOPIC_LABELS) as Topic[]
const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** Past challenges and where you are weak: the Focus next card, a bar per topic, and the filterable history. */
export function HistoryPage() {
  const { state, retry } = useApi('stats', (signal) => api.getStats(signal))

  return (
    <section className="history">
      <h1>History</h1>
      {state.status === 'loading' && <LoadingState label="Loading your stats…" />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={retry} />}
      {state.status === 'ok' && <Overview stats={state.data} />}
    </section>
  )
}

/** Stats list every attempted topic, so no stats means no challenge yet. */
function Overview({ stats }: { stats: TopicStats[] }) {
  if (stats.length === 0) return <FirstUse />
  return (
    <>
      <div className="history__overview">
        <FocusNext stats={stats} />
        <Card title="By topic">
          <TopicBars rows={topicRows(stats)} />
        </Card>
      </div>
      <PastChallenges />
    </>
  )
}

function FirstUse() {
  return (
    <div className="state history__empty">
      <h2 className="state__headline">No challenges yet</h2>
      <p className="state__text">
        Your past challenges, a score for each topic and what to focus on next will show up here once you start practising.
      </p>
      <Link to="/" className="btn" data-variant="primary">
        Start your first challenge
      </Link>
    </div>
  )
}

function FocusNext({ stats }: { stats: TopicStats[] }) {
  const focus = focusNext(stats)
  return (
    <Card title="Focus next">
      {focus === null ? (
        <p className="focus__text">Answer a round to see which topic and dimensions need the most work.</p>
      ) : (
        <div className="focus">
          <p className="focus__topic">{TOPIC_LABELS[focus.topic]}</p>
          <p className="focus__text">{points(focus.averageScore)}/100 average</p>
          {focus.dimensions.length > 0 && (
            <>
              <p className="focus__label">Weakest dimensions</p>
              <ul className="focus__dimensions">
                {focus.dimensions.map((dimension) => (
                  <li key={dimension.key} className="focus__dimension">
                    <span>{dimensionName(dimension.key)}</span>
                    <span className="focus__score">{dimensionAverage(dimension.average_score)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function TopicBars({ rows }: { rows: TopicRow[] }) {
  return (
    <ul className="bars" aria-label="Score by topic">
      {rows.map((row) => (
        <TopicBar key={row.topic} row={row} />
      ))}
    </ul>
  )
}

function TopicBar({ row: { topic, stats } }: { row: TopicRow }) {
  const nameId = useId()
  const score = stats?.average_score ?? null
  return (
    <li className="bar" data-tried={stats !== null}>
      <span id={nameId} className="bar__name">
        {TOPIC_LABELS[topic]}
      </span>
      {score === null ? (
        <span className="bar__track" aria-hidden="true" />
      ) : (
        <span
          className="bar__track"
          role="meter"
          aria-labelledby={nameId}
          aria-valuenow={Math.round(score)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="bar__fill" style={{ width: `${score}%` }} />
        </span>
      )}
      <span className="bar__detail">
        <span>{barDetail(stats)}</span>
        {stats?.trend != null && <span className="bar__trend">{trendLabel(stats.trend)}</span>}
      </span>
    </li>
  )
}

function barDetail(stats: TopicStats | null): string {
  if (stats === null) return 'Not tried yet'
  const attempts = attemptsLabel(stats.attempts)
  return stats.average_score === null ? `Not graded yet · ${attempts}` : `${points(stats.average_score)} avg · ${attempts}`
}

function PastChallenges() {
  const [params, setParams] = useSearchParams()
  const filters = parseFilters(params)
  const key = `${filters.topic}:${filters.level}`
  const { state, retry } = useApi(key, (signal) => api.listChallenges(filters, signal))
  const headingId = useId()

  const setFilter = (name: keyof HistoryFilters, value: string) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(name, value)
      else next.delete(name)
      return next
    })

  return (
    <section className="past" aria-labelledby={headingId}>
      <div className="past__header">
        <h2 id={headingId} className="past__heading">
          Past challenges
        </h2>
        <div className="past__filters">
          <FilterSelect label="Topic" any="All topics" value={filters.topic} options={TOPICS} labels={TOPIC_LABELS} onChange={(v) => setFilter('topic', v)} />
          <FilterSelect label="Level" any="All levels" value={filters.level} options={LEVELS} labels={LEVEL_LABELS} onChange={(v) => setFilter('level', v)} />
        </div>
      </div>
      {state.status === 'loading' && <LoadingState label="Loading your history…" />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={retry} />}
      {state.status === 'ok' && <HistoryList challenges={state.data} labelledBy={headingId} onClear={() => setParams({})} />}
    </section>
  )
}

type FilterSelectProps<T extends string> = {
  label: string
  any: string
  value: T | null
  options: T[]
  labels: Record<T, string>
  onChange: (value: string) => void
}

function FilterSelect<T extends string>({ label, any, value, options, labels, onChange }: FilterSelectProps<T>) {
  const id = useId()
  return (
    <div className="filter">
      <label htmlFor={id} className="filter__label">
        {label}
      </label>
      <select id={id} className="filter__select" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">{any}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  )
}

type HistoryListProps = { challenges: ChallengeSummary[]; labelledBy: string; onClear: () => void }

function HistoryList({ challenges, labelledBy, onClear }: HistoryListProps) {
  if (challenges.length === 0) {
    return (
      <div className="state">
        <p className="state__text">No challenges match these filters.</p>
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    )
  }
  return (
    <ul className="past__list" aria-labelledby={labelledBy}>
      {challenges.map((challenge) => (
        <li key={challenge.id}>
          <HistoryRow challenge={challenge} />
        </li>
      ))}
    </ul>
  )
}

function HistoryRow({ challenge }: { challenge: ChallengeSummary }) {
  const finished = challenge.state.kind !== 'awaiting'
  return (
    <Link to={`/c/${challenge.id}`} className="row">
      <span className="row__main">
        <span className="row__title">{TOPIC_LABELS[challenge.topic]}</span>
        <span className="row__scenario">{excerpt(challenge.scenario_md)}</span>
        <span className="row__meta">
          {LEVEL_LABELS[challenge.level]} · <time dateTime={challenge.created_at}>{DATE.format(new Date(challenge.created_at))}</time>
        </span>
      </span>
      <span className="row__state" data-finished={finished}>
        {stateLabel(challenge.state)}
      </span>
      <span className="row__score" data-scored={challenge.score !== null}>
        {challenge.score === null ? (
          'No score'
        ) : (
          <>
            {points(challenge.score)}
            <span className="row__out-of">/100</span>
          </>
        )}
      </span>
    </Link>
  )
}
