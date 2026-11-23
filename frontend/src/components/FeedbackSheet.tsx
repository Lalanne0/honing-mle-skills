import type { ReactNode } from 'react'
import { Button } from './Button'

type FeedbackSheetProps = {
  open: boolean
  tone: 'strong' | 'partial'
  headline: string
  actionLabel: string
  onAction: () => void
  children: ReactNode
}

export function FeedbackSheet({ open, tone, headline, actionLabel, onAction, children }: FeedbackSheetProps) {
  // The live region stays mounted while closed so screen readers announce it when it fills.
  if (!open) return <div role="status" />
  return (
    <div className="sheet" role="status" data-tone={tone}>
      <div className="sheet__inner">
        <p className="sheet__headline">{headline}</p>
        <div className="sheet__body">{children}</div>
        <Button onClick={onAction}>{actionLabel}</Button>
      </div>
    </div>
  )
}
