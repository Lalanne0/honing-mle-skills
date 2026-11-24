"""OpenAICompatibleLLM against a stubbed HTTP transport. No network."""

import json
import logging
import traceback
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from app.domain import Complete, Level, Topic
from app.llm.errors import (
    LLMConfigError,
    LLMError,
    LLMRateLimitedError,
    LLMRefusalError,
    LLMSchemaError,
    LLMTruncatedError,
    LLMUnavailableError,
    LLMUpstreamError,
)
from app.llm.gateway import OpenAICompatibleLLM
from app.llm.prompts import PastRound
from app.llm.schemas import GeneratedChallenge

KEY = "sk-test-do-not-leak-0123456789"
MODEL = "anthropic/test-model"

RUBRIC_JSON: dict[str, Any] = {
    "dimensions": [
        {"key": k, "name": k.title(), "weight": 1.0, "full_marks_criteria": f"Covers {k}."}
        for k in ("data", "model", "serving")
    ]
}
CHALLENGE_JSON: dict[str, Any] = {
    "scenario_md": "Design a feed ranker.",
    "reference_md": "Two-tower retrieval, then a ranker.",
    "rubric": RUBRIC_JSON,
}
CHALLENGE = GeneratedChallenge.model_validate(CHALLENGE_JSON)
GRADE_JSON: dict[str, Any] = {
    "scores": {"data": 4, "model": 3, "serving": 1},
    "comment": "Serving is thin.",
    "verdict": {"kind": "complete"},
}
COMPARISON_JSON: dict[str, Any] = {
    "summary_md": "Close to the reference.",
    "notes": {"data": "Good.", "model": "Good.", "serving": "Missing."},
}

Handler = Callable[[httpx2.Request], httpx2.Response]


def completion(
    content: str | None,
    *,
    finish_reason: str = "stop",
    refusal: str | None = None,
    prompt_tokens: int = 100,
    completion_tokens: int = 50,
) -> httpx2.Response:
    message: dict[str, Any] = {"role": "assistant", "content": content, "refusal": refusal}
    return httpx2.Response(
        200,
        json={
            "id": "chatcmpl-1",
            "object": "chat.completion",
            "created": 0,
            "model": MODEL,
            "choices": [{"index": 0, "message": message, "finish_reason": finish_reason}],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        },
    )


class Gateway:
    """Replies with the queued responses in order and records every request body."""

    def __init__(self, *replies: httpx2.Response | Handler) -> None:
        self.replies = list(replies)
        self.requests: list[dict[str, Any]] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(json.loads(request.content))
        reply = self.replies.pop(0)
        return reply(request) if callable(reply) else reply

    def llm(self) -> OpenAICompatibleLLM:
        return OpenAICompatibleLLM(
            base_url="https://gateway.test/v1",
            api_key=SecretStr(KEY),
            model=MODEL,
            http_client=httpx2.Client(transport=httpx2.MockTransport(self)),
        )


def raise_(error: Exception) -> Handler:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise error

    return handler


def error_status(status: int, headers: dict[str, str] | None = None) -> httpx2.Response:
    return httpx2.Response(status, headers=headers, json={"error": {"message": f"echo {KEY}"}})


def assert_key_not_leaked(error: BaseException) -> None:
    assert KEY not in "".join(traceback.format_exception(error))
    assert KEY not in repr(error)


# --- valid replies -------------------------------------------------------------


def test_generate_returns_the_parsed_challenge() -> None:
    gateway = Gateway(completion(json.dumps(CHALLENGE_JSON)))

    challenge = gateway.llm().generate(Level.MID, Topic.RECOMMENDER_SYSTEMS)

    assert challenge == CHALLENGE


def test_the_request_asks_for_the_schema_without_strict_mode() -> None:
    gateway = Gateway(completion(json.dumps(CHALLENGE_JSON)))

    gateway.llm().generate(Level.SENIOR, Topic.MODEL_SERVING)

    [body] = gateway.requests
    assert body["model"] == MODEL
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": {
            "name": "GeneratedChallenge",
            "schema": GeneratedChallenge.model_json_schema(),
            "strict": False,
        },
    }
    [message] = body["messages"]
    assert message["role"] == "user"
    assert "Level: senior" in message["content"]
    assert "Topic: model_serving" in message["content"]


def test_grade_checks_scores_against_the_challenge_rubric() -> None:
    gateway = Gateway(completion(json.dumps(GRADE_JSON)))

    grade = gateway.llm().grade(CHALLENGE, [], "Use a feature store.")

    assert grade.scores == {"data": 4, "model": 3, "serving": 1}
    assert grade.verdict == Complete()
    assert "Use a feature store." in gateway.requests[0]["messages"][0]["content"]


def test_compare_returns_notes_per_dimension() -> None:
    gateway = Gateway(completion(json.dumps(COMPARISON_JSON)))
    grade = Gateway(completion(json.dumps(GRADE_JSON))).llm().grade(CHALLENGE, [], "answer")

    comparison = gateway.llm().compare(CHALLENGE, [PastRound(answer="answer", grade=grade)])

    assert comparison.notes["serving"] == "Missing."


def test_each_request_logs_its_token_usage(caplog: pytest.LogCaptureFixture) -> None:
    gateway = Gateway(
        completion(json.dumps(CHALLENGE_JSON), prompt_tokens=1200, completion_tokens=3400)
    )

    with caplog.at_level(logging.INFO, logger="app.llm"):
        gateway.llm().generate(Level.MID, Topic.FEATURE_STORES)

    [record] = caplog.records
    assert record.getMessage() == (
        f"LLM usage: call=generate attempt=1 model={MODEL} "
        "prompt_tokens=1200 completion_tokens=3400 total_tokens=4600"
    )


# --- invalid replies -----------------------------------------------------------


def test_an_invalid_reply_is_retried_once_with_the_validation_error() -> None:
    bad = json.dumps({**CHALLENGE_JSON, "rubric": {"dimensions": []}})
    gateway = Gateway(completion(bad), completion(json.dumps(CHALLENGE_JSON)))

    challenge = gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert challenge == CHALLENGE
    retry = gateway.requests[1]["messages"]
    assert [m["role"] for m in retry] == ["user", "assistant", "user"]
    assert retry[1]["content"] == bad
    assert "rubric.dimensions" in retry[2]["content"]


def test_a_reply_that_breaks_the_rubric_is_retried() -> None:
    wrong_keys = {**GRADE_JSON, "scores": {"data": 4, "model": 3}}
    gateway = Gateway(completion(json.dumps(wrong_keys)), completion(json.dumps(GRADE_JSON)))

    grade = gateway.llm().grade(CHALLENGE, [], "answer")

    assert grade.scores["serving"] == 1
    assert "missing ['serving']" in gateway.requests[1]["messages"][2]["content"]


def test_two_invalid_replies_raise_a_schema_error_after_exactly_two_calls() -> None:
    gateway = Gateway(completion("not json"), completion("{}"), completion("unused"))

    with pytest.raises(LLMSchemaError) as caught:
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert len(gateway.requests) == 2
    assert "scenario_md" in str(caught.value)


def test_the_schema_error_names_the_bad_fields_but_never_quotes_the_reply() -> None:
    """The message reaches API responses, and a reply holds the hidden reference and rubric."""
    bad = {
        "scenario_md": "Design a feed ranker.",
        "reference_md": ["Two-tower retrieval"],
        "rubric": {"dimensions": [*RUBRIC_JSON["dimensions"][:2], RUBRIC_JSON["dimensions"][0]]},
    }
    reply = completion(json.dumps(bad))
    gateway = Gateway(reply, reply)

    with pytest.raises(LLMSchemaError) as caught:
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    message = str(caught.value)
    assert "reference_md" in message
    assert "rubric.dimensions" in message
    for hidden in ("Covers data.", "Covers model.", "Two-tower retrieval", "'data'"):
        assert hidden not in message


def test_an_empty_reply_counts_as_invalid() -> None:
    gateway = Gateway(completion(None), completion(json.dumps(CHALLENGE_JSON)))

    assert gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES) == CHALLENGE


def test_a_truncated_reply_raises_without_retry() -> None:
    gateway = Gateway(completion('{"scenario_md": "Des', finish_reason="length"))

    with pytest.raises(LLMTruncatedError):
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert len(gateway.requests) == 1


@pytest.mark.parametrize(
    ("reply", "reason"),
    [
        (completion(None, refusal="Private refusal text."), "the model refused to answer"),
        (completion(None, finish_reason="content_filter"), "the content filter blocked the reply"),
    ],
)
def test_a_refusal_raises_without_retry(reply: httpx2.Response, reason: str) -> None:
    gateway = Gateway(reply)

    with pytest.raises(LLMRefusalError) as caught:
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert str(caught.value) == reason

    assert len(gateway.requests) == 1


def test_a_reply_without_choices_is_an_upstream_error() -> None:
    empty = completion("{}")
    body = json.loads(empty.content)
    gateway = Gateway(httpx2.Response(200, json={**body, "choices": []}))

    with pytest.raises(LLMUpstreamError, match="no choices"):
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert len(gateway.requests) == 1


# --- transport errors ----------------------------------------------------------


def test_429_keeps_retry_after() -> None:
    gateway = Gateway(error_status(429, {"retry-after": "7"}))

    with pytest.raises(LLMRateLimitedError) as caught:
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert caught.value.retry_after == 7.0
    assert len(gateway.requests) == 1


def test_429_without_a_usable_retry_after() -> None:
    gateway = Gateway(error_status(429, {"retry-after": "Wed, 21 Oct 2026 07:28:00 GMT"}))

    with pytest.raises(LLMRateLimitedError) as caught:
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert caught.value.retry_after is None


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (error_status(500), LLMUpstreamError),
        (error_status(503), LLMUpstreamError),
        (error_status(401), LLMConfigError),
        (error_status(403), LLMConfigError),
        (error_status(400), LLMError),
        (raise_(httpx2.ConnectError("refused")), LLMUnavailableError),
        (raise_(httpx2.ReadTimeout("slow")), LLMUnavailableError),
    ],
)
def test_transport_failures_become_typed_errors_without_retry(
    reply: httpx2.Response | Handler, expected: type[LLMError]
) -> None:
    gateway = Gateway(reply)

    with pytest.raises(expected) as caught:
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)

    assert type(caught.value) is expected
    assert len(gateway.requests) == 1
    assert_key_not_leaked(caught.value)


def test_status_errors_say_which_status_came_back() -> None:
    gateway = Gateway(error_status(502))

    with pytest.raises(LLMUpstreamError, match="502"):
        gateway.llm().generate(Level.MID, Topic.DATA_PIPELINES)
