import { useParams } from 'react-router'
import { api, type ChallengePublic } from '../api/client'
import { LEVEL_LABELS, TOPIC_LABELS } from '../api/labels'
import { useApi } from '../api/useApi'
import { ErrorState } from '../components/ErrorState'
import { LoadingState } from '../components/LoadingState'

/** Loads one challenge by id. The editor, feedback and follow-ups come with VIN-17. */
export function ChallengePage() {
  const { id = '' } = useParams()
  const { state, retry } = useApi(id, (signal) => api.getChallenge(id, signal))

  if (state.status === 'loading') return <LoadingState label="Loading the challenge…" />
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={retry} />
  return <ChallengeView challenge={state.data} />
}

function ChallengeView({ challenge }: { challenge: ChallengePublic }) {
  return (
    <article className="page">
      <p className="page__eyebrow">{LEVEL_LABELS[challenge.level]}</p>
      <h1>{TOPIC_LABELS[challenge.topic]}</h1>
      <p className="page__prose">{challenge.scenario_md}</p>
    </article>
  )
}
