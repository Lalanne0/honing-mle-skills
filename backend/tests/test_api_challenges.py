import json
import random
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.challenge import Challenge
from app.domain import Level, Revealed, Topic
from app.llm.errors import LLMError, LLMRateLimitedError, LLMSchemaError
from app.llm.fake import RUBRIC, FakeLLM
from app.llm.schemas import GeneratedChallenge
from app.main import app
from tests.api_harness import FAKE_REFERENCE, Harness, assert_no_hidden_text


class FailingLLM(FakeLLM):
    def __init__(self, error: LLMError) -> None:
        super().__init__()
        self._error = error

    def generate(self, level: Level, topic: Topic) -> GeneratedChallenge:
        raise self._error


# --- create ----------------------------------------------------------------------


def test_create_returns_the_public_challenge_awaiting_round_one(h: Harness) -> None:
    response = h.create(level="senior", topic="feature_stores")

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "level", "topic", "scenario_md", "state", "rounds"}
    assert body["level"] == "senior"
    assert body["topic"] == "feature_stores"
    assert body["scenario_md"] == "Fake senior challenge about feature_stores: design the system."
    assert body["state"] == {"kind": "awaiting", "round": 1}
    assert body["rounds"] == []


def test_create_stores_the_challenge_with_its_hidden_material(h: Harness) -> None:
    body = h.create(level="mid", topic="model_serving").json()

    stored = h.repository.get(body["id"])
    assert stored.reference_md == FAKE_REFERENCE
    assert stored.rubric == RUBRIC


def test_create_picks_the_topic_with_the_injected_rng_when_omitted(h: Harness) -> None:
    expected = random.Random(7).choice(list(Topic))

    body = h.create(level="junior").json()

    assert body["topic"] == expected.value


def test_random_topics_vary_across_creates(h: Harness) -> None:
    topics = {h.create(level="junior").json()["topic"] for _ in range(20)}

    assert len(topics) > 1


@pytest.mark.parametrize(
    "body",
    [
        {"level": "principal"},
        {"level": "mid", "topic": "quantum_computing"},
        {"topic": "model_serving"},
        {"level": "mid", "surprise": True},
    ],
)
def test_invalid_create_bodies_return_422_and_store_nothing(
    h: Harness, body: dict[str, object]
) -> None:
    response = h.client.post("/api/challenges", json=body)

    assert response.status_code == 422
    assert h.repository.list() == []


# --- LLM failures ------------------------------------------------------------------


def test_rate_limited_returns_503_with_retry_after_and_stores_nothing(h: Harness) -> None:
    h.llm = FailingLLM(LLMRateLimitedError("HTTP 429", retry_after=12.3))

    response = h.create(level="mid")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "13"
    assert "13 seconds" in response.json()["detail"]
    assert h.repository.list() == []


def test_rate_limited_without_a_hint_still_sends_retry_after(h: Harness) -> None:
    h.llm = FailingLLM(LLMRateLimitedError("HTTP 429", retry_after=None))

    response = h.create(level="mid")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"


def test_other_llm_errors_return_502_with_a_readable_message(h: Harness) -> None:
    h.llm = FailingLLM(LLMSchemaError("reply failed validation twice"))

    response = h.create(level="mid")

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "The model call failed, so nothing was saved: reply failed validation twice"
    )
    assert h.repository.list() == []


# --- get -------------------------------------------------------------------------


def test_get_returns_the_public_challenge(h: Harness) -> None:
    created = h.create(level="mid", topic="data_pipelines").json()

    response = h.client.get(f"/api/challenges/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_get_unknown_challenge_returns_404(h: Harness) -> None:
    response = h.client.get(f"/api/challenges/{uuid4()}")

    assert response.status_code == 404


def test_get_with_a_malformed_id_returns_422(h: Harness) -> None:
    assert h.client.get("/api/challenges/not-a-uuid").status_code == 422


def test_get_revealed_challenge_includes_reference_and_rubric(h: Harness) -> None:
    generated = FakeLLM().generate(Level.MID, Topic.DATA_PIPELINES)
    revealed = Challenge(
        level=Level.MID,
        topic=Topic.DATA_PIPELINES,
        state=Revealed(),
        comparison=FakeLLM().compare(generated, []),
        **generated.model_dump(),
    )
    h.repository.create(revealed)

    body = h.client.get(f"/api/challenges/{revealed.id}").json()

    assert body["state"] == {"kind": "revealed"}
    assert body["reference_md"] == FAKE_REFERENCE
    assert body["rubric"] == json.loads(RUBRIC.model_dump_json())
    assert body["comparison"]["summary_md"] == "Fake comparison of 0 rounds."


# --- leak ------------------------------------------------------------------------


def test_reference_and_rubric_never_leave_the_backend_before_reveal(h: Harness) -> None:
    created = h.create(level="senior")
    fetched = h.client.get(f"/api/challenges/{created.json()['id']}")

    for response in (created, fetched):
        assert_no_hidden_text(response)


def test_public_schema_has_no_hidden_fields() -> None:
    schema = TestClient(app).get("/openapi.json").json()["components"]["schemas"]

    assert set(schema["ChallengePublic"]["properties"]) == {
        "id",
        "level",
        "topic",
        "scenario_md",
        "state",
        "rounds",
    }
