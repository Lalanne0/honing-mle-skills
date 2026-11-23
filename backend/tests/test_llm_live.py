"""One real generate call through the gateway. Costs money: run only when asked.

    uv run pytest -m live -s tests/test_llm_live.py

Prints the parsed challenge and the call's token usage (never the key).
"""

import logging

import pytest

from app.domain import Level, Topic
from app.llm.factory import make_llm
from app.llm.gateway import OpenAICompatibleLLM
from app.settings import load_settings


@pytest.mark.live
def test_generate_through_the_gateway(caplog: pytest.LogCaptureFixture) -> None:
    llm = make_llm(load_settings())
    assert isinstance(llm, OpenAICompatibleLLM), "set LLM_MODE=real for the live test"

    with caplog.at_level(logging.INFO, logger="app.llm"):
        challenge = llm.generate(Level.MID, Topic.MODEL_SERVING)

    print("\n--- parsed GeneratedChallenge ---")
    print(challenge.model_dump_json(indent=2))
    print("--- token usage ---")
    for record in caplog.records:
        print(record.getMessage())
    assert caplog.records, "the gateway reported no token usage"
