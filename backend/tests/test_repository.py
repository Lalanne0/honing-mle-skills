from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import Engine, event

from app.challenge import Challenge, Round
from app.db import create_tables, make_engine, memory_engine
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
from app.repository import ChallengeChangedError, ChallengeNotFoundError, ChallengeRepository

RUBRIC = Rubric(
    dimensions=tuple(
        Dimension(key=k, name=k.title(), weight=w, full_marks_criteria=f"Covers {k}.")
        for k, w in [("data", 1.0), ("modeling", 2.5), ("serving", 0.5)]
    )
)
T0 = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


def comparison(summary: str = "Close to the reference.") -> Comparison:
    return Comparison.model_validate(
        {"summary_md": summary, "notes": {d.key: f"Note on {d.key}." for d in RUBRIC.dimensions}},
        context={"rubric": RUBRIC},
    )


def challenge(
    level: Level = Level.MID,
    topic: Topic = Topic.RECOMMENDER_SYSTEMS,
    created_at: datetime = T0,
    state: State | None = None,
    rounds: tuple[Round, ...] = (),
) -> Challenge:
    return Challenge(
        created_at=created_at,
        level=level,
        topic=topic,
        scenario_md="Design a feed ranker.",
        reference_md="Two-tower retrieval, then a ranker.",
        rubric=RUBRIC,
        state=state or Awaiting(round=1),
        rounds=rounds,
        comparison=comparison() if isinstance(state, Revealed) else None,
    )


def round_(n: int, *, follow_up: bool = True) -> Round:
    return Round(
        n=n,
        answer_md=f"Answer {n}",
        scores={"data": 3, "modeling": 5, "serving": 0},
        comment="Solid on modeling.",
        verdict=FollowUp(question="What about cold start?") if follow_up else Complete(),
    )


@pytest.fixture
def engine() -> Engine:
    return memory_engine()


@pytest.fixture
def repo(engine: Engine) -> ChallengeRepository:
    return ChallengeRepository(engine)


# --- create and read -----------------------------------------------------------


def test_a_created_challenge_reads_back_as_the_same_domain_object(
    repo: ChallengeRepository,
) -> None:
    original = challenge(state=Completed(), rounds=(round_(1), round_(2, follow_up=False)))

    repo.create(original)

    assert repo.get(original.id) == original


def test_a_non_utc_creation_time_reads_back_as_the_same_instant_in_utc(
    repo: ChallengeRepository,
) -> None:
    paris = timezone(timedelta(hours=2))
    original = challenge(created_at=datetime(2026, 11, 23, 14, 0, tzinfo=paris))

    repo.create(original)

    assert repo.get(original.id).created_at == T0
    assert repo.get(original.id).created_at.utcoffset() == timedelta(0)


def test_reading_an_unknown_challenge_raises(repo: ChallengeRepository) -> None:
    with pytest.raises(ChallengeNotFoundError):
        repo.get(uuid4())


# --- rounds ------------------------------------------------------------------------


def test_adding_a_round_stores_it_with_the_new_state(repo: ChallengeRepository) -> None:
    created = challenge()
    repo.create(created)

    updated = repo.add_round(created.id, round_(1), Awaiting(round=2))

    assert updated == created.model_copy(
        update={"rounds": (round_(1),), "state": Awaiting(round=2)}
    )
    assert repo.get(created.id) == updated


def test_rounds_read_back_in_order(repo: ChallengeRepository) -> None:
    created = challenge()
    repo.create(created)

    for n in (1, 2, 3):
        repo.add_round(created.id, round_(n), Awaiting(round=min(n + 1, 3)))

    assert [r.n for r in repo.get(created.id).rounds] == [1, 2, 3]


def test_a_challenge_and_its_rounds_are_read_in_one_statement(
    engine: Engine, repo: ChallengeRepository
) -> None:
    """One statement is one SQLite snapshot: a round committed by another request can
    never land between reading the state and reading the rounds."""
    stored = challenge(state=Awaiting(round=3), rounds=(round_(1), round_(2)))
    repo.create(stored)
    statements: list[str] = []
    event.listen(engine, "before_cursor_execute", lambda *a: statements.append(a[2]))

    assert repo.get(stored.id) == stored
    assert len(statements) == 1


def test_a_duplicate_round_is_rejected_and_nothing_changes(repo: ChallengeRepository) -> None:
    created = challenge()
    repo.create(created)
    after_first = repo.add_round(created.id, round_(1), Awaiting(round=2))

    with pytest.raises(ChallengeChangedError):
        repo.add_round(created.id, round_(1, follow_up=False), Completed())

    assert repo.get(created.id) == after_first


def test_adding_a_round_to_an_unknown_challenge_raises(repo: ChallengeRepository) -> None:
    with pytest.raises(ChallengeNotFoundError):
        repo.add_round(uuid4(), round_(1), Awaiting(round=2))


def test_the_same_round_number_is_allowed_in_different_challenges(
    repo: ChallengeRepository,
) -> None:
    first, second = challenge(), challenge()
    repo.create(first)
    repo.create(second)

    repo.add_round(first.id, round_(1), Awaiting(round=2))
    repo.add_round(second.id, round_(1), Awaiting(round=2))

    assert len(repo.get(second.id).rounds) == 1


def test_a_round_is_refused_once_the_challenge_no_longer_takes_answers(
    repo: ChallengeRepository,
) -> None:
    """A reveal stored while an answer was being graded wins: the late round is not stored."""
    created = challenge()
    repo.create(created)
    revealed = repo.reveal(created, comparison())

    with pytest.raises(ChallengeChangedError):
        repo.add_round(created.id, round_(1), Awaiting(round=2))

    assert repo.get(created.id) == revealed


# --- reveal --------------------------------------------------------------------------


def test_revealing_stores_the_comparison_with_the_revealed_state(
    repo: ChallengeRepository,
) -> None:
    created = challenge(state=Awaiting(round=2), rounds=(round_(1),))
    repo.create(created)

    revealed = repo.reveal(created, comparison())

    assert revealed == created.model_copy(update={"state": Revealed(), "comparison": comparison()})
    assert repo.get(created.id) == revealed


def test_revealing_again_keeps_the_first_comparison(repo: ChallengeRepository) -> None:
    created = challenge()
    repo.create(created)
    first = repo.reveal(created, comparison("First."))

    again = repo.reveal(created, comparison("Second."))

    assert again == first
    assert repo.get(created.id).comparison == comparison("First.")


def test_revealing_an_unknown_challenge_raises(repo: ChallengeRepository) -> None:
    with pytest.raises(ChallengeNotFoundError):
        repo.reveal(challenge(), comparison())


def test_revealing_a_challenge_answered_since_it_was_read_stores_nothing(
    repo: ChallengeRepository,
) -> None:
    """A comparison written from round 1 must not be stored beside round 2."""
    read = challenge(state=Awaiting(round=2), rounds=(round_(1),))
    repo.create(read)
    answered = repo.add_round(read.id, round_(2), Awaiting(round=3))

    with pytest.raises(ChallengeChangedError):
        repo.reveal(read, comparison())

    assert repo.get(read.id) == answered


# --- list ----------------------------------------------------------------------------


def test_list_is_newest_first_with_rounds(repo: ChallengeRepository) -> None:
    older = challenge(created_at=T0)
    newer = challenge(created_at=T0 + timedelta(minutes=5), state=Revealed())
    repo.create(older)
    repo.create(newer)
    with_round = repo.add_round(older.id, round_(1), Awaiting(round=2))

    assert repo.list() == [newer, with_round]


def test_list_reads_challenges_rounds_and_comparisons_in_one_statement(
    engine: Engine, repo: ChallengeRepository
) -> None:
    """One statement is one SQLite snapshot: a reveal committed by another request can never
    land between reading a challenge's state and reading its comparison."""
    answered = challenge(state=Awaiting(round=2), rounds=(round_(1),))
    revealed = challenge(created_at=T0 + timedelta(minutes=5), state=Revealed())
    repo.create(answered)
    repo.create(revealed)
    statements: list[str] = []
    event.listen(engine, "before_cursor_execute", lambda *a: statements.append(a[2]))

    assert repo.list() == [revealed, answered]
    assert len(statements) == 1


def test_list_filters_by_topic_and_level(repo: ChallengeRepository) -> None:
    combos = [
        (lv, tp)
        for lv in (Level.JUNIOR, Level.SENIOR)
        for tp in (Topic.RECOMMENDER_SYSTEMS, Topic.MODEL_SERVING)
    ]
    for i, (level, topic) in enumerate(combos):
        repo.create(challenge(level=level, topic=topic, created_at=T0 + timedelta(minutes=i)))

    def keys(found: list[Challenge]) -> list[tuple[Level, Topic]]:
        return [(c.level, c.topic) for c in found]

    assert keys(repo.list(topic=Topic.MODEL_SERVING)) == [
        (Level.SENIOR, Topic.MODEL_SERVING),
        (Level.JUNIOR, Topic.MODEL_SERVING),
    ]
    assert keys(repo.list(level=Level.JUNIOR)) == [
        (Level.JUNIOR, Topic.MODEL_SERVING),
        (Level.JUNIOR, Topic.RECOMMENDER_SYSTEMS),
    ]
    assert keys(repo.list(topic=Topic.RECOMMENDER_SYSTEMS, level=Level.SENIOR)) == [
        (Level.SENIOR, Topic.RECOMMENDER_SYSTEMS)
    ]


def test_list_of_an_empty_store_is_empty(repo: ChallengeRepository) -> None:
    assert repo.list() == []


# --- database file -----------------------------------------------------------------


def test_creating_tables_twice_keeps_the_data(tmp_path: Path) -> None:
    db = tmp_path / "data" / "app.db"
    engine = make_engine(db)
    create_tables(engine)
    stored = challenge()
    ChallengeRepository(engine).create(stored)

    create_tables(make_engine(db))

    assert ChallengeRepository(make_engine(db)).get(stored.id) == stored
