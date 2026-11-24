"""Real calls through the gateway, one per test. Cost money: run only when asked.

    uv run pytest -m live -s tests/test_llm_live.py::<test>

Each prints its parsed reply and the call's token usage (never the key).
"""

import logging
from collections.abc import Callable

import pytest
from pydantic import BaseModel

from app.domain import Level, Topic
from app.llm.factory import make_llm
from app.llm.fake import FakeLLM
from app.llm.gateway import OpenAICompatibleLLM
from app.settings import load_settings


def run_live(
    caplog: pytest.LogCaptureFixture, call: Callable[[OpenAICompatibleLLM], BaseModel]
) -> None:
    llm = make_llm(load_settings())
    assert isinstance(llm, OpenAICompatibleLLM), "set LLM_MODE=real for the live test"

    with caplog.at_level(logging.INFO, logger="app.llm"):
        reply = call(llm)

    print(f"\n--- parsed {type(reply).__name__} ---")
    print(reply.model_dump_json(indent=2))
    print("--- token usage ---")
    for record in caplog.records:
        print(record.getMessage())
    assert caplog.records, "the gateway reported no token usage"


@pytest.mark.live
def test_generate_through_the_gateway(caplog: pytest.LogCaptureFixture) -> None:
    run_live(caplog, lambda llm: llm.generate(Level.MID, Topic.MODEL_SERVING))


@pytest.mark.live
def test_grade_through_the_gateway(caplog: pytest.LogCaptureFixture) -> None:
    """Grades a round-one answer to a fixed challenge, so only the grade call is paid for."""
    challenge = FakeLLM().generate(Level.MID, Topic.MODEL_SERVING)
    answer = (
        "Serve the model behind a stateless HTTP service on autoscaled GPU nodes, "
        "with dynamic batching, a p99 latency SLO of 200 ms, canary rollouts and "
        "per-version latency and error dashboards."
    )

    run_live(caplog, lambda llm: llm.grade(challenge, [], answer))
