"""HTTP routes for challenges, and how LLM failures become HTTP responses."""

import math
import random
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from app.challenge import Challenge
from app.domain import Awaiting, Level, Topic
from app.llm.errors import LLMError, LLMRateLimitedError
from app.llm.port import LLMPort
from app.repository import ChallengeNotFoundError, ChallengeRepository
from app.views import ChallengePublic, ChallengeRevealed, view

DEFAULT_RETRY_AFTER_SECONDS = 30
"""Sent with a 503 when the gateway did not say how long to wait."""

router = APIRouter(prefix="/api/challenges")


# --- dependencies (overridden in tests) ---------------------------------------------


def get_llm(request: Request) -> LLMPort:
    llm: LLMPort = request.app.state.llm
    return llm


def get_repository(request: Request) -> ChallengeRepository:
    return ChallengeRepository(request.app.state.engine)


def get_rng(request: Request) -> random.Random:
    rng: random.Random = request.app.state.rng
    return rng


Llm = Annotated[LLMPort, Depends(get_llm)]
Repository = Annotated[ChallengeRepository, Depends(get_repository)]
Rng = Annotated[random.Random, Depends(get_rng)]


# --- routes ---------------------------------------------------------------------


class CreateChallenge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: Level
    topic: Topic | None = None
    """Picked at random when omitted."""


@router.post("", status_code=201)
def create_challenge(
    body: CreateChallenge, llm: Llm, repository: Repository, rng: Rng
) -> ChallengePublic:
    """Write a new challenge with the model and store it. Nothing is stored if the model fails."""
    topic = body.topic or rng.choice(list(Topic))
    generated = llm.generate(body.level, topic)
    challenge = Challenge(
        level=body.level, topic=topic, state=Awaiting(round=1), **generated.model_dump()
    )
    repository.create(challenge)
    return ChallengePublic.model_validate(challenge)


@router.get("/{challenge_id}")
def get_challenge(
    challenge_id: UUID, repository: Repository
) -> ChallengeRevealed | ChallengePublic:
    try:
        return view(repository.get(challenge_id))
    except ChallengeNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# --- LLM errors ------------------------------------------------------------------


def _rate_limited(_: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, LLMRateLimitedError)
    seconds = math.ceil(error.retry_after or DEFAULT_RETRY_AFTER_SECONDS)
    return JSONResponse(
        status_code=503,
        headers={"Retry-After": str(seconds)},
        content={"detail": f"The model is busy. Try again in {seconds} seconds."},
    )


def _llm_failed(_: Request, error: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=502, content={"detail": f"The model call failed, so nothing was saved: {error}"}
    )


def install(app: FastAPI) -> None:
    """Add the challenge routes and the LLM error handlers to `app`."""
    app.include_router(router)
    app.add_exception_handler(LLMRateLimitedError, _rate_limited)
    app.add_exception_handler(LLMError, _llm_failed)
