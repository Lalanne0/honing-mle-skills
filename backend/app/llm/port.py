"""The one interface the app uses to call the model. See `gateway.py` and `fake.py`."""

from collections.abc import Sequence
from typing import Protocol

from app.domain import Level, Topic
from app.llm.prompts import PastRound
from app.llm.schemas import Comparison, GeneratedChallenge, GradeResult


class LLMPort(Protocol):
    def generate(self, level: Level, topic: Topic) -> GeneratedChallenge:
        """Write a new challenge with its reference solution and rubric."""
        ...

    def grade(
        self, challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str
    ) -> GradeResult:
        """Grade `answer`, the answer to the round after `previous`."""
        ...

    def compare(self, challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> Comparison:
        """Compare all answers given with the reference solution, for the reveal."""
        ...
