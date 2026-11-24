import type { ApiError, ApiErrorKind } from '../api/client'
import { Button } from './Button'

const HEADLINES: Record<ApiErrorKind, string> = {
  network: "Can't reach the server",
  not_found: 'Nothing here',
  conflict: "That can't be done right now",
  invalid: "The request wasn't valid",
  model_failed: 'The model call failed',
  busy: 'The model is busy',
  server: 'Something went wrong',
}

type ErrorStateProps = { error: ApiError; onRetry?: () => void }

/** The one error state for any failed request: a headline for its kind, the detail, and an optional retry. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="state" data-tone="error" role="alert">
      <h2 className="state__headline">{HEADLINES[error.kind]}</h2>
      <p className="state__text">{error.message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
