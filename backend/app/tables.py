"""SQLite tables. Only `app.repository` reads and writes them."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel

JsonDict = dict[str, Any]


class ChallengeRow(SQLModel, table=True):
    __tablename__ = "challenge"

    id: str = Field(primary_key=True)
    created_at: datetime = Field(index=True)
    level: str = Field(index=True)
    topic: str = Field(index=True)
    scenario_md: str
    reference_md: str
    rubric: JsonDict = Field(sa_column=Column(JSON, nullable=False))
    state: JsonDict = Field(sa_column=Column(JSON, nullable=False))


class RoundRow(SQLModel, table=True):
    __tablename__ = "round"
    __table_args__ = (UniqueConstraint("challenge_id", "n"),)

    id: int | None = Field(default=None, primary_key=True)
    challenge_id: str = Field(foreign_key="challenge.id", index=True)
    n: int
    answer_md: str
    scores: JsonDict = Field(sa_column=Column(JSON, nullable=False))
    comment: str
    verdict: JsonDict = Field(sa_column=Column(JSON, nullable=False))
