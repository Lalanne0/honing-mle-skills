"""A deterministic stand-in for the model, for tests and `LLM_MODE=fake`. No network, no cost."""

from collections.abc import Sequence
from typing import Literal

from app.domain import MAX_ROUNDS, Complete, Dimension, FollowUp, Level, Rubric, Topic, Verdict
from app.llm.prompts import PastRound
from app.llm.schemas import Comparison, GeneratedChallenge, GradeResult

RUBRIC = Rubric(
    dimensions=tuple(
        Dimension(key=key, name=name, weight=1.0, full_marks_criteria=f"Covers {name.lower()}.")
        for key, name in (
            ("requirements", "Requirements"),
            ("architecture", "Architecture"),
            ("trade_offs", "Trade-offs"),
        )
    )
)
SCORE = 3


class FakeLLM:
    def __init__(self, verdict: Literal["follow_up", "complete"] = "follow_up") -> None:
        self._verdict = verdict

    def generate(self, level: Level, topic: Topic) -> GeneratedChallenge:
        return GeneratedChallenge(
            scenario_md=f"Fake {level.value} challenge about {topic.value}: design the system.",
            reference_md="Fake reference solution.",
            rubric=RUBRIC,
        )

    def grade(
        self, challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str
    ) -> GradeResult:
        return GradeResult.model_validate(
            {
                "scores": {d.key: SCORE for d in challenge.rubric.dimensions},
                "comment": "Fake comment.",
                "verdict": self._verdict_for(round_number=len(previous) + 1),
            },
            context={"rubric": challenge.rubric},
        )

    def _verdict_for(self, round_number: int) -> Verdict:
        if self._verdict == "complete" or round_number == MAX_ROUNDS:
            return Complete()
        return FollowUp(question="Fake follow-up: how would this scale 10x?")

    def compare(self, challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> Comparison:
        return Comparison.model_validate(
            {
                "summary_md": f"Fake comparison of {len(rounds)} rounds.",
                "notes": {d.key: "Fake note." for d in challenge.rubric.dimensions},
            },
            context={"rubric": challenge.rubric},
        )
