"""The real LLM: an OpenAI-compatible gateway (LiteLLM proxy) called with the `openai` SDK.

The gateway is not trusted to enforce the JSON schema (`strict: false`), so every
reply is parsed with its Pydantic model, which also runs the domain checks. A
reply that fails is retried once with the validation error; a second failure
raises `LLMSchemaError`. Transport failures become the typed errors in
`app.llm.errors`. The SDK never retries on its own (`max_retries=0`).
"""

import logging
from collections.abc import Sequence
from typing import Any

import httpx2
import openai
from openai.types.chat import ChatCompletion, ChatCompletionMessageParam
from openai.types.shared_params import ResponseFormatJSONSchema
from pydantic import BaseModel, SecretStr, ValidationError

from app.domain import Level, Rubric, Topic
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
from app.llm.prompts import PastRound, compare_prompt, generate_prompt, grade_prompt
from app.llm.schemas import Comparison, GeneratedChallenge, GradeResult, response_schema

logger = logging.getLogger("app.llm")

TIMEOUT_SECONDS = 120.0
MAX_TOKENS = 8192
"""Room for a full scenario, reference solution and rubric."""
MAX_GATEWAY_MESSAGE = 500
"""Characters of the gateway's error message kept in a typed error."""


def _retry_after(response: httpx2.Response) -> float | None:
    try:
        return float(response.headers["retry-after"])
    except (KeyError, ValueError):
        return None


def _gateway_message(body: object, secret: str) -> str:
    """The error message in a gateway error body, truncated, with the API key redacted.

    Only the message: never the headers or the rest of the body.
    """
    while isinstance(body, dict):
        body = body.get("error") or body.get("message") or body.get("detail")
    text = str(body).replace(secret, "[redacted]")
    return text if len(text) <= MAX_GATEWAY_MESSAGE else text[:MAX_GATEWAY_MESSAGE] + "…"


def _typed_error(error: openai.APIError, secret: str) -> LLMError:
    """Translate an SDK error, most specific first."""
    if isinstance(error, openai.APIConnectionError):
        return LLMUnavailableError(f"LLM gateway unreachable: {type(error).__name__}")
    if not isinstance(error, openai.APIStatusError):
        return LLMError(f"LLM gateway call failed: {type(error).__name__}")
    status = error.status_code
    message = (
        f"LLM gateway returned HTTP {status} (request id {error.request_id}): "
        f"{_gateway_message(error.body, secret)}"
    )
    if status == 429:
        return LLMRateLimitedError(message, _retry_after(error.response))
    if status >= 500:
        return LLMUpstreamError(message)
    if status in (401, 403):
        return LLMConfigError(f"{message}; check LLM_API_KEY in backend/.env")
    return LLMError(message)


def _reply_text(completion: ChatCompletion) -> str:
    """The reply's content, or a typed error when it was cut off or refused."""
    if not completion.choices:
        raise LLMUpstreamError("the gateway returned no choices")
    choice = completion.choices[0]
    if choice.finish_reason == "length":
        raise LLMTruncatedError("the reply hit the token limit before it was complete")
    if choice.finish_reason == "content_filter":
        raise LLMRefusalError("the content filter blocked the reply")
    if choice.message.refusal:
        raise LLMRefusalError("the model refused to answer")
    return choice.message.content or ""


def _log_usage(completion: ChatCompletion, call: str, attempt: int) -> None:
    usage = completion.usage
    if usage is None:
        return
    logger.info(
        "LLM usage: call=%s attempt=%d model=%s "
        "prompt_tokens=%d completion_tokens=%d total_tokens=%d",
        call,
        attempt,
        completion.model,
        usage.prompt_tokens,
        usage.completion_tokens,
        usage.total_tokens,
    )


def _error_summary(error: ValidationError) -> str:
    """Where validation failed and Pydantic's fixed error type, e.g. `rubric.dimensions: too_short`.

    Never the messages or inputs: they can quote the model's reply, which holds the
    hidden reference solution and rubric, and this summary can reach an API response.
    """
    return "; ".join(
        f"{'.'.join(map(str, e['loc'])) or 'reply'}: {e['type']}" for e in error.errors()
    )


def _retry_note(error: ValidationError) -> str:
    """Tells the model what was wrong, one line per error: where, and Pydantic's message.

    Only sent back to the model, so the messages may name the rubric's keys.
    """
    problems = "\n".join(
        f"- {'.'.join(map(str, e['loc'])) or 'reply'}: {e['msg']}"
        for e in error.errors(include_url=False)
    )
    return (
        f"Your reply failed validation:\n\n{problems}\n\n"
        "Reply again with the corrected JSON object only."
    )


class OpenAICompatibleLLM:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: SecretStr,
        model: str,
        http_client: httpx2.Client | None = None,
    ) -> None:
        self._model = model
        self._client = openai.OpenAI(
            base_url=base_url,
            api_key=api_key.get_secret_value(),
            max_retries=0,
            timeout=TIMEOUT_SECONDS,
            http_client=http_client,
        )

    def generate(self, level: Level, topic: Topic) -> GeneratedChallenge:
        return self._ask("generate", generate_prompt(level, topic), GeneratedChallenge)

    def grade(
        self, challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str
    ) -> GradeResult:
        prompt = grade_prompt(challenge, previous, answer)
        return self._ask("grade", prompt, GradeResult, challenge.rubric)

    def compare(self, challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> Comparison:
        prompt = compare_prompt(challenge, rounds)
        return self._ask("compare", prompt, Comparison, challenge.rubric)

    def _ask[R: BaseModel](
        self, call: str, prompt: str, schema: type[R], rubric: Rubric | None = None
    ) -> R:
        messages: list[ChatCompletionMessageParam] = [{"role": "user", "content": prompt}]
        context = {"rubric": rubric} if rubric else None
        json_schema = response_schema(schema, rubric)
        text = self._complete(call, 1, messages, schema.__name__, json_schema)
        try:
            return schema.model_validate_json(text, context=context)
        except ValidationError as error:
            messages.append({"role": "assistant", "content": text})
            messages.append({"role": "user", "content": _retry_note(error)})
        text = self._complete(call, 2, messages, schema.__name__, json_schema)
        try:
            return schema.model_validate_json(text, context=context)
        except ValidationError as error:
            raise LLMSchemaError(
                f"{call} reply failed validation twice: {_error_summary(error)}"
            ) from error

    def _complete(
        self,
        call: str,
        attempt: int,
        messages: list[ChatCompletionMessageParam],
        name: str,
        json_schema: dict[str, Any],
    ) -> str:
        response_format: ResponseFormatJSONSchema = {
            "type": "json_schema",
            "json_schema": {
                "name": name,
                "schema": json_schema,
                "strict": False,
            },
        }
        try:
            completion = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                response_format=response_format,
                max_tokens=MAX_TOKENS,
            )
        except openai.APIError as error:
            raise _typed_error(error, self._client.api_key) from None
        _log_usage(completion, call, attempt)
        return _reply_text(completion)
