type LoadingStateProps = { label?: string }

/** The one loading state: a quiet pulsing dot and what is loading, announced politely. */
export function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="state" role="status">
      <span className="state__pulse" aria-hidden="true" />
      <p className="state__text">{label}</p>
    </div>
  )
}
