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
  if (!open) return null
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
