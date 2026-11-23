import { useId } from 'react'

export type Score = 0 | 1 | 2 | 3 | 4 | 5

const MAX_SCORE = 5
const SEGMENTS = Array.from({ length: MAX_SCORE }, (_, i) => i)

type ScoreBarProps = { name: string; score: Score; comment: string }

export function ScoreBar({ name, score, comment }: ScoreBarProps) {
  const nameId = useId()
  return (
    <div className="score">
      <span id={nameId} className="score__name">
        {name}
      </span>
      <span className="score__value">
        {score}/{MAX_SCORE}
      </span>
      <div
        className="score__bar"
        role="meter"
        aria-labelledby={nameId}
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={MAX_SCORE}
      >
        {SEGMENTS.map((i) => (
          <span key={i} className="score__segment" data-filled={i < score} />
        ))}
      </div>
      <span className="score__comment">{comment}</span>
    </div>
  )
}
