import pytest
from pydantic import ValidationError

from app.challenge import Challenge
from app.domain import Awaiting, Completed, Revealed, State
from app.llm.fake import FakeLLM
from app.llm.schemas import Comparison
from tests.api_harness import FAKE_CHALLENGE


def comparison() -> Comparison:
    return FakeLLM().compare(FAKE_CHALLENGE, [])


def test_a_revealed_challenge_carries_its_comparison() -> None:
    challenge = Challenge(
        level="mid",
        topic="model_serving",
        state=Revealed(),
        comparison=comparison(),
        **FAKE_CHALLENGE.model_dump(),
    )

    assert challenge.comparison == comparison()


def test_a_revealed_challenge_without_a_comparison_is_refused() -> None:
    with pytest.raises(ValidationError, match="comparison"):
        Challenge(
            level="mid", topic="model_serving", state=Revealed(), **FAKE_CHALLENGE.model_dump()
        )


@pytest.mark.parametrize("state", [Awaiting(round=1), Completed()], ids=["awaiting", "completed"])
def test_a_comparison_before_reveal_is_refused(state: State) -> None:
    with pytest.raises(ValidationError, match="comparison"):
        Challenge(
            level="mid",
            topic="model_serving",
            state=state,
            comparison=comparison(),
            **FAKE_CHALLENGE.model_dump(),
        )


def test_a_comparison_whose_notes_miss_a_rubric_dimension_is_refused() -> None:
    notes = {d.key: "Note." for d in FAKE_CHALLENGE.rubric.dimensions[1:]}

    with pytest.raises(ValidationError, match="missing"):
        Challenge(
            level="mid",
            topic="model_serving",
            state=Revealed(),
            comparison={"summary_md": "Summary.", "notes": notes},
            **FAKE_CHALLENGE.model_dump(),
        )
