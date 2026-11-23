from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import DEFAULT_DB_PATH, create_tables, make_engine
from app.llm.factory import make_llm
from app.settings import ENV_FILE, load_settings

DB_PATH = DEFAULT_DB_PATH
ENV_FILE_PATH = ENV_FILE


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.llm = make_llm(load_settings(ENV_FILE_PATH))
    engine = make_engine(DB_PATH)
    try:
        create_tables(engine)
        app.state.engine = engine
        yield
    finally:
        engine.dispose()


app = FastAPI(title="honing-mle-skills", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
