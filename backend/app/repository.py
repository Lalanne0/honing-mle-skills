"""Stores challenges and their rounds. The only code that opens a database session."""

from collections.abc import Sequence
from uuid import UUID

from pydantic import TypeAdapter
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.challenge import Challenge, Round
from app.domain import Level, Revealed, State, Topic, awaiting
from app.llm.schemas import Comparison
from app.tables import ChallengeRow, ComparisonRow, RoundRow

_STATE: TypeAdapter[State] = TypeAdapter(State)


class ChallengeNotFoundError(Exception):
    """No challenge has this id."""


class DuplicateRoundError(Exception):
    """The challenge already has a round with this number."""


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
        query = (
            select(ChallengeRow, RoundRow, ComparisonRow)
            .join(RoundRow, isouter=True)
            .join(ComparisonRow, col(ComparisonRow.challenge_id) == ChallengeRow.id, isouter=True)
            .where(ChallengeRow.id == str(challenge_id))
            .order_by(col(RoundRow.n))
        )
        with Session(self._engine) as session:
            found = session.exec(query).all()
        if not found:
            raise ChallengeNotFoundError(f"no challenge {challenge_id}")
        row, _, comparison = found[0]
        return _from_rows(
            row, [r for _, r, _ in found if r is not None], [comparison] if comparison else []
        )

    def add_round(self, challenge_id: UUID, round_: Round, state: State) -> Challenge:
        """Store a graded round and the state it led to, together or not at all.

        Refused when the stored challenge no longer takes answers, e.g. it was revealed
        while this answer was being graded.
        """
        with Session(self._engine) as session:
            row = _find(session, challenge_id)
            awaiting(_STATE.validate_python(row.state))
            row.state = state.model_dump(mode="json")
            session.add(_round_row(challenge_id, round_))
            try:
                session.commit()
            except IntegrityError as error:
                raise DuplicateRoundError(
                    f"challenge {challenge_id} already has round {round_.n}"
                ) from error
        return self.get(challenge_id)

    def reveal(self, challenge_id: UUID, comparison: Comparison) -> Challenge:
        """Store the comparison and the revealed state together. Idempotent: a challenge
        already revealed keeps its first comparison and this one is dropped."""
        with Session(self._engine) as session:
            row = _find(session, challenge_id)
            row.state = Revealed().model_dump(mode="json")
            session.add(_comparison_row(challenge_id, comparison))
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
        return self.get(challenge_id)

    def list(self, topic: Topic | None = None, level: Level | None = None) -> list[Challenge]:
        """Challenges newest first, optionally only one topic and/or level."""
        query = select(ChallengeRow).order_by(col(ChallengeRow.created_at).desc())
        if topic is not None:
            query = query.where(ChallengeRow.topic == topic.value)
        if level is not None:
            query = query.where(ChallengeRow.level == level.value)
        with Session(self._engine) as session:
            rows = session.exec(query).all()
            ids = [row.id for row in rows]
            rounds = _rounds(session, ids)
            comparisons = _comparisons(session, ids)
        return [_from_rows(row, rounds, comparisons) for row in rows]


# --- sessions -------------------------------------------------------------------


def _find(session: Session, challenge_id: UUID) -> ChallengeRow:
    row = session.get(ChallengeRow, str(challenge_id))
    if row is None:
        raise ChallengeNotFoundError(f"no challenge {challenge_id}")
    return row


def _rounds(session: Session, challenge_ids: Sequence[str]) -> list[RoundRow]:
    query = select(RoundRow).where(col(RoundRow.challenge_id).in_(challenge_ids))
    return list(session.exec(query.order_by(col(RoundRow.n))).all())


def _comparisons(session: Session, challenge_ids: Sequence[str]) -> list[ComparisonRow]:
    query = select(ComparisonRow).where(col(ComparisonRow.challenge_id).in_(challenge_ids))
    return list(session.exec(query).all())


# --- domain <-> rows -----------------------------------------------------------------


def _challenge_row(challenge: Challenge) -> ChallengeRow:
    return ChallengeRow(
        id=str(challenge.id),
        created_at=challenge.created_at,
        level=challenge.level.value,
        topic=challenge.topic.value,
        scenario_md=challenge.scenario_md,
        reference_md=challenge.reference_md,
        rubric=challenge.rubric.model_dump(mode="json"),
        state=challenge.state.model_dump(mode="json"),
    )


def _round_row(challenge_id: UUID, round_: Round) -> RoundRow:
    return RoundRow(challenge_id=str(challenge_id), **round_.model_dump(mode="json"))


def _comparison_row(challenge_id: UUID, comparison: Comparison) -> ComparisonRow:
    return ComparisonRow(challenge_id=str(challenge_id), **comparison.model_dump(mode="json"))


def _from_rows(
    row: ChallengeRow, rounds: Sequence[RoundRow], comparisons: Sequence[ComparisonRow]
) -> Challenge:
    """Rebuild a challenge from its row, rounds and comparison; rows of other challenges are
    skipped."""
    comparison = next((c for c in comparisons if c.challenge_id == row.id), None)
    return Challenge.model_validate(
        {
            **row.model_dump(),
            "rounds": [
                r.model_dump(exclude={"id", "challenge_id"})
                for r in rounds
                if r.challenge_id == row.id
            ],
            "comparison": comparison and comparison.model_dump(exclude={"challenge_id"}),
        }
    )
