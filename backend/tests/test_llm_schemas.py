import json
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app.domain import Complete, Dimension, FollowUp, Rubric
from app.llm.schemas import Comparison, GeneratedChallenge, GradeResult

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
