"""Grading one answer: what the model is shown, and the round its grade becomes.

Pure functions; the route in `app.api` does the I/O around them.
"""

from app.challenge import Challenge, Round
from app.domain import Complete, Completed, Graded, State, advance
from app.llm.prompts import PastRound
from app.llm.schemas import GeneratedChallenge, GradeResult


def material(challenge: Challenge) -> GeneratedChallenge:
    """The challenge as the model wrote it: scenario, reference solution and rubric."""
    return GeneratedChallenge(
        scenario_md=challenge.scenario_md,
        reference_md=challenge.reference_md,
        rubric=challenge.rubric,
    )


def past_rounds(challenge: Challenge) -> list[PastRound]:
    """The rounds already answered, in order, as the grader sees them."""
    return [
        PastRound(
            answer=r.answer_md,
            grade=GradeResult.model_validate(
                r.model_dump(include={"scores", "comment", "verdict"}),
                context={"rubric": challenge.rubric},
            ),
        )
        for r in challenge.rounds
    ]


def graded_round(
    state: State, round_number: int, answer_md: str, grade: GradeResult
) -> tuple[Round, State]:
    """The round to store and the state it leads to.

    When the grade ends the challenge, the stored verdict says `complete`, so a
    follow-up asked in the last round is never shown as a question to answer.
    """
    new_state = advance(state, Graded(verdict=grade.verdict))
    verdict = Complete() if isinstance(new_state, Completed) else grade.verdict
    round_ = Round(
        n=round_number,
        answer_md=answer_md,
        scores=grade.scores,
        comment=grade.comment,
        verdict=verdict,
    )
    return round_, new_state
