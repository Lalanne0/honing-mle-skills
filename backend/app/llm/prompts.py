"""Builds the prompt for each LLM call from the templates in `prompts/`.

Templates use `string.Template` placeholders (`$name`), so JSON braces in them
need no escaping. Values are inserted as given; `$` inside a value is safe.
"""

import json
from collections.abc import Sequence
from pathlib import Path
from string import Template
from typing import NamedTuple

from app.domain import MAX_ROUNDS, Level, Topic
from app.llm.schemas import GeneratedChallenge, GradeResult

PROMPTS_DIR = Path(__file__).parent / "prompts"

LAST_ROUND_NOTE = (
    "This is the last round: the verdict must be `complete`, whatever the answer's quality."
)


class PastRound(NamedTuple):
    """An answer already given in this challenge, and its grade."""

    answer: str
    grade: GradeResult


def _render(name: str, **values: str) -> str:
    return Template((PROMPTS_DIR / f"{name}.md").read_text()).substitute(values)


def _format_round(number: int, past: PastRound) -> str:
    verdict = past.grade.verdict
    follow_up = verdict.question if verdict.kind == "follow_up" else "none, the challenge completed"
    return (
        f"### Round {number}\n\n"
        f"Answer:\n\n{past.answer}\n\n"
        f"Scores: {json.dumps(past.grade.scores)}\n\n"
        f"Comment: {past.grade.comment}\n\n"
        f"Follow-up question: {follow_up}"
    )


def _format_rounds(rounds: Sequence[PastRound]) -> str:
    if not rounds:
        return "None. This is the first round."
    return "\n\n".join(_format_round(n, r) for n, r in enumerate(rounds, start=1))


def _challenge_values(challenge: GeneratedChallenge) -> dict[str, str]:
    return {
        "scenario": challenge.scenario_md,
        "reference": challenge.reference_md,
        "rubric": challenge.rubric.model_dump_json(indent=2),
    }


def generate_prompt(level: Level, topic: Topic) -> str:
    return _render("generate", level=level.value, topic=topic.value)


def grade_prompt(challenge: GeneratedChallenge, previous: Sequence[PastRound], answer: str) -> str:
    """Prompt to grade `answer`, the answer to the round after `previous`."""
    round_number = len(previous) + 1
    if round_number > MAX_ROUNDS:
        raise ValueError(f"a challenge has at most {MAX_ROUNDS} rounds, got {round_number}")
    return _render(
        "grade",
        **_challenge_values(challenge),
        previous_rounds=_format_rounds(previous),
        answer=answer,
        round=str(round_number),
        max_rounds=str(MAX_ROUNDS),
        last_round_note=LAST_ROUND_NOTE if round_number == MAX_ROUNDS else "",
    )


def compare_prompt(challenge: GeneratedChallenge, rounds: Sequence[PastRound]) -> str:
    return _render("compare", **_challenge_values(challenge), rounds=_format_rounds(rounds))
