"""What the API sends about a challenge.

`ChallengePublic` is all the user may see before reveal: it has no field for the
reference solution or the rubric, so neither can leak by accident.
`ChallengeRevealed` adds both, and is sent only once the challenge is revealed.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.challenge import Challenge, Round
from app.domain import Level, Revealed, Rubric, State, Topic


class ChallengePublic(BaseModel):
    model_config = ConfigDict(frozen=True, from_attributes=True)

    id: UUID
    level: Level
    topic: Topic
    scenario_md: str
    state: State
    rounds: tuple[Round, ...]


class ChallengeRevealed(ChallengePublic):
    reference_md: str
    rubric: Rubric


def view(challenge: Challenge) -> ChallengePublic | ChallengeRevealed:
    """The view of `challenge` its state allows."""
    if isinstance(challenge.state, Revealed):
        return ChallengeRevealed.model_validate(challenge)
    return ChallengePublic.model_validate(challenge)
