export type Round = 1 | 2 | 3

const MAX_ROUNDS = 3
const ROUNDS: Round[] = [1, 2, 3]

type PipState = 'graded' | 'current' | 'upcoming'

type ProgressPipsProps = { round: Round; complete: boolean }

function pipState(pip: Round, round: Round, complete: boolean): PipState {
  if (pip < round || (complete && pip === round)) return 'graded'
  return pip === round ? 'current' : 'upcoming'
}

export function ProgressPips({ round, complete }: ProgressPipsProps) {
  const label = complete ? `Complete after ${round} of ${MAX_ROUNDS} rounds` : `Round ${round} of ${MAX_ROUNDS}`
  return (
    <div className="pips" role="img" aria-label={label}>
      {ROUNDS.map((pip) => (
        <span key={pip} className="pips__pip" data-state={pipState(pip, round, complete)} />
      ))}
      <span className="pips__text" aria-hidden="true">
        {complete ? 'Complete' : `Round ${round}/${MAX_ROUNDS}`}
      </span>
    </div>
  )
}
