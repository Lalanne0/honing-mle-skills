/** What the reveal view shows: the rubric read against the comparison and the last graded round. */
import type { ChallengeRevealed, Round } from '../api/client'

type Rubric = ChallengeRevealed['rubric']

export type ComparisonRow = {
  key: string
  name: string
  /** The dimension's weight as a whole-number share of the rubric's total weight. */
  weightPercent: number
  criteria: string
  /** The dimension's score in the last graded round, or null when nothing was graded. */
  score: number | null
  note: string
}

export function comparisonRows(rubric: Rubric, notes: Record<string, string>, rounds: Round[]): ComparisonRow[] {
  const total = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0)
  const scores = rounds.at(-1)?.scores
  return rubric.dimensions.map((d) => ({
    key: d.key,
    name: d.name,
    weightPercent: Math.round((d.weight / total) * 100),
    criteria: d.full_marks_criteria,
    score: scores?.[d.key] ?? null,
    note: notes[d.key],
  }))
}

/** The answer the comparison is about: the one from the last graded round. */
export function finalAnswer(rounds: Round[]): { round: number; answer_md: string } | null {
  const last = rounds.at(-1)
  return last ? { round: last.n, answer_md: last.answer_md } : null
}
