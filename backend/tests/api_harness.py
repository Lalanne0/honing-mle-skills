"""Shared setup for the HTTP API tests: an app wired to an in-memory store and `FakeLLM`."""

import random

from fastapi.testclient import TestClient
from httpx2 import Response

from app.api import get_llm, get_repository, get_rng
from app.db import memory_engine
from app.domain import Level, Topic
from app.llm.fake import RUBRIC, FakeLLM
from app.llm.port import LLMPort
from app.main import app
from app.repository import ChallengeRepository

FAKE_CHALLENGE = FakeLLM().generate(Level.MID, Topic.MODEL_SERVING)
FAKE_REFERENCE = FAKE_CHALLENGE.reference_md
HIDDEN_TEXT = [FAKE_REFERENCE, *(d.full_marks_criteria for d in RUBRIC.dimensions)]


class Harness:
    def __init__(self) -> None:
        self.repository = ChallengeRepository(memory_engine())
        self.llm: LLMPort = FakeLLM()
        self.rng = random.Random(7)
        app.dependency_overrides[get_repository] = lambda: self.repository
        app.dependency_overrides[get_llm] = lambda: self.llm
        app.dependency_overrides[get_rng] = lambda: self.rng
        self.client = TestClient(app)

    def create(self, **body: str) -> Response:
        return self.client.post("/api/challenges", json=body)


def assert_no_hidden_text(response: Response) -> None:
    for text in HIDDEN_TEXT:
        assert text not in response.text
    assert "reference_md" not in response.json()
    assert "rubric" not in response.json()
