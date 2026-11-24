from datetime import UTC, datetime, timedelta

import pytest

from app.challenge import Challenge, Round
from app.domain import (
    Awaiting,
    Complete,
    Completed,
    Dimension,
    FollowUp,
    Level,
    Revealed,
    Rubric,
    State,
    Topic,
)
from app.llm.schemas import Comparison
from app.stats import DimensionStat, TopicStats, topic_stats, weighted_score

RUBRIC = Rubric(
    dimensions=tuple(
        Dimension(key=k, name=k.title(), weight=w, full_marks_criteria=f"Covers {k}.")
        for k, w in [("data", 1.0), ("modeling", 3.0), ("serving", 1.0)]
    )
)
T0 = datetime(2026, 11, 1, 9, 0, tzinfo=UTC)


def round_(n: int, data: int, modeling: int, serving: int) -> Round:
    return Round(
        n=n,
        answer_md=f"Answer {n}.",
        scores={"data": data, "modeling": modeling, "serving": serving},
        comment="Graded.",
        verdict=FollowUp(question="More?"),
    )


def challenge(
    *rounds: Round,
    topic: Topic = Topic.MODEL_SERVING,
    day: int = 0,
    state: State | None = None,
    rubric: Rubric = RUBRIC,
) -> Challenge:
    revealed = isinstance(state, Revealed)
    return Challenge(
        created_at=T0 + timedelta(days=day),
        level=Level.MID,
        topic=topic,
        scenario_md="Design it.",
        reference_md="The reference.",
        rubric=rubric,
        state=state or (Completed() if rounds else Awaiting(round=1)),
        rounds=rounds,
        comparison=Comparison.model_validate(
            {"summary_md": "Compared.", "notes": {d.key: "Note." for d in rubric.dimensions}},
            context={"rubric": rubric},
        )
        if revealed
        else None,
    )


# --- weighted score -----------------------------------------------------------------


def test_the_weighted_score_of_full_marks_is_100() -> None:
    assert weighted_score(challenge(round_(1, 5, 5, 5))) == 100


def test_the_weighted_score_weighs_each_dimension_by_its_rubric_weight() -> None:
    # (1*5 + 3*0 + 1*0) / (5 weights * 5 max) = 20%
    assert weighted_score(challenge(round_(1, 5, 0, 0))) == pytest.approx(20)
    # (1*0 + 3*5 + 1*0) / 25 = 60%
    assert weighted_score(challenge(round_(1, 0, 5, 0))) == pytest.approx(60)


def test_the_weighted_score_comes_from_the_last_graded_round() -> None:
    assert weighted_score(challenge(round_(1, 0, 0, 0), round_(2, 5, 5, 5))) == 100


def test_a_challenge_without_a_graded_round_has_no_weighted_score() -> None:
    assert weighted_score(challenge()) is None


# --- topic stats ---------------------------------------------------------------------


def test_no_challenges_give_no_stats() -> None:
    assert topic_stats([]) == []


def test_one_topic_averages_the_last_round_of_each_challenge() -> None:
    stats = topic_stats(
        [
            challenge(round_(1, 0, 0, 0), round_(2, 5, 5, 5), day=0),  # 100
            challenge(round_(1, 5, 0, 0), day=1),  # 20
        ]
    )

    assert len(stats) == 1
    (serving,) = stats
    assert serving.topic == Topic.MODEL_SERVING
    assert serving.attempts == 2
    assert serving.graded == 2
    assert serving.average_score == pytest.approx(60)


def test_the_trend_is_the_latest_score_minus_the_mean_of_the_earlier_ones() -> None:
    stats = topic_stats(
        [
            challenge(round_(1, 5, 5, 5), day=2),  # 100, latest, listed first
            challenge(round_(1, 5, 0, 0), day=0),  # 20
            challenge(round_(1, 0, 5, 0), day=1),  # 60
        ]
    )

    assert stats[0].trend == pytest.approx(100 - (20 + 60) / 2)


def test_a_falling_score_gives_a_negative_trend() -> None:
    stats = topic_stats(
        [challenge(round_(1, 5, 5, 5), day=0), challenge(round_(1, 5, 0, 0), day=1)]
    )

    assert stats[0].trend == pytest.approx(20 - 100)


def test_one_graded_challenge_has_no_trend() -> None:
    assert topic_stats([challenge(round_(1, 5, 5, 5))])[0].trend is None


def test_a_challenge_revealed_without_a_graded_round_counts_as_an_attempt_only() -> None:
    stats = topic_stats(
        [
            challenge(round_(1, 5, 0, 0), day=0),  # 20
            challenge(state=Revealed(), day=1),
            challenge(round_(1, 0, 5, 0), day=2),  # 60
        ]
    )

    (serving,) = stats
    assert serving.attempts == 3
    assert serving.graded == 2
    assert serving.average_score == pytest.approx(40)
    assert serving.trend == pytest.approx(60 - 20)


def test_a_topic_with_only_ungraded_challenges_has_no_score_trend_or_weak_dimension() -> None:
    stats = topic_stats([challenge(state=Revealed()), challenge(day=1)])

    assert stats == [
        TopicStats(
            topic=Topic.MODEL_SERVING,
            attempts=2,
            graded=0,
            average_score=None,
            trend=None,
            weakest_dimensions=(),
        )
    ]


def test_the_weakest_dimensions_have_the_lowest_average_score() -> None:
    stats = topic_stats(
        [challenge(round_(1, 4, 1, 5), day=0), challenge(round_(1, 2, 3, 5), day=1)]
    )

    assert stats[0].weakest_dimensions == (
        DimensionStat(key="modeling", average_score=2),
        DimensionStat(key="data", average_score=3),
    )


def test_the_weakest_dimensions_come_from_the_last_graded_round() -> None:
    stats = topic_stats([challenge(round_(1, 0, 0, 0), round_(2, 5, 4, 1))])

    assert stats[0].weakest_dimensions == (
        DimensionStat(key="serving", average_score=1),
        DimensionStat(key="modeling", average_score=4),
    )


def test_weakest_dimensions_tied_on_score_are_ordered_by_key() -> None:
    stats = topic_stats([challenge(round_(1, 2, 4, 2))])

    assert [d.key for d in stats[0].weakest_dimensions] == ["data", "serving"]


def test_dimensions_are_matched_by_key_across_rubrics() -> None:
    renamed = Rubric(
        dimensions=(
            Dimension(key="data", name="Data quality", weight=1, full_marks_criteria="x"),
            Dimension(key="latency", name="Latency", weight=1, full_marks_criteria="x"),
            Dimension(key="cost", name="Cost", weight=1, full_marks_criteria="x"),
        )
    )
    newer = Round(
        n=1,
        answer_md="Answer.",
        scores={"data": 0, "latency": 4, "cost": 5},
        comment="Graded.",
        verdict=Complete(),
    )

    stats = topic_stats(
        [challenge(round_(1, 4, 5, 5), day=0), challenge(newer, day=1, rubric=renamed)]
    )

    assert stats[0].weakest_dimensions == (
        DimensionStat(key="data", average_score=2),
        DimensionStat(key="latency", average_score=4),
    )


def test_several_topics_are_listed_weakest_first_then_ungraded() -> None:
    stats = topic_stats(
        [
            challenge(round_(1, 5, 5, 5), topic=Topic.FEATURE_STORES),  # 100
            challenge(state=Revealed(), topic=Topic.DATA_PIPELINES),
            challenge(round_(1, 5, 0, 0), topic=Topic.RECOMMENDER_SYSTEMS),  # 20
        ]
    )

    assert [(s.topic, s.attempts) for s in stats] == [
        (Topic.RECOMMENDER_SYSTEMS, 1),
        (Topic.FEATURE_STORES, 1),
        (Topic.DATA_PIPELINES, 1),
    ]


def test_a_topic_averaging_zero_comes_before_one_averaging_more() -> None:
    stats = topic_stats(
        [
            challenge(round_(1, 0, 0, 1), topic=Topic.DATA_PIPELINES),  # 4
            challenge(round_(1, 0, 0, 0), topic=Topic.FEATURE_STORES),  # 0
        ]
    )

    assert [s.topic for s in stats] == [Topic.FEATURE_STORES, Topic.DATA_PIPELINES]


def test_topics_tied_on_average_keep_the_topic_order() -> None:
    stats = topic_stats(
        [
            challenge(round_(1, 5, 0, 0), topic=Topic.PRIVACY_AND_SECURITY),
            challenge(round_(1, 5, 0, 0), topic=Topic.RAG_AND_LLM_APPS),
            challenge(state=Revealed(), topic=Topic.AB_TESTING_AND_EXPERIMENTATION),
            challenge(topic=Topic.MODEL_SERVING),
        ]
    )

    assert [s.topic for s in stats] == [
        Topic.RAG_AND_LLM_APPS,
        Topic.PRIVACY_AND_SECURITY,
        Topic.MODEL_SERVING,
        Topic.AB_TESTING_AND_EXPERIMENTATION,
    ]
