import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api, type AnswerGraded, type ChallengePublic, type ChallengeRevealed, type Round } from '../api/client'
import { LEVEL_LABELS, TOPIC_LABELS } from '../api/labels'
import { useAction, type ActionStatus } from '../api/useAction'
import { useApi } from '../api/useApi'
import { clearDraft, loadDraft, saveDraft } from '../challenge/draft'
import { dimensionName, feedbackTone, sheetHeadline, wordCount } from '../challenge/grading'
import { Button } from '../components/Button'
import { ErrorState } from '../components/ErrorState'
import { FeedbackSheet } from '../components/FeedbackSheet'
import { LoadingState } from '../components/LoadingState'
import { Markdown } from '../components/Markdown'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { ProgressPips, type Round as PipRound } from '../components/ProgressPips'
import { ScoreBar, type Score } from '../components/ScoreBar'
import { RevealView } from './RevealView'
import './challenge-page.css'

type Challenge = ChallengePublic | ChallengeRevealed

/** The practice screen: read the scenario, answer, get graded, answer follow-ups. */
export function ChallengePage() {
  const { id = '' } = useParams()
  const { state, retry } = useApi(id, (signal) => api.getChallenge(id, signal))

  if (state.status === 'loading') return <LoadingState label="Loading the challenge…" />
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />
  return <ChallengeView key={state.data.id} initial={state.data} />
}

function isRevealed(challenge: Challenge): challenge is ChallengeRevealed {
  return 'reference_md' in challenge
}

/** A challenge revealed before any answer has no rounds to show progress for. */
function hasProgress(challenge: Challenge): boolean {
  return challenge.state.kind === 'awaiting' || challenge.rounds.length > 0
}

/** The round the pips point at: the one awaited, or the last one graded. */
function pipRound(challenge: Challenge): PipRound {
  const round = challenge.state.kind === 'awaiting' ? challenge.state.round : Math.max(1, challenge.rounds.length)
  return round as PipRound
}

function ChallengeView({ initial }: { initial: Challenge }) {
  const [challenge, setChallenge] = useState<Challenge>(initial)
  const [graded, setGraded] = useState<Round | null>(null)
  const [confirming, setConfirming] = useState(false)
  // A revealed challenge takes no more answers, so an unsent draft has nowhere to go.
  const onRevealed = (revealed: ChallengeRevealed) => {
    if (challenge.state.kind === 'awaiting') clearDraft(challenge.id, challenge.state.round)
    setChallenge(revealed)
  }
  const reveal = useAction((_: void, signal) => api.revealChallenge(challenge.id, signal), onRevealed)

  const onGraded = ({ round, state }: AnswerGraded) => {
    setChallenge((current) => ({ ...current, rounds: [...current.rounds, round], state }))
    setGraded(round)
  }
  const seeReference = () => {
    setGraded(null)
    reveal.run()
  }
  // Revealing ends the challenge, so ask first while there are answers left to give.
  const askToReveal = () => (challenge.state.kind === 'awaiting' ? setConfirming(true) : reveal.run())
  const confirmReveal = () => {
    setConfirming(false)
    reveal.run()
  }

  return (
    <article className="challenge">
      <header className="challenge__header">
        <div className="challenge__title">
          <p className="page__eyebrow">{LEVEL_LABELS[challenge.level]}</p>
          <h1>{TOPIC_LABELS[challenge.topic]}</h1>
        </div>
        {hasProgress(challenge) && (
          <ProgressPips round={pipRound(challenge)} complete={challenge.state.kind !== 'awaiting'} />
        )}
        <div className="challenge__actions">
          {!isRevealed(challenge) && (
            <Button variant="secondary" onClick={askToReveal} disabled={reveal.state.status === 'running'}>
              Reveal solution
            </Button>
          )}
          {/* Once revealed there is nothing left to do here, so starting over becomes the main action. */}
          <Link to="/" className="btn" data-variant={isRevealed(challenge) ? 'primary' : 'secondary'}>
            New challenge
          </Link>
        </div>
      </header>
      {confirming && <RevealConfirm onConfirm={confirmReveal} onCancel={() => setConfirming(false)} />}
      <ActionStatusView state={reveal.state} running="Revealing the solution…" onRetry={() => reveal.run()} />
      {isRevealed(challenge) ? (
        <>
          <RevealView challenge={challenge} />
          <Brief challenge={challenge} />
        </>
      ) : (
        <div className="challenge__split">
          <Brief challenge={challenge} />
          <section className="challenge__work" aria-label="Your work">
            <Workspace challenge={challenge} onGraded={onGraded} onSeeReference={seeReference} />
          </section>
        </div>
      )}
      <GradeSheet round={graded} onFollowUp={() => setGraded(null)} onSeeReference={seeReference} />
    </article>
  )
}

function Brief({ challenge }: { challenge: Challenge }) {
  return (
    <section className="challenge__brief" aria-label="Scenario">
      <h2 className="challenge__heading">Scenario</h2>
      <Markdown>{challenge.scenario_md}</Markdown>
      <PastRounds rounds={challenge.rounds} />
    </section>
  )
}

type WorkspaceProps = { challenge: Challenge; onGraded: (result: AnswerGraded) => void; onSeeReference: () => void }

function Workspace({ challenge, onGraded, onSeeReference }: WorkspaceProps) {
  if (challenge.state.kind !== 'awaiting') {
    return (
      <div className="panel">
        <h2 className="challenge__heading">Challenge complete</h2>
        <p>Every round is graded. Compare your answers with the reference solution, or start a new challenge.</p>
        <Button onClick={onSeeReference}>See reference</Button>
      </div>
    )
  }
  const round = challenge.state.round
  return (
    <AnswerPanel
      key={round}
      challengeId={challenge.id}
      round={round}
      question={followUpQuestion(challenge.rounds.at(-1))}
      onGraded={onGraded}
    />
  )
}

function followUpQuestion(round: Round | undefined): string | null {
  return round?.verdict.kind === 'follow_up' ? round.verdict.question : null
}

type AnswerPanelProps = {
  challengeId: string
  round: number
  question: string | null
  onGraded: (result: AnswerGraded) => void
}

function AnswerPanel({ challengeId, round, question, onGraded }: AnswerPanelProps) {
  const [answer, setAnswer] = useState(() => loadDraft(challengeId, round))
  const [preview, setPreview] = useState(false)
  const grade = useAction(
    (answer_md: string, signal) => api.submitAnswer(challengeId, { round, answer_md }, signal),
    (result: AnswerGraded) => {
      clearDraft(challengeId, round)
      onGraded(result)
    },
  )
  const grading = grade.state.status === 'running'

  const edit = (text: string) => {
    setAnswer(text)
    saveDraft(challengeId, round, text)
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    grade.run(answer)
  }

  return (
    <form className="answer" onSubmit={onSubmit}>
      {question === null ? (
        <h2 className="challenge__heading">Your answer</h2>
      ) : (
        <div className="answer__question">
          <h2 className="challenge__heading">Follow-up</h2>
          <p>{question}</p>
        </div>
      )}
      <div className="answer__toolbar">
        <div className="answer__modes" role="group" aria-label="Editor mode">
          <ModeButton pressed={!preview} onClick={() => setPreview(false)}>
            Write
          </ModeButton>
          <ModeButton pressed={preview} onClick={() => setPreview(true)}>
            Preview
          </ModeButton>
        </div>
        <WordCount text={answer} />
      </div>
      {preview ? (
        <div className="answer__preview">
          <Markdown>{answer || '_Nothing written yet._'}</Markdown>
        </div>
      ) : (
        <MarkdownEditor initialValue={answer} onChange={edit} label="Your answer" readOnly={grading} />
      )}
      <ActionStatusView state={grade.state} running="Grading your answer…" onRetry={() => grade.run(answer)} />
      <div className="answer__submit">
        <Button type="submit" disabled={grading || answer.trim() === ''}>
          {grading ? 'Grading…' : 'Submit answer'}
        </Button>
      </div>
    </form>
  )
}

function ModeButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className="answer__mode" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

function WordCount({ text }: { text: string }) {
  const count = wordCount(text)
  return (
    <span className="answer__count">
      {count} {count === 1 ? 'word' : 'words'}
    </span>
  )
}

type ActionStatusViewProps = { state: ActionStatus; running: string; onRetry: () => void }

function ActionStatusView({ state, running, onRetry }: ActionStatusViewProps) {
  if (state.status === 'running') return <LoadingState label={running} />
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={onRetry} />
  return null
}

function RevealConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const titleId = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  return (
    <div className="confirm" role="alertdialog" aria-labelledby={titleId}>
      <h2 id={titleId} className="confirm__title">
        Reveal the solution?
      </h2>
      <p className="confirm__text">You won't be able to answer after revealing.</p>
      <div className="confirm__actions">
        <Button variant="secondary" ref={cancel} onClick={onCancel}>
          Keep answering
        </Button>
        <Button onClick={onConfirm}>Reveal</Button>
      </div>
    </div>
  )
}

function ScoreList({ round }: { round: Round }) {
  return (
    <div className="scores">
      {Object.entries(round.scores).map(([key, score]) => (
        <ScoreBar key={key} name={dimensionName(key)} score={score as Score} />
      ))}
    </div>
  )
}

type GradeSheetProps = { round: Round | null; onFollowUp: () => void; onSeeReference: () => void }

function GradeSheet({ round, onFollowUp, onSeeReference }: GradeSheetProps) {
  if (round === null) return <FeedbackSheet open={false} tone="partial" headline="" actionLabel="" onAction={onFollowUp} />
  const tone = feedbackTone(round.scores)
  const question = followUpQuestion(round)
  return (
    <FeedbackSheet
      open
      tone={tone}
      headline={sheetHeadline(round.verdict.kind, tone)}
      actionLabel={question === null ? 'See reference' : 'Answer follow-up'}
      onAction={question === null ? onSeeReference : onFollowUp}
    >
      <div className="feedback">
        <ScoreList round={round} />
        <p className="feedback__comment">{round.comment}</p>
        {question === null ? (
          <div className="celebrate" aria-hidden="true">
            <svg viewBox="0 0 52 52" className="celebrate__mark">
              <circle cx="26" cy="26" r="24" className="celebrate__ring" />
              <path d="M15 27l7 7 15-16" className="celebrate__check" />
            </svg>
          </div>
        ) : (
          <div className="feedback__question">
            <p className="feedback__label">Follow-up question</p>
            <p>{question}</p>
          </div>
        )}
      </div>
    </FeedbackSheet>
  )
}

function PastRounds({ rounds }: { rounds: Round[] }) {
  if (rounds.length === 0) return null
  return (
    <div className="past">
      <h2 className="challenge__heading">Your rounds</h2>
      {rounds.map((round) => (
        <details key={round.n} className="past__round">
          <summary>Round {round.n}</summary>
          <Markdown>{round.answer_md}</Markdown>
          <ScoreList round={round} />
          <p className="feedback__comment">{round.comment}</p>
        </details>
      ))}
    </div>
  )
}
