from app.domain import MAX_ROUNDS, Complete, FollowUp, Level, Topic
from app.llm.fake import FakeLLM
from app.llm.port import LLMPort
from app.llm.prompts import PastRound


def rounds(llm: LLMPort, count: int) -> list[PastRound]:
    challenge = llm.generate(Level.MID, Topic.MODEL_SERVING)
    past: list[PastRound] = []
    for _ in range(count):
        past.append(PastRound(answer="answer", grade=llm.grade(challenge, past, "answer")))
    return past


def test_generate_is_deterministic_and_names_level_and_topic() -> None:
    llm: LLMPort = FakeLLM()

    first = llm.generate(Level.SENIOR, Topic.FEATURE_STORES)

    assert first == FakeLLM().generate(Level.SENIOR, Topic.FEATURE_STORES)
    assert "senior" in first.scenario_md
    assert "feature_stores" in first.scenario_md


def test_grade_scores_every_rubric_dimension_and_asks_a_follow_up_by_default() -> None:
    llm = FakeLLM()
    challenge = llm.generate(Level.MID, Topic.MODEL_SERVING)

    grade = llm.grade(challenge, [], "answer")

    assert set(grade.scores) == {d.key for d in challenge.rubric.dimensions}
    assert isinstance(grade.verdict, FollowUp)


def test_grade_can_be_set_to_complete() -> None:
    llm = FakeLLM(verdict="complete")
    challenge = llm.generate(Level.MID, Topic.MODEL_SERVING)

    assert llm.grade(challenge, [], "answer").verdict == Complete()


def test_the_last_round_always_completes() -> None:
    past = rounds(FakeLLM(), MAX_ROUNDS)

    assert [type(r.grade.verdict) for r in past] == [FollowUp] * (MAX_ROUNDS - 1) + [Complete]


def test_compare_notes_every_rubric_dimension() -> None:
    llm = FakeLLM()
    challenge = llm.generate(Level.MID, Topic.MODEL_SERVING)

    comparison = llm.compare(challenge, rounds(llm, 2))

    assert set(comparison.notes) == {d.key for d in challenge.rubric.dimensions}
    assert "2 rounds" in comparison.summary_md
