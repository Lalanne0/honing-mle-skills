"""Challenge domain: value types and the one function that holds the challenge rules.

Terms are defined in docs/glossary.md.
"""

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_ROUNDS = 3

NonBlank = Annotated[str, Field(pattern=r"\S")]
"""Text with at least one visible character. Kept as given, not stripped."""


class _Value(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Level(StrEnum):
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"


class Topic(StrEnum):
    RAG_AND_LLM_APPS = "rag_and_llm_apps"
    MODEL_SERVING = "model_serving"
    BATCH_VS_STREAMING_INFERENCE = "batch_vs_streaming_inference"
    TRAINING_PIPELINES = "training_pipelines"
    FEATURE_STORES = "feature_stores"
    MLOPS_MONITORING_AND_DRIFT = "mlops_monitoring_and_drift"
    DATA_PIPELINES = "data_pipelines"
    RECOMMENDER_SYSTEMS = "recommender_systems"
    AB_TESTING_AND_EXPERIMENTATION = "ab_testing_and_experimentation"
    PRIVACY_AND_SECURITY = "privacy_and_security"


# --- rubric ------------------------------------------------------------------


class Dimension(_Value):
    key: NonBlank
    name: NonBlank
    weight: Annotated[float, Field(gt=0)]
    full_marks_criteria: NonBlank


class Rubric(_Value):
    dimensions: Annotated[tuple[Dimension, ...], Field(min_length=3, max_length=6)]

    @field_validator("dimensions")
    @classmethod
    def _keys_are_unique(cls, dimensions: tuple[Dimension, ...]) -> tuple[Dimension, ...]:
        keys = [d.key for d in dimensions]
        if len(set(keys)) != len(keys):
            raise ValueError(f"dimension keys must be unique, got {keys}")
        return dimensions


# --- verdict -----------------------------------------------------------------


class FollowUp(_Value):
    kind: Literal["follow_up"] = "follow_up"
    question: NonBlank


class Complete(_Value):
    kind: Literal["complete"] = "complete"


Verdict = Annotated[FollowUp | Complete, Field(discriminator="kind")]


# --- state -------------------------------------------------------------------


class Awaiting(_Value):
    kind: Literal["awaiting"] = "awaiting"
    round: Annotated[int, Field(ge=1, le=MAX_ROUNDS)]


class Completed(_Value):
    kind: Literal["completed"] = "completed"


class Revealed(_Value):
    kind: Literal["revealed"] = "revealed"


State = Annotated[Awaiting | Completed | Revealed, Field(discriminator="kind")]


# --- events and transitions ----------------------------------------------------


class Graded(_Value):
    """An answer for the current round was graded and produced a verdict."""

    kind: Literal["graded"] = "graded"
    verdict: Verdict


class RevealRequested(_Value):
    kind: Literal["reveal_requested"] = "reveal_requested"


Event = Annotated[Graded | RevealRequested, Field(discriminator="kind")]


class IllegalTransitionError(Exception):
    """The event is not allowed in the current state."""


def advance(state: State, event: Event) -> State:
    """Apply one event to a challenge state. All challenge rules live here."""
    if isinstance(event, RevealRequested):
        return Revealed()
    if not isinstance(state, Awaiting):
        raise IllegalTransitionError(f"cannot accept an answer in state {state.kind!r}")
    if isinstance(event.verdict, FollowUp) and state.round < MAX_ROUNDS:
        return Awaiting(round=state.round + 1)
    return Completed()
