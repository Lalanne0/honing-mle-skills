"""What the API sends about a challenge.

`ChallengePublic` is all the user may see before reveal: it has no field for the
reference solution or the rubric, so neither can leak by accident.
`ChallengeRevealed` adds both and the comparison, and is sent only once the challenge
is revealed. `ChallengeSummary` is one line of the history: no rounds, no hidden material.
"""

from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict

from app.challenge import Challenge, Round
from app.domain import Level, Revealed, Rubric, State, Topic
from app.llm.schemas import ComparisonOfRubric
from app.stats import weighted_score


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
    comparison: ComparisonOfRubric


def view(challenge: Challenge) -> ChallengePublic | ChallengeRevealed:
    """The view of `challenge` its state allows."""
    if isinstance(challenge.state, Revealed):
        return ChallengeRevealed.model_validate(challenge)
    return ChallengePublic.model_validate(challenge)


class ChallengeSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: UUID
    created_at: AwareDatetime
    level: Level
    topic: Topic
    scenario_md: str
    state: State
    rounds_answered: int
    score: float | None
    """The weighted score of the last graded round, from 0 to 100. None before the first."""


def summary(challenge: Challenge) -> ChallengeSummary:
    return ChallengeSummary(
        id=challenge.id,
        created_at=challenge.created_at,
        level=challenge.level,
        topic=challenge.topic,
        scenario_md=challenge.scenario_md,
        state=challenge.state,
        rounds_answered=len(challenge.rounds),
        score=weighted_score(challenge),
    )
