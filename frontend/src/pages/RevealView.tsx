import { useId, useState, type ReactNode } from 'react'
import type { ChallengeRevealed } from '../api/client'
import { comparisonRows, finalAnswer, type ComparisonRow } from '../challenge/comparison'
import { Markdown } from '../components/Markdown'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { MAX_ROUNDS } from '../components/ProgressPips'
import { ScoreBar, type Score } from '../components/ScoreBar'
import './reveal-view.css'

/** After reveal: the comparison and rubric, then the user's final answer beside the reference solution. */
export function RevealView({ challenge }: { challenge: ChallengeRevealed }) {
  return (
    <>
      <ComparisonSection challenge={challenge} />
      <CompareSplit challenge={challenge} />
    </>
  )
}

function ComparisonSection({ challenge }: { challenge: ChallengeRevealed }) {
  const titleId = useId()
  const rows = comparisonRows(challenge.rubric, challenge.comparison.notes, challenge.rounds)
  return (
    <section className="comparison" aria-labelledby={titleId}>
      <h2 id={titleId} className="challenge__heading">
        Comparison
      </h2>
      <Markdown>{challenge.comparison.summary_md}</Markdown>
      <table className="rubric">
        <caption className="rubric__caption">Rubric</caption>
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            <th scope="col">Weight</th>
            <th scope="col">Full marks when</th>
            <th scope="col">Comparison note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RubricRow key={row.key} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function RubricRow({ row }: { row: ComparisonRow }) {
  return (
    <tr>
      <th scope="row" className="rubric__dimension">
        {row.score === null ? (
          <>
            <span className="rubric__name">{row.name}</span>
            <span className="rubric__ungraded">Not graded</span>
          </>
        ) : (
          <ScoreBar name={row.name} score={row.score as Score} />
        )}
      </th>
      <td className="rubric__weight" data-label="Weight">
        {row.weightPercent}%
      </td>
      <td data-label="Full marks when">{row.criteria}</td>
      <td data-label="Comparison note">{row.note}</td>
    </tr>
  )
}

type Side = 'answer' | 'reference'

/** Side by side on wide screens; on narrow ones, tabs pick which side shows (see reveal-view.css). */
function CompareSplit({ challenge }: { challenge: ChallengeRevealed }) {
  const [side, setSide] = useState<Side>('answer')
  const id = useId()
  const tab = (which: Side, label: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${which}-tab`}
      aria-controls={`${id}-${which}`}
      aria-selected={side === which}
      className="compare__tab"
      onClick={() => setSide(which)}
    >
      {label}
    </button>
  )
  const panel = (which: Side, children: ReactNode) => (
    <section
      role="tabpanel"
      id={`${id}-${which}`}
      aria-labelledby={`${id}-${which}-tab`}
      data-active={side === which}
      className="compare__panel"
    >
      {children}
    </section>
  )
  return (
    <div className="compare">
      <div role="tablist" aria-label="Compare" className="compare__tabs">
        {tab('answer', 'Your answer')}
        {tab('reference', 'Reference solution')}
      </div>
      <div className="compare__split">
        {panel('answer', <FinalAnswer challenge={challenge} />)}
        {panel(
          'reference',
          <>
            <h2 className="challenge__heading">Reference solution</h2>
            <Markdown>{challenge.reference_md}</Markdown>
          </>,
        )}
      </div>
    </div>
  )
}

function FinalAnswer({ challenge }: { challenge: ChallengeRevealed }) {
  const final = finalAnswer(challenge.rounds)
  return (
    <>
      <h2 className="challenge__heading">Your answer</h2>
      {final === null ? (
        <p className="compare__note">You revealed the solution before answering.</p>
      ) : (
        <>
          <p className="compare__note">
            Round {final.round} of {MAX_ROUNDS}, the last one graded.
          </p>
          <MarkdownEditor initialValue={final.answer_md} onChange={ignoreEdit} label="Your final answer" readOnly />
        </>
      )}
    </>
  )
}

/** The final answer is read-only, so there are no edits to keep. */
function ignoreEdit() {}
