from collections.abc import Sequence
from typing import Any, Literal
from uuid import UUID, uuid4

import pytest
from httpx2 import Response

from app.challenge import Challenge, Round
from app.domain import Complete, Completed, FollowUp, Level, Revealed, State, Topic, Verdict
from app.llm.errors import LLMSchemaError
from app.llm.fake import FakeLLM
from app.llm.prompts import PastRound
from app.llm.schemas import GeneratedChallenge, GradeResult
from app.repository import ChallengeRepository
from tests.api_harness import Harness, assert_no_hidden_text

FOLLOW_UP = {"kind": "follow_up", "question": "Fake follow-up: how would this scale 10x?"}
SCORES = {"requirements": 3, "architecture": 3, "trade_offs": 3}


class SpyLLM(FakeLLM):
    """`FakeLLM` that records each grade call, and can always ask a follow-up."""

    def __init__(
        self,
        verdict: Literal["follow_up", "complete"] = "follow_up",
        always_follow_up: bool = False,
    ) -> None:
        super().__init__(verdict)
        self.always_follow_up = always_follow_up
        self.calls: list[tuple[list[str], str]] = []

    def grade(
        self, challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str
    ) -> GradeResult:
        self.calls.append(([p.answer for p in previous], answer))
        return super().grade(challenge, previous, answer)

    def _verdict_for(self, round_number: int) -> Verdict:
        if self.always_follow_up:
            return FollowUp(question="And in round 4?")
        return super()._verdict_for(round_number)


class RacingLLM(SpyLLM):
    """Stores the same round itself while grading, like a concurrent duplicate submit."""

    def __init__(self, repository: ChallengeRepository, challenge_id: UUID) -> None:
        super().__init__()
        self._repository = repository
        self._challenge_id = challenge_id

    def grade(
        self, challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str
    ) -> GradeResult:
        grade = super().grade(challenge, previous, answer)
        racer = Round(n=1, answer_md="racer", **grade.model_dump())
        self._repository.add_round(self._challenge_id, racer, Completed())
        return grade


class FailingGradeLLM(SpyLLM):
    def grade(
        self, challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str
    ) -> GradeResult:
        raise LLMSchemaError("reply failed validation twice")


@pytest.fixture
def spy(h: Harness) -> SpyLLM:
    h.llm = SpyLLM()
    return h.llm


def new_challenge(h: Harness) -> str:
    challenge_id: str = h.create(level="mid", topic="model_serving").json()["id"]
    return challenge_id


def answer(h: Harness, challenge_id: str, round_: int, answer_md: str = "My design.") -> Response:
    return h.client.post(
        f"/api/challenges/{challenge_id}/answers", json={"round": round_, "answer_md": answer_md}
    )


def store_in_state(h: Harness, state: State) -> str:
    generated = FakeLLM().generate(Level.MID, Topic.MODEL_SERVING)
    comparison = FakeLLM().compare(generated, []) if isinstance(state, Revealed) else None
    challenge = Challenge(
        level=Level.MID,
        topic=Topic.MODEL_SERVING,
        state=state,
        comparison=comparison,
        **generated.model_dump(),
    )
    h.repository.create(challenge)
    return str(challenge.id)


# --- the loop --------------------------------------------------------------------


def test_a_full_three_round_flow(h: Harness, spy: SpyLLM) -> None:
    challenge_id = new_challenge(h)

    first = answer(h, challenge_id, 1, "Round one.")
    second = answer(h, challenge_id, 2, "Round two.")
    third = answer(h, challenge_id, 3, "Round three.")

    assert [r.status_code for r in (first, second, third)] == [200, 200, 200]
    assert first.json() == {
        "round": {
            "n": 1,
            "answer_md": "Round one.",
            "scores": SCORES,
            "comment": "Fake comment.",
            "verdict": FOLLOW_UP,
        },
        "state": {"kind": "awaiting", "round": 2},
    }
    assert second.json()["state"] == {"kind": "awaiting", "round": 3}
    assert third.json()["round"]["verdict"] == {"kind": "complete"}
    assert third.json()["state"] == {"kind": "completed"}
    stored = h.client.get(f"/api/challenges/{challenge_id}").json()
    assert stored["state"] == {"kind": "completed"}
    answers = [r["answer_md"] for r in stored["rounds"]]
    assert answers == ["Round one.", "Round two.", "Round three."]


def test_each_grade_sees_the_answers_already_given(h: Harness, spy: SpyLLM) -> None:
    challenge_id = new_challenge(h)

    for n, text in enumerate(["A", "B", "C"], start=1):
        answer(h, challenge_id, n, text)

    assert spy.calls == [([], "A"), (["A"], "B"), (["A", "B"], "C")]


def test_a_complete_verdict_ends_the_challenge_early(h: Harness) -> None:
    h.llm = SpyLLM(verdict="complete")
    challenge_id = new_challenge(h)

    body = answer(h, challenge_id, 1).json()

    assert body["round"]["verdict"] == {"kind": "complete"}
    assert body["state"] == {"kind": "completed"}
    assert answer(h, challenge_id, 2).status_code == 409


def test_a_follow_up_in_the_last_round_becomes_complete(h: Harness) -> None:
    h.llm = SpyLLM(always_follow_up=True)
    challenge_id = new_challenge(h)
    answer(h, challenge_id, 1)
    answer(h, challenge_id, 2)

    body = answer(h, challenge_id, 3).json()

    assert body["round"]["verdict"] == {"kind": "complete"}
    assert body["state"] == {"kind": "completed"}
    stored = h.repository.get(UUID(challenge_id))
    assert stored.rounds[-1].verdict == Complete()


def test_answers_never_leak_the_reference_or_rubric(h: Harness) -> None:
    response = answer(h, new_challenge(h), 1)

    assert response.status_code == 200
    assert_no_hidden_text(response)


# --- refused answers: no model call, nothing stored ---------------------------------


def test_a_duplicate_submit_returns_409_without_a_second_model_call(
    h: Harness, spy: SpyLLM
) -> None:
    challenge_id = new_challenge(h)
    answer(h, challenge_id, 1, "First.")

    response = answer(h, challenge_id, 1, "First, again.")

    assert response.status_code == 409
    assert len(spy.calls) == 1
    assert [r.answer_md for r in h.repository.get(UUID(challenge_id)).rounds] == ["First."]


def test_an_answer_for_a_later_round_returns_409(h: Harness, spy: SpyLLM) -> None:
    response = answer(h, new_challenge(h), 2)

    assert response.status_code == 409
    assert spy.calls == []


@pytest.mark.parametrize("state", [Completed(), Revealed()], ids=["completed", "revealed"])
def test_answering_a_finished_challenge_returns_409(h: Harness, spy: SpyLLM, state: State) -> None:
    challenge_id = store_in_state(h, state)

    response = answer(h, challenge_id, 1)

    assert response.status_code == 409
    assert spy.calls == []
    assert h.repository.get(UUID(challenge_id)).rounds == ()


@pytest.mark.parametrize(
    "body",
    [
        {"round": 1, "answer_md": ""},
        {"round": 1, "answer_md": "  \n\t "},
        {"round": 1},
        {"answer_md": "My design."},
        {"round": 0, "answer_md": "My design."},
        {"round": 4, "answer_md": "My design."},
        {"round": 1, "answer_md": "My design.", "surprise": True},
    ],
)
def test_invalid_answer_bodies_return_422(h: Harness, spy: SpyLLM, body: dict[str, Any]) -> None:
    challenge_id = new_challenge(h)

    response = h.client.post(f"/api/challenges/{challenge_id}/answers", json=body)

    assert response.status_code == 422
    assert spy.calls == []


def test_answering_an_unknown_challenge_returns_404(h: Harness, spy: SpyLLM) -> None:
    assert answer(h, str(uuid4()), 1).status_code == 404
    assert spy.calls == []


def test_a_round_stored_while_grading_returns_409_and_keeps_the_first(h: Harness) -> None:
    challenge_id = new_challenge(h)
    h.llm = RacingLLM(h.repository, UUID(challenge_id))

    response = answer(h, challenge_id, 1, "Late.")

    assert response.status_code == 409
    stored = h.repository.get(UUID(challenge_id))
    assert [r.answer_md for r in stored.rounds] == ["racer"]
    assert stored.state == Completed()


def test_a_model_failure_returns_502_and_stores_nothing(h: Harness) -> None:
    challenge_id = new_challenge(h)
    h.llm = FailingGradeLLM()

    response = answer(h, challenge_id, 1)

    assert response.status_code == 502
    assert "reply failed validation twice" in response.json()["detail"]
    stored = h.repository.get(UUID(challenge_id))
    assert stored.rounds == ()
    assert stored.state.kind == "awaiting"
