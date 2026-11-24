"""Stores challenges, their rounds and their comparison. The only code that opens a database
session.

Every state change is a conditional write: it applies only if the stored state is still the
one the change was computed from, so a concurrent answer or reveal is never overwritten.
"""

import json
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Engine, func, update
from sqlmodel import Session, col, select
from sqlmodel.sql.expression import Select

from app.challenge import Challenge, Round
from app.domain import Awaiting, Level, Revealed, State, Topic
from app.llm.schemas import Comparison
from app.tables import ChallengeRow, ComparisonRow, RoundRow

Joined = Select[ChallengeRow, RoundRow, ComparisonRow]
"""Outer-joined, so the round and comparison of a row may be None."""
Found = tuple[ChallengeRow, RoundRow | None, ComparisonRow | None]


class ChallengeNotFoundError(Exception):
    """No challenge has this id."""


class ChallengeChangedError(Exception):
    """The stored challenge changed since it was read, e.g. by a concurrent answer or reveal.
    Nothing was stored."""


class ChallengeRepository:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    def create(self, challenge: Challenge) -> None:
        with Session(self._engine) as session:
            session.add(_challenge_row(challenge))
            session.add_all(_round_row(challenge.id, r) for r in challenge.rounds)
            if challenge.comparison is not None:
                session.add(_comparison_row(challenge.id, challenge.comparison))
            session.commit()

    def get(self, challenge_id: UUID) -> Challenge:
        """Read the challenge, its rounds and its comparison in one statement, so all come
        from one snapshot."""
        query = _select().where(ChallengeRow.id == str(challenge_id)).order_by(col(RoundRow.n))
        found = _read(self._engine, query)
        if not found:
            raise ChallengeNotFoundError(f"no challenge {challenge_id}")
        return found[0]

    def add_round(self, challenge_id: UUID, round_: Round, state: State) -> Challenge:
        """Store a graded round and the state it led to, together or not at all.

        Refused unless the stored challenge still awaits this round, e.g. when the round was
        stored already or the challenge was revealed while this answer was being graded.
        """
        with Session(self._engine) as session:
            if not _set_state(session, challenge_id, Awaiting(round=round_.n), state):
                raise ChallengeChangedError(
                    f"challenge {challenge_id} no longer awaits round {round_.n}"
                )
            session.add(_round_row(challenge_id, round_))
            session.commit()
        return self.get(challenge_id)

    def reveal(self, challenge: Challenge, comparison: Comparison) -> Challenge:
        """Store the comparison of `challenge`'s rounds and the revealed state together.

        Idempotent: a challenge already revealed keeps its first comparison. Refused when an
        answer was stored since `challenge` was read, since the comparison would miss it.
        """
        with Session(self._engine) as session:
            if _set_state(session, challenge.id, challenge.state, Revealed()):
                session.add(_comparison_row(challenge.id, comparison))
                session.commit()
        stored = self.get(challenge.id)
        if stored.comparison is None:
            raise ChallengeChangedError(
                f"challenge {challenge.id} was answered while the comparison was written"
            )
        return stored

    def list(self, topic: Topic | None = None, level: Level | None = None) -> list[Challenge]:
        """Challenges newest first, optionally only one topic and/or level. One statement, so
        every challenge comes from one snapshot."""
        query = _select().order_by(
            col(ChallengeRow.created_at).desc(), col(ChallengeRow.id), col(RoundRow.n)
        )
        if topic is not None:
            query = query.where(ChallengeRow.topic == topic.value)
        if level is not None:
            query = query.where(ChallengeRow.level == level.value)
        return _read(self._engine, query)


# --- sessions -------------------------------------------------------------------


def _select() -> Joined:
    """Each challenge with its rounds and comparison: one row per round, or one row if none."""
    return (
        select(ChallengeRow, RoundRow, ComparisonRow)
        .join(RoundRow, isouter=True)
        .join(ComparisonRow, col(ComparisonRow.challenge_id) == ChallengeRow.id, isouter=True)
    )


def _set_state(session: Session, challenge_id: UUID, expected: State, new: State) -> bool:
    """Move the challenge from `expected` to `new` in one conditional write. False if the
    stored state is no longer `expected`; raises if there is no such challenge."""
    if session.get(ChallengeRow, str(challenge_id)) is None:
        raise ChallengeNotFoundError(f"no challenge {challenge_id}")
    result = session.exec(
        update(ChallengeRow)
        .where(
            col(ChallengeRow.id) == str(challenge_id),
            func.json(ChallengeRow.state) == func.json(json.dumps(_json(expected))),
        )
        .values(state=_json(new))
    )
    return result.rowcount == 1


def _read(engine: Engine, query: Joined) -> list[Challenge]:
    with Session(engine) as session:
        found = session.exec(query).all()
    return _assemble(found)


# --- domain <-> rows -----------------------------------------------------------------


def _json(state: State) -> dict[str, object]:
    return state.model_dump(mode="json")


def _challenge_row(challenge: Challenge) -> ChallengeRow:
    return ChallengeRow(
        id=str(challenge.id),
        created_at=challenge.created_at,
        level=challenge.level.value,
        topic=challenge.topic.value,
        scenario_md=challenge.scenario_md,
        reference_md=challenge.reference_md,
        rubric=challenge.rubric.model_dump(mode="json"),
        state=_json(challenge.state),
    )


def _round_row(challenge_id: UUID, round_: Round) -> RoundRow:
    return RoundRow(challenge_id=str(challenge_id), **round_.model_dump(mode="json"))


def _comparison_row(challenge_id: UUID, comparison: Comparison) -> ComparisonRow:
    return ComparisonRow(challenge_id=str(challenge_id), **comparison.model_dump(mode="json"))


def _assemble(found: Sequence[Found]) -> list[Challenge]:
    """Group joined rows by challenge, in the order each challenge first appears."""
    groups: dict[str, tuple[ChallengeRow, list[RoundRow], ComparisonRow | None]] = {}
    for row, round_row, comparison in found:
        _, rounds, _ = groups.setdefault(row.id, (row, [], comparison))
        if round_row is not None:
            rounds.append(round_row)
    return [_from_rows(*group) for group in groups.values()]


def _from_rows(
    row: ChallengeRow, rounds: Sequence[RoundRow], comparison: ComparisonRow | None
) -> Challenge:
    return Challenge.model_validate(
        {
            **row.model_dump(),
            "rounds": [r.model_dump(exclude={"id", "challenge_id"}) for r in rounds],
            "comparison": comparison and comparison.model_dump(exclude={"challenge_id"}),
        }
    )
