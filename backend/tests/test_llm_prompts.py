import pytest

from app.domain import MAX_ROUNDS, Complete, Dimension, FollowUp, Level, Rubric, Topic
from app.llm.prompts import PastRound, compare_prompt, generate_prompt, grade_prompt
from app.llm.schemas import GeneratedChallenge, GradeResult

RUBRIC = Rubric(
    dimensions=tuple(
        Dimension(key=k, name=k.title(), weight=1.0, full_marks_criteria=f"Covers {k} fully.")
        for k in ("retrieval", "evaluation", "cost")
    )
)
CHALLENGE = GeneratedChallenge(
    scenario_md="Design a support chatbot over 2M internal docs.",
    reference_md="Hybrid retrieval with a reranker; offline eval set; cache answers.",
    rubric=RUBRIC,
)
ROUND_1 = PastRound(
    answer="I'd embed the docs and use a vector DB. Cost: $0.02 per query.",
    grade=GradeResult.model_validate(
        {
            "scores": {"retrieval": 3, "evaluation": 1, "cost": 2},
            "comment": "No evaluation plan.",
            "verdict": FollowUp(question="How would you evaluate answer quality?"),
        },
        context={"rubric": RUBRIC},
    ),
)
ROUND_2 = PastRound(
    answer="A golden set of 500 questions, judged weekly.",
    grade=GradeResult.model_validate(
        {
            "scores": {"retrieval": 3, "evaluation": 4, "cost": 2},
            "comment": "Good.",
            "verdict": Complete(),
        },
        context={"rubric": RUBRIC},
    ),
)


@pytest.mark.parametrize("level", list(Level))
@pytest.mark.parametrize("topic", list(Topic))
def test_generate_prompt_names_the_level_and_topic(level: Level, topic: Topic) -> None:
    prompt = generate_prompt(level, topic)

    assert f"Level: {level.value}" in prompt
    assert f"Topic: {topic.value}" in prompt


def test_grade_prompt_includes_scenario_rubric_reference_and_answer() -> None:
    prompt = grade_prompt(CHALLENGE, previous=[], answer="Use BM25 plus embeddings.")

    assert CHALLENGE.scenario_md in prompt
    assert CHALLENGE.reference_md in prompt
    assert "Covers evaluation fully." in prompt
    assert "Use BM25 plus embeddings." in prompt
    assert f"round 1 of {MAX_ROUNDS}" in prompt


def test_grade_prompt_includes_every_previous_round() -> None:
    prompt = grade_prompt(CHALLENGE, previous=[ROUND_1], answer="Golden set.")

    assert ROUND_1.answer in prompt
    assert 'Scores: {"retrieval": 3, "evaluation": 1, "cost": 2}' in prompt
    assert "No evaluation plan." in prompt
    assert "How would you evaluate answer quality?" in prompt
    assert f"round 2 of {MAX_ROUNDS}" in prompt


def test_grade_prompt_in_the_last_round_asks_for_a_complete_verdict() -> None:
    prompt = grade_prompt(CHALLENGE, previous=[ROUND_1, ROUND_2], answer="Final.")

    assert f"round {MAX_ROUNDS} of {MAX_ROUNDS}" in prompt
    assert "This is the last round" in prompt


def test_grade_prompt_before_the_last_round_does_not_say_it_is_the_last() -> None:
    assert "This is the last round" not in grade_prompt(CHALLENGE, previous=[], answer="x")


def test_grade_prompt_rejects_more_rounds_than_allowed() -> None:
    with pytest.raises(ValueError, match="at most"):
        grade_prompt(CHALLENGE, previous=[ROUND_1, ROUND_2, ROUND_2], answer="x")


def test_compare_prompt_includes_reference_rubric_and_all_rounds() -> None:
    prompt = compare_prompt(CHALLENGE, rounds=[ROUND_1, ROUND_2])

    assert CHALLENGE.scenario_md in prompt
    assert CHALLENGE.reference_md in prompt
    assert "Covers cost fully." in prompt
    assert ROUND_1.answer in prompt
    assert ROUND_2.answer in prompt
    assert "Round 2" in prompt
