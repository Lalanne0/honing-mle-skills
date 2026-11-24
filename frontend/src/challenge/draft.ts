/**
 * The unsent answer for each challenge and round, kept in localStorage so a reload
 * doesn't lose it. Storage can be missing or refuse access (private windows, blocked
 * site data), so every call swallows errors: a lost draft is better than a broken page.
 */

const key = (challengeId: string, round: number) => `hms:draft:${challengeId}:${round}`

export function loadDraft(challengeId: string, round: number): string {
  try {
    return localStorage.getItem(key(challengeId, round)) ?? ''
  } catch {
    return ''
  }
}

/** An empty draft removes the entry rather than storing an empty string. */
export function saveDraft(challengeId: string, round: number, text: string): void {
  try {
    if (text === '') localStorage.removeItem(key(challengeId, round))
    else localStorage.setItem(key(challengeId, round), text)
  } catch {
    // Storage unavailable: the draft lives only in memory.
  }
}

export function clearDraft(challengeId: string, round: number): void {
  saveDraft(challengeId, round, '')
}
