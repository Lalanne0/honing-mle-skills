"""The challenge aggregate: a challenge with its hidden material and the rounds answered so far.

Terms are defined in docs/glossary.md. The rules for moving between states live in
`app.domain.advance`; this module only holds the data.
"""

from datetime import UTC, datetime
from typing import Annotated, Self
from uuid import UUID, uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.domain import MAX_ROUNDS, Level, NonBlank, Revealed, Rubric, Score, State, Topic, Verdict
from app.llm.schemas import ComparisonOfRubric


class _Value(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Round(_Value):
    """One answer from the user and its grade."""

    n: Annotated[int, Field(ge=1, le=MAX_ROUNDS)]
    answer_md: NonBlank
    scores: dict[str, Score]
    comment: str
    verdict: Verdict


class Challenge(_Value):
    """One interview question, its hidden reference solution and rubric, and its rounds."""

    id: UUID = Field(default_factory=uuid4)
    created_at: AwareDatetime = Field(default_factory=lambda: datetime.now(UTC))
    level: Level
    topic: Topic
    scenario_md: NonBlank
    reference_md: NonBlank
    rubric: Rubric
    state: State
    rounds: tuple[Round, ...] = ()
    comparison: ComparisonOfRubric | None = None
    """Written once, at reveal. Present exactly when the challenge is revealed."""

    @model_validator(mode="after")
    def _comparison_iff_revealed(self) -> Self:
        if isinstance(self.state, Revealed) != (self.comparison is not None):
            raise ValueError("a challenge has a comparison exactly when it is revealed")
        return self
