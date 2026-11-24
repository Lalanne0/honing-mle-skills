"""Database engines and table creation."""

from pathlib import Path

from sqlalchemy import URL, Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine

from app import tables  # noqa: F401  (registers the tables on SQLModel.metadata)

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"


def make_engine(path: Path = DEFAULT_DB_PATH) -> Engine:
    """An engine for a SQLite file, creating its folders if needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # URL.create keeps a "?" in the path as part of the file name, not a query string.
    return create_engine(URL.create("sqlite", database=str(path)))


def memory_engine() -> Engine:
    """An in-memory database with its tables, shared by every session and thread on the engine."""
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    create_tables(engine)
    return engine


def create_tables(engine: Engine) -> None:
    """Create any missing tables. Safe to run on every start."""
    SQLModel.metadata.create_all(engine)
