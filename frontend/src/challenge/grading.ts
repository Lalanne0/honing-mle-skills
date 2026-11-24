/** How a graded round is shown: names, tone and headline (VIN-14 feedback patterns). */

export type Tone = 'strong' | 'partial'

/** A mean score at or above this reads as a strong answer. */
const STRONG_MEAN = 4

/**
 * The rubric's display names stay hidden until reveal, so a score is labelled from its
 * dimension key: `trade_offs` becomes "Trade offs".
 */
export function dimensionName(key: string): string {
  const words = key.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function feedbackTone(scores: Record<string, number>): Tone {
  const values = Object.values(scores)
  if (values.length === 0) return 'partial'
  const mean = values.reduce((sum, score) => sum + score, 0) / values.length
  return mean >= STRONG_MEAN ? 'strong' : 'partial'
}

const FOLLOW_UP_HEADLINES: Record<Tone, string> = { strong: 'Solid design!', partial: 'Getting there' }

export function sheetHeadline(verdict: 'follow_up' | 'complete', tone: Tone): string {
  return verdict === 'complete' ? 'Challenge complete!' : FOLLOW_UP_HEADLINES[tone]
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
