import json
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app.domain import Complete, Dimension, FollowUp, Rubric
from app.llm.schemas import Comparison, GeneratedChallenge, GradeResult, response_schema

RUBRIC_JSON: dict[str, Any] = {
    "dimensions": [
        {
            "key": "data",
            "name": "Data",
            "weight": 1.0,
            "full_marks_criteria": "Sources and labels.",
        },
        {"key": "model", "name": "Model", "weight": 2.0, "full_marks_criteria": "Fits the task."},
        {"key": "serving", "name": "Serving", "weight": 1.0, "full_marks_criteria": "Meets SLOs."},
    ]
}
RUBRIC = Rubric.model_validate(RUBRIC_JSON)
CONTEXT = {"rubric": RUBRIC}

GRADE_JSON: dict[str, Any] = {
    "scores": {"data": 4, "model": 3, "serving": 0},
    "comment": "Solid data plan; serving is missing.",
    "verdict": {"kind": "follow_up", "question": "How would you serve this at 10k QPS?"},
}

COMPARISON_JSON: dict[str, Any] = {
    "summary_md": "You covered **data** well.",
    "notes": {"data": "Matches the reference.", "model": "Close.", "serving": "Not covered."},
}


def parse_grade(**changes: Any) -> GradeResult:
    return GradeResult.model_validate_json(json.dumps({**GRADE_JSON, **changes}), context=CONTEXT)


def parse_comparison(**changes: Any) -> Comparison:
    return Comparison.model_validate_json(
        json.dumps({**COMPARISON_JSON, **changes}), context=CONTEXT
    )


# --- generated challenge -------------------------------------------------------


def test_generated_challenge_parses_from_json() -> None:
    raw = {"scenario_md": "Design X.", "reference_md": "Do Y.", "rubric": RUBRIC_JSON}

    challenge = GeneratedChallenge.model_validate_json(json.dumps(raw))

    assert challenge.scenario_md == "Design X."
    assert challenge.reference_md == "Do Y."
    assert challenge.rubric.dimensions[1] == Dimension(
        key="model", name="Model", weight=2.0, full_marks_criteria="Fits the task."
    )


def test_generated_challenge_rejects_a_bad_rubric() -> None:
    raw = {"scenario_md": "x", "reference_md": "y", "rubric": {"dimensions": []}}

    with pytest.raises(ValidationError, match="rubric"):
        GeneratedChallenge.model_validate_json(json.dumps(raw))


# --- grade -------------------------------------------------------------------


def test_grade_parses_from_json() -> None:
    grade = parse_grade()

    assert grade.scores == {"data": 4, "model": 3, "serving": 0}
    assert grade.comment == "Solid data plan; serving is missing."
    assert grade.verdict == FollowUp(question="How would you serve this at 10k QPS?")


def test_grade_accepts_a_complete_verdict() -> None:
    assert parse_grade(verdict={"kind": "complete"}).verdict == Complete()


@pytest.mark.parametrize("score", [0, 5])
def test_grade_accepts_scores_from_zero_to_five(score: int) -> None:
    assert parse_grade(scores={"data": score, "model": 1, "serving": 1}).scores["data"] == score


@pytest.mark.parametrize("score", [-1, 6, 2.5])
def test_grade_rejects_scores_outside_zero_to_five(score: float) -> None:
    with pytest.raises(ValidationError, match=r"scores\.data"):
        parse_grade(scores={"data": score, "model": 1, "serving": 1})


def test_grade_rejects_a_missing_dimension_score() -> None:
    with pytest.raises(ValidationError, match=r"missing.*\['serving'\]"):
        parse_grade(scores={"data": 1, "model": 1})


def test_grade_rejects_an_extra_dimension_score() -> None:
    with pytest.raises(ValidationError, match=r"unexpected.*\['latency'\]"):
        parse_grade(scores={"data": 1, "model": 1, "serving": 1, "latency": 1})


def test_grade_rejects_a_blank_comment() -> None:
    with pytest.raises(ValidationError, match="comment"):
        parse_grade(comment="  ")


# --- comparison ----------------------------------------------------------------


def test_comparison_parses_from_json() -> None:
    comparison = parse_comparison()

    assert comparison.summary_md == "You covered **data** well."
    assert comparison.notes["serving"] == "Not covered."


def test_comparison_rejects_notes_that_do_not_match_the_rubric() -> None:
    with pytest.raises(ValidationError, match=r"missing.*\['serving'\].*unexpected.*\['ops'\]"):
        parse_comparison(notes={"data": "a", "model": "b", "ops": "c"})


# --- rubric context --------------------------------------------------------------


@pytest.mark.parametrize(
    ("model", "raw"), [(GradeResult, GRADE_JSON), (Comparison, COMPARISON_JSON)]
)
def test_rubric_bound_models_refuse_to_parse_without_a_rubric(
    model: type[BaseModel], raw: dict[str, Any]
) -> None:
    with pytest.raises(ValidationError, match="rubric"):
        model.model_validate_json(json.dumps(raw))


# --- response_format -------------------------------------------------------------


@pytest.mark.parametrize("model", [GeneratedChallenge, GradeResult, Comparison])
def test_json_schema_is_a_closed_object_usable_as_response_format(model: type[BaseModel]) -> None:
    schema = model.model_json_schema()

    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    json.dumps(schema)


def test_grade_schema_bounds_each_score() -> None:
    scores = GradeResult.model_json_schema()["properties"]["scores"]

    assert scores["additionalProperties"] == {"type": "integer", "minimum": 0, "maximum": 5}


def test_grade_schema_requires_the_verdict_tag() -> None:
    defs = GradeResult.model_json_schema()["$defs"]

    assert "kind" in defs["FollowUp"]["required"]
    assert "kind" in defs["Complete"]["required"]


# --- per-request response schema -----------------------------------------------


def _keys_in(schema: Any, key: str) -> bool:
    if isinstance(schema, dict):
        return key in schema or any(_keys_in(v, key) for v in schema.values())
    if isinstance(schema, list):
        return any(_keys_in(v, key) for v in schema)
    return False


@pytest.mark.parametrize(
    ("model", "field", "value"),
    [
        (GradeResult, "scores", {"type": "integer", "minimum": 0, "maximum": 5}),
        (Comparison, "notes", {"type": "string", "pattern": r"\S"}),
    ],
)
def test_response_schema_requires_every_rubric_key(
    model: type[GradeResult | Comparison], field: str, value: dict[str, Any]
) -> None:
    keyed = response_schema(model, RUBRIC)["properties"][field]

    assert keyed == {
        "type": "object",
        "title": field.title(),
        "properties": {"data": value, "model": value, "serving": value},
        "required": ["data", "model", "serving"],
        "additionalProperties": False,
    }


@pytest.mark.parametrize("model", [GeneratedChallenge, GradeResult, Comparison])
def test_response_schema_has_no_keyword_anthropic_rejects(model: type[BaseModel]) -> None:
    """Anthropic answers 400 to `discriminator`: "For 'anyOf', 'discriminator' is not
    supported"."""
    schema = response_schema(model, RUBRIC)

    assert not _keys_in(schema, "discriminator")
    assert not _keys_in(schema, "oneOf")
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False


def test_response_schema_keeps_the_verdict_union_as_any_of() -> None:
    verdict = response_schema(GradeResult, RUBRIC)["properties"]["verdict"]

    assert verdict["anyOf"] == [{"$ref": "#/$defs/FollowUp"}, {"$ref": "#/$defs/Complete"}]


def test_response_schema_without_a_rubric_is_the_model_schema() -> None:
    assert response_schema(GeneratedChallenge) == GeneratedChallenge.model_json_schema()


def test_response_schema_of_a_rubric_bound_model_needs_the_rubric() -> None:
    with pytest.raises(ValueError, match="rubric"):
        response_schema(GradeResult)


def test_a_key_mismatch_names_the_field_and_the_missing_and_unexpected_keys() -> None:
    with pytest.raises(ValidationError) as caught:
        parse_comparison(notes={"data": "Good.", "extra": "Odd."})

    [error] = caught.value.errors()
    assert error["type"] == "rubric_keys"
    assert error["msg"] == (
        "`notes` must have exactly the rubric's keys ['data', 'model', 'serving']: "
        "missing ['model', 'serving'], unexpected ['extra']"
    )
