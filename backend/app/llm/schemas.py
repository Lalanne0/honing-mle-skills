"""What the model must return for each LLM call.

`response_schema()` builds the `response_format` json_schema (`strict: false`) for
each request: for a reply keyed by rubric dimension, every key of the challenge's
rubric is a required property. Replies that depend on a rubric are parsed with
`context={"rubric": rubric}`, so a reply whose dimension keys do not match the
rubric fails validation like any other malformed reply.
"""

from typing import Annotated, Any, ClassVar, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationInfo,
    ValidatorFunctionWrapHandler,
    WrapValidator,
    model_validator,
)
from pydantic_core import PydanticCustomError

from app.domain import NonBlank, Rubric, Score, Verdict


class _Reply(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class _RubricBound(_Reply):
    """A reply keyed by rubric dimension. Parse it with `context={"rubric": rubric}`."""

    _keyed_field: ClassVar[str]
    """The dict field whose keys must be exactly the rubric's dimension keys."""

    @model_validator(mode="after")
    def _keys_match_rubric(self, info: ValidationInfo) -> Self:
        rubric = (info.context or {}).get("rubric")
        if not isinstance(rubric, Rubric):
            raise ValueError("parse with context={'rubric': rubric} to check dimension keys")
        missing, unexpected = rubric.key_mismatch(getattr(self, self._keyed_field))
        if missing or unexpected:
            raise PydanticCustomError(
                "rubric_keys",
                "{detail}",
                {
                    "detail": f"`{self._keyed_field}` must have exactly the rubric's keys "
                    f"{rubric.keys}: missing {missing}, unexpected {unexpected}"
                },
            )
        return self


class GeneratedChallenge(_Reply):
    scenario_md: NonBlank
    reference_md: NonBlank
    rubric: Rubric


class GradeResult(_RubricBound):
    """The grade of one round's answer: a score per rubric dimension, a comment and a verdict."""

    scores: dict[str, Score]
    comment: NonBlank
    verdict: Verdict

    _keyed_field = "scores"


class Comparison(_RubricBound):
    """Shown at reveal: the user's answers compared with the reference, noted per dimension."""

    summary_md: NonBlank
    notes: dict[str, NonBlank]

    _keyed_field = "notes"


def _against_sibling_rubric(
    value: object, _: ValidatorFunctionWrapHandler, info: ValidationInfo
) -> Comparison:
    return Comparison.model_validate(value, context={"rubric": info.data.get("rubric")})


ComparisonOfRubric = Annotated[Comparison, WrapValidator(_against_sibling_rubric)]
"""A `Comparison` field checked against the `rubric` field declared before it in the same model."""


def _without_unsupported_keywords(schema: Any) -> Any:
    """`schema` without `discriminator`, and with `oneOf` as `anyOf`.

    Anthropic rejects `discriminator` ("For 'anyOf', 'discriminator' is not supported").
    The union members are told apart by their required `kind` const, so `anyOf` means the
    same here, and Pydantic still parses the reply as a tagged union.
    """
    if isinstance(schema, list):
        return [_without_unsupported_keywords(item) for item in schema]
    if not isinstance(schema, dict):
        return schema
    return {
        "anyOf" if key == "oneOf" else key: _without_unsupported_keywords(value)
        for key, value in schema.items()
        if key != "discriminator"
    }


def response_schema(model: type[BaseModel], rubric: Rubric | None = None) -> dict[str, Any]:
    """The JSON schema to send as `response_format` for a reply parsed as `model`.

    For a reply keyed by rubric dimension, the keyed field lists each of `rubric`'s keys
    as a required property and allows no other, so the model cannot return `{}`.
    """
    schema: dict[str, Any] = _without_unsupported_keywords(model.model_json_schema())
    if not issubclass(model, _RubricBound):
        return schema
    if rubric is None:
        raise ValueError(f"{model.__name__} is keyed by rubric dimension: pass the rubric")
    keyed = schema["properties"][model._keyed_field]
    value = keyed.pop("additionalProperties")
    keyed["properties"] = {key: value for key in rubric.keys}
    keyed["required"] = rubric.keys
    keyed["additionalProperties"] = False
    return schema
