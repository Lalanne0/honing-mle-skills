import { useState, type ReactNode } from 'react'
import { ApiError } from '../api/client'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { Chip } from '../components/Chip'
import { ErrorState } from '../components/ErrorState'
import { FeedbackSheet } from '../components/FeedbackSheet'
import { LoadingState } from '../components/LoadingState'
import { ProgressPips } from '../components/ProgressPips'
import { ScoreBar } from '../components/ScoreBar'
import './design-page.css'

type Theme = 'light' | 'dark'
type Tone = 'strong' | 'partial'

const TOPICS = ['Surprise me', 'Recommender systems', 'Model serving', 'Feature stores']

const SHEETS = {
  strong: {
    headline: 'Solid design!',
    actionLabel: 'See reference',
    body: 'Your two-tower retrieval and re-ranker cover the main tradeoffs.',
  },
  partial: {
    headline: 'Getting there',
    actionLabel: 'Answer follow-up',
    body: 'How would you keep the feed fresh within 5 minutes of a breaking story?',
  },
} as const

function ThemeSwitch() {
  const choose = (theme: Theme) => {
    document.documentElement.dataset.theme = theme
  }
  return (
    <div className="design__themes">
      <Button variant="secondary" onClick={() => choose('light')}>
        Light theme
      </Button>
      <Button variant="secondary" onClick={() => choose('dark')}>
        Dark theme
      </Button>
    </div>
  )
}

function Specimen({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="design__specimen">
      <h2>{name}</h2>
      <div className="design__row">{children}</div>
    </section>
  )
}

export function DesignPage() {
  const [topic, setTopic] = useState(TOPICS[0])
  const [sheet, setSheet] = useState<Tone | null>(null)
  const shown = SHEETS[sheet ?? 'strong']

  return (
    <main className="design">
      <header className="design__header">
        <h1>Field Notes</h1>
        <p>The design tokens and base components for honing-mle-skills.</p>
        <ThemeSwitch />
      </header>

      <Specimen name="Button">
        <Button>Start challenge</Button>
        <Button variant="secondary">Reveal solution</Button>
        <Button disabled>Submit answer</Button>
      </Specimen>

      <Specimen name="Chip">
        {TOPICS.map((t) => (
          <Chip key={t} selected={t === topic} onSelect={() => setTopic(t)}>
            {t}
          </Chip>
        ))}
      </Specimen>

      <Specimen name="ProgressPips">
        <ProgressPips round={1} complete={false} />
        <ProgressPips round={2} complete={false} />
        <ProgressPips round={2} complete />
      </Specimen>

      <Specimen name="ScoreBar">
        <div className="design__stack">
          <ScoreBar name="Problem framing" score={4} comment="Clear objective and good guardrail metrics." />
          <ScoreBar name="Serving and latency" score={2} comment="No candidate-generation stage, so 150 ms p99 is at risk." />
          <ScoreBar name="Monitoring and drift" score={0} comment="Not covered yet." />
        </div>
      </Specimen>

      <Specimen name="Card">
        <Card title="Design the home-feed recommender for a news app with 40M daily users">
          <ProgressPips round={2} complete={false} />
          <p className="design__prose">
            Readers open the app about three times a day. Rank 500 fresh articles per user within 150 ms at p99, and keep
            editorial picks in the top five.
          </p>
        </Card>
      </Specimen>

      <Specimen name="LoadingState">
        <LoadingState label="Loading the challenge…" />
      </Specimen>

      <Specimen name="ErrorState">
        <ErrorState error={new ApiError('network', 'The server took too long to answer.')} onRetry={() => {}} />
      </Specimen>

      <Specimen name="FeedbackSheet">
        <Button variant="secondary" onClick={() => setSheet('strong')}>
          Show strong feedback
        </Button>
        <Button variant="secondary" onClick={() => setSheet('partial')}>
          Show partial feedback
        </Button>
      </Specimen>

      <FeedbackSheet
        open={sheet !== null}
        tone={sheet ?? 'strong'}
        headline={shown.headline}
        actionLabel={shown.actionLabel}
        onAction={() => setSheet(null)}
      >
        {shown.body}
      </FeedbackSheet>
    </main>
  )
}
