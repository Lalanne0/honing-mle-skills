"""Stores challenges and their rounds. The only code that opens a database session."""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from app.challenge import Challenge, Round
from app.domain import Level, State, Topic
from app.tables import ChallengeRow, RoundRow


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
            session.commit()

    def get(self, challenge_id: UUID) -> Challenge:
        with Session(self._engine) as session:
            return _from_rows(_find(session, challenge_id), _rounds(session, [str(challenge_id)]))

    def add_round(self, challenge_id: UUID, round_: Round, state: State) -> Challenge:
        """Store a graded round and the state it led to, together or not at all."""
        with Session(self._engine) as session:
            row = _find(session, challenge_id)
            row.state = state.model_dump(mode="json")
            session.add(_round_row(challenge_id, round_))
            try:
                session.commit()
            except IntegrityError as error:
                raise DuplicateRoundError(
                    f"challenge {challenge_id} already has round {round_.n}"
                ) from error
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
            rounds = _rounds(session, [row.id for row in rows])
        return [_from_rows(row, rounds) for row in rows]


# --- sessions -------------------------------------------------------------------


def _find(session: Session, challenge_id: UUID) -> ChallengeRow:
    row = session.get(ChallengeRow, str(challenge_id))
    if row is None:
        raise ChallengeNotFoundError(f"no challenge {challenge_id}")
    return row


def _rounds(session: Session, challenge_ids: Sequence[str]) -> list[RoundRow]:
    query = select(RoundRow).where(col(RoundRow.challenge_id).in_(challenge_ids))
    return list(session.exec(query.order_by(col(RoundRow.n))).all())


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


def _from_rows(row: ChallengeRow, rounds: Sequence[RoundRow]) -> Challenge:
    """Rebuild a challenge from its row and any rounds; rounds of other challenges are skipped."""
    return Challenge.model_validate(
        {
            **row.model_dump(),
            "rounds": [
                r.model_dump(exclude={"id", "challenge_id"})
                for r in rounds
                if r.challenge_id == row.id
            ],
        }
    )
