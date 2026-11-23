import pytest
from pydantic import TypeAdapter, ValidationError

from app.domain import (
    MAX_ROUNDS,
    Awaiting,
    Complete,
    Completed,
    Dimension,
    FollowUp,
    Graded,
    IllegalTransitionError,
    Level,
    Revealed,
    RevealRequested,
    Rubric,
    State,
    Topic,
    Verdict,
    advance,
)

FOLLOW_UP = Graded(verdict=FollowUp(question="How would you handle cold start?"))
COMPLETE = Graded(verdict=Complete())
REVEAL = RevealRequested()


def dimension(key: str) -> Dimension:
    return Dimension(key=key, name=key.title(), weight=1.0, full_marks_criteria="Covers it.")


def rubric_of(*keys: str) -> Rubric:
    return Rubric(dimensions=tuple(dimension(k) for k in keys))


# --- levels and topics ---------------------------------------------------------


def test_levels_are_junior_mid_senior() -> None:
    assert [level.value for level in Level] == ["junior", "mid", "senior"]


def test_there_are_ten_distinct_topics() -> None:
    assert len({topic.value for topic in Topic}) == 10


# --- rubric ------------------------------------------------------------------


@pytest.mark.parametrize("count", [3, 6])
def test_rubric_accepts_three_to_six_dimensions(count: int) -> None:
    keys = [f"d{i}" for i in range(count)]

    assert [d.key for d in rubric_of(*keys).dimensions] == keys


@pytest.mark.parametrize("count", [2, 7])
def test_rubric_rejects_too_few_or_too_many_dimensions(count: int) -> None:
    with pytest.raises(ValidationError):
        rubric_of(*[f"d{i}" for i in range(count)])


def test_rubric_rejects_duplicate_dimension_keys() -> None:
    with pytest.raises(ValidationError, match="unique"):
        rubric_of("data", "model", "data")


@pytest.mark.parametrize("weight", [0.0, -1.0])
def test_dimension_weight_must_be_positive(weight: float) -> None:
    with pytest.raises(ValidationError):
        Dimension(key="data", name="Data", weight=weight, full_marks_criteria="x")


@pytest.mark.parametrize("blank", ["", "   ", "\n\t"])
@pytest.mark.parametrize("field", ["key", "name", "full_marks_criteria"])
def test_dimension_text_fields_must_not_be_blank(field: str, blank: str) -> None:
    values = {"key": "data", "name": "Data", "weight": 1.0, "full_marks_criteria": "x"}

    with pytest.raises(ValidationError):
        Dimension.model_validate({**values, field: blank})


# --- verdict -----------------------------------------------------------------


def test_verdict_parses_as_a_tagged_union() -> None:
    adapter: TypeAdapter[Verdict] = TypeAdapter(Verdict)

    assert adapter.validate_python({"kind": "follow_up", "question": "Why?"}) == FollowUp(
        question="Why?"
    )
    assert adapter.validate_python({"kind": "complete"}) == Complete()


@pytest.mark.parametrize("blank", ["", "   ", "\n\t"])
def test_follow_up_needs_a_question(blank: str) -> None:
    with pytest.raises(ValidationError):
        FollowUp(question=blank)


def test_text_fields_keep_ordinary_text_as_given() -> None:
    assert FollowUp(question=" Why? ").question == " Why? "


# --- state -------------------------------------------------------------------


@pytest.mark.parametrize("round_number", [0, MAX_ROUNDS + 1])
def test_awaiting_round_is_between_one_and_max(round_number: int) -> None:
    with pytest.raises(ValidationError):
        Awaiting(round=round_number)


def test_state_parses_as_a_tagged_union() -> None:
    adapter: TypeAdapter[State] = TypeAdapter(State)

    assert adapter.validate_python({"kind": "awaiting", "round": 2}) == Awaiting(round=2)
    assert adapter.validate_python({"kind": "completed"}) == Completed()
    assert adapter.validate_python({"kind": "revealed"}) == Revealed()


# --- advance -----------------------------------------------------------------


@pytest.mark.parametrize("round_number", [1, 2])
def test_follow_up_moves_to_the_next_round(round_number: int) -> None:
    assert advance(Awaiting(round=round_number), FOLLOW_UP) == Awaiting(round=round_number + 1)


def test_follow_up_in_the_last_round_completes_the_challenge() -> None:
    assert advance(Awaiting(round=MAX_ROUNDS), FOLLOW_UP) == Completed()


def test_max_rounds_is_three() -> None:
    assert MAX_ROUNDS == 3


@pytest.mark.parametrize("round_number", [1, 2, 3])
def test_complete_verdict_completes_the_challenge(round_number: int) -> None:
    assert advance(Awaiting(round=round_number), COMPLETE) == Completed()


def test_a_challenge_never_takes_more_than_three_answers() -> None:
    state: State = Awaiting(round=1)
    answers = 0
    while isinstance(state, Awaiting):
        state = advance(state, FOLLOW_UP)
        answers += 1

    assert answers == 3
    assert state == Completed()


@pytest.mark.parametrize("state", [Completed(), Revealed()])
@pytest.mark.parametrize("event", [FOLLOW_UP, COMPLETE])
def test_no_answers_after_completed_or_revealed(state: State, event: Graded) -> None:
    with pytest.raises(IllegalTransitionError, match=state.kind):
        advance(state, event)


@pytest.mark.parametrize(
    "state", [Awaiting(round=1), Awaiting(round=2), Awaiting(round=3), Completed(), Revealed()]
)
def test_revealed_is_reachable_from_every_state(state: State) -> None:
    assert advance(state, REVEAL) == Revealed()
