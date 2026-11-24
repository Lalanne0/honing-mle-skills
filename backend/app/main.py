import os
import random
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app import api
from app.db import DEFAULT_DB_PATH, create_tables, make_engine
from app.llm.factory import make_llm
from app.settings import ENV_FILE, load_settings

DB_PATH = DEFAULT_DB_PATH
ENV_FILE_PATH = ENV_FILE


def db_path() -> Path:
    """`APP_DB_PATH` from the shell if set (the e2e suite uses a throwaway file), else `DB_PATH`."""
    return Path(os.environ.get("APP_DB_PATH") or DB_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.llm = make_llm(load_settings(ENV_FILE_PATH))
    app.state.rng = random.Random()
    engine = make_engine(db_path())
    try:
        create_tables(engine)
        app.state.engine = engine
        yield
    finally:
        engine.dispose()


app = FastAPI(title="honing-mle-skills", lifespan=lifespan)
api.install(app)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
