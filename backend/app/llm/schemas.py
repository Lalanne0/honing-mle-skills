"""What the model must return for each LLM call.

Each model's `model_json_schema()` is sent as the `response_format` json_schema
(`strict: false`). Replies that depend on a rubric are parsed with
`context={"rubric": rubric}`, so a reply whose dimension keys do not match the
rubric fails validation like any other malformed reply.
"""

from typing import Annotated, ClassVar, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    ValidationInfo,
    ValidatorFunctionWrapHandler,
    WrapValidator,
    model_validator,
)

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
        rubric.check_keys(getattr(self, self._keyed_field))
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
