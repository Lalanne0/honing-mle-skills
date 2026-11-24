import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api, type ApiError, type CreateChallenge, type Level, type Topic } from '../api/client'
import { LEVEL_LABELS, TOPIC_LABELS } from '../api/labels'
import { asApiError } from '../api/useApi'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'
import './start-page.css'

/** What each level asks of an answer, shown on its card. */
const LEVEL_HINTS: Record<Level, string> = {
  junior: 'Get one working system end to end: data, model, serving.',
  mid: 'Own the design and weigh the trade-offs at real scale.',
  senior: 'Set the architecture, the rollout and the risks across teams.',
}

const LEVELS = Object.keys(LEVEL_LABELS) as Level[]
const TOPICS = Object.keys(TOPIC_LABELS) as Topic[]

type Start = { status: 'idle' } | { status: 'starting' } | { status: 'error'; error: ApiError }

/** "Surprise me" is a null topic: the backend picks one at random. */
function toRequest(level: Level, topic: Topic | null): CreateChallenge {
  return topic === null ? { level } : { level, topic }
}

/** The start screen: pick a level and an optional topic, then start a challenge. */
export function StartPage() {
  const [level, setLevel] = useState<Level>('mid')
  const [topic, setTopic] = useState<Topic | null>(null)
  const { start, begin } = useStartChallenge()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    begin(toRequest(level, topic))
  }

  return (
    <section className="page">
      <h1>Practice</h1>
      <p className="page__lead">Pick a level and a topic, then answer an ML system-design challenge in up to three rounds.</p>
      <form className="start__form" onSubmit={onSubmit}>
        <fieldset className="start__fields" disabled={start.status === 'starting'}>
          <LevelPicker value={level} onChange={setLevel} />
          <TopicPicker value={topic} onChange={setTopic} />
          <div className="start__actions">
            <Button type="submit">Start challenge</Button>
          </div>
        </fieldset>
      </form>
      <StartStatus start={start} onRetry={() => begin(toRequest(level, topic))} />
    </section>
  )
}

function LevelPicker({ value, onChange }: { value: Level; onChange: (level: Level) => void }) {
  const headingId = useId()
  return (
    <div className="start__section">
      <h2 id={headingId} className="start__heading">
        Level
      </h2>
      <div role="radiogroup" aria-labelledby={headingId} className="start__levels">
        {LEVELS.map((level) => (
          <label key={level} className="level-card">
            <input
              type="radio"
              name="level"
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              className="level-card__input"
            />
            <span className="level-card__name">{LEVEL_LABELS[level]}</span>
            <span className="level-card__hint">{LEVEL_HINTS[level]}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function TopicPicker({ value, onChange }: { value: Topic | null; onChange: (topic: Topic | null) => void }) {
  const headingId = useId()
  return (
    <div className="start__section">
      <h2 id={headingId} className="start__heading">
        Topic
      </h2>
      <div role="group" aria-labelledby={headingId} className="start__topics">
        <Chip selected={value === null} onSelect={() => onChange(null)}>
          Surprise me
        </Chip>
        {TOPICS.map((topic) => (
          <Chip key={topic} selected={value === topic} onSelect={() => onChange(topic)}>
            {TOPIC_LABELS[topic]}
          </Chip>
        ))}
      </div>
    </div>
  )
}

function StartStatus({ start, onRetry }: { start: Start; onRetry: () => void }) {
  if (start.status === 'starting') return <LoadingState label="Generating your scenario…" />
  if (start.status === 'error') return <ErrorState error={start.error} onRetry={onRetry} />
  return null
}

/**
 * Create a challenge and open it. The request is cancelled if the page goes away
 * before the scenario is ready, so a late reply never navigates.
 */
function useStartChallenge() {
  const [start, setStart] = useState<Start>({ status: 'idle' })
  const navigate = useNavigate()
  const inFlight = useRef<AbortController | null>(null)
  useEffect(() => () => inFlight.current?.abort(), [])

  const begin = (body: CreateChallenge) => {
    const controller = new AbortController()
    inFlight.current = controller
    setStart({ status: 'starting' })
    void api.createChallenge(body, controller.signal).then(
      (challenge) => navigate(`/c/${challenge.id}`),
      (error: unknown) => {
        if (!controller.signal.aborted) setStart({ status: 'error', error: asApiError(error) })
      },
    )
  }
  return { start, begin }
}
