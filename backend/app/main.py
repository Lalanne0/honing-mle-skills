from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import DEFAULT_DB_PATH, create_tables, make_engine

DB_PATH = DEFAULT_DB_PATH


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = make_engine(DB_PATH)
    create_tables(engine)
    app.state.engine = engine
    yield
    engine.dispose()


app = FastAPI(title="honing-mle-skills", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
