import json
from collections.abc import Sequence
from uuid import UUID, uuid4

import pytest
from httpx2 import Response

from app.challenge import Round
from app.domain import Awaiting, FollowUp, Revealed
from app.llm.errors import LLMSchemaError
from app.llm.fake import RUBRIC, FakeLLM
from app.llm.prompts import PastRound
from app.llm.schemas import Comparison, GeneratedChallenge
from app.repository import ChallengeRepository
from tests.api_harness import FAKE_REFERENCE, Harness

NOTE_KEYS = {d.key for d in RUBRIC.dimensions}


class CompareSpyLLM(FakeLLM):
    """`FakeLLM` that records the answers each compare call sees."""

    def __init__(self) -> None:
        super().__init__()
        self.compared: list[list[str]] = []

    def compare(self, challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> Comparison:
        self.compared.append([r.answer for r in rounds])
        return super().compare(challenge, rounds)


class FailingCompareLLM(FakeLLM):
    def compare(self, challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> Comparison:
        raise LLMSchemaError("reply failed validation twice")


class AnsweringLLM(FakeLLM):
    """Stores round 2 itself while comparing, like an answer committed during the reveal."""

    def __init__(self, repository: ChallengeRepository, challenge_id: UUID) -> None:
        super().__init__()
        self._repository = repository
        self._challenge_id = challenge_id

    def compare(self, challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> Comparison:
        late = Round(
            n=2,
            answer_md="Late.",
            scores=dict.fromkeys(NOTE_KEYS, 3),
            comment="Fake comment.",
            verdict=FollowUp(question="More?"),
        )
        self._repository.add_round(self._challenge_id, late, Awaiting(round=3))
        return super().compare(challenge, rounds)


@pytest.fixture
def spy(h: Harness) -> CompareSpyLLM:
    h.llm = CompareSpyLLM()
    return h.llm


def new_challenge(h: Harness) -> str:
    challenge_id: str = h.create(level="mid", topic="model_serving").json()["id"]
    return challenge_id


def answer(h: Harness, challenge_id: str, round_: int) -> Response:
    return h.client.post(
        f"/api/challenges/{challenge_id}/answers",
        json={"round": round_, "answer_md": f"Answer {round_}."},
    )


def reveal(h: Harness, challenge_id: str) -> Response:
    return h.client.post(f"/api/challenges/{challenge_id}/reveal")


def assert_revealed(body: dict[str, object]) -> None:
    assert body["state"] == {"kind": "revealed"}
    assert body["reference_md"] == FAKE_REFERENCE
    assert body["rubric"] == json.loads(RUBRIC.model_dump_json())


# --- when the user reveals -----------------------------------------------------------


def test_reveal_before_answering_says_there_is_no_answer_to_compare(
    h: Harness, spy: CompareSpyLLM
) -> None:
    response = reveal(h, new_challenge(h))

    assert response.status_code == 200
    body = response.json()
    assert_revealed(body)
    assert body["rounds"] == []
    assert "no answer to compare" in body["comparison"]["summary_md"]
    assert set(body["comparison"]["notes"]) == NOTE_KEYS
    assert spy.compared == []


def test_reveal_mid_loop_compares_the_answers_given_so_far(h: Harness, spy: CompareSpyLLM) -> None:
    challenge_id = new_challenge(h)
    answer(h, challenge_id, 1)

    body = reveal(h, challenge_id).json()

    assert_revealed(body)
    assert body["comparison"] == {
        "summary_md": "Fake comparison of 1 rounds.",
        "notes": dict.fromkeys(NOTE_KEYS, "Fake note."),
    }
    assert spy.compared == [["Answer 1."]]


def test_reveal_after_complete_compares_every_round(h: Harness, spy: CompareSpyLLM) -> None:
    challenge_id = new_challenge(h)
    for n in (1, 2, 3):
        answer(h, challenge_id, n)

    body = reveal(h, challenge_id).json()

    assert_revealed(body)
    assert [r["n"] for r in body["rounds"]] == [1, 2, 3]
    assert body["comparison"]["summary_md"] == "Fake comparison of 3 rounds."
    assert spy.compared == [["Answer 1.", "Answer 2.", "Answer 3."]]


# --- after the reveal -------------------------------------------------------------


def test_a_second_reveal_returns_the_stored_comparison_without_a_model_call(
    h: Harness, spy: CompareSpyLLM
) -> None:
    challenge_id = new_challenge(h)
    answer(h, challenge_id, 1)
    first = reveal(h, challenge_id)

    second = reveal(h, challenge_id)

    assert second.status_code == 200
    assert second.json() == first.json()
    assert len(spy.compared) == 1


def test_answering_after_reveal_returns_409_and_stores_nothing(
    h: Harness, spy: CompareSpyLLM
) -> None:
    challenge_id = new_challenge(h)
    reveal(h, challenge_id)

    response = answer(h, challenge_id, 1)

    assert response.status_code == 409
    assert h.repository.get(UUID(challenge_id)).rounds == ()


def test_get_after_reveal_returns_the_revealed_challenge_with_its_comparison(
    h: Harness, spy: CompareSpyLLM
) -> None:
    challenge_id = new_challenge(h)
    revealed = reveal(h, challenge_id).json()

    fetched = h.client.get(f"/api/challenges/{challenge_id}").json()

    assert fetched == revealed


# --- failures ----------------------------------------------------------------------


def test_revealing_an_unknown_challenge_returns_404(h: Harness, spy: CompareSpyLLM) -> None:
    assert reveal(h, str(uuid4())).status_code == 404
    assert spy.compared == []


def test_a_model_failure_returns_502_and_keeps_the_challenge_hidden(h: Harness) -> None:
    challenge_id = new_challenge(h)
    answer(h, challenge_id, 1)
    h.llm = FailingCompareLLM()

    response = reveal(h, challenge_id)

    assert response.status_code == 502
    stored = h.repository.get(UUID(challenge_id))
    assert stored.state != Revealed()
    assert stored.comparison is None
    assert answer(h, challenge_id, 2).status_code == 200


def test_an_answer_stored_during_the_reveal_returns_409_and_stores_no_comparison(
    h: Harness,
) -> None:
    challenge_id = new_challenge(h)
    answer(h, challenge_id, 1)
    h.llm = AnsweringLLM(h.repository, UUID(challenge_id))

    response = reveal(h, challenge_id)

    assert response.status_code == 409
    stored = h.repository.get(UUID(challenge_id))
    assert stored.state == Awaiting(round=3)
    assert stored.comparison is None
