"""The comparison shown at reveal: written by the model, or fixed when nothing was answered."""

from app.answering import material, past_rounds
from app.challenge import Challenge
from app.domain import Rubric
from app.llm.port import LLMPort
from app.llm.schemas import Comparison

NO_ANSWER_SUMMARY = (
    "You revealed the reference solution before answering, so there is no answer to compare."
)
NO_ANSWER_NOTE = "No answer to compare."


def no_answer_comparison(rubric: Rubric) -> Comparison:
    """The comparison for a challenge revealed before its first answer. Needs no model call."""
    return Comparison.model_validate(
        {
            "summary_md": NO_ANSWER_SUMMARY,
            "notes": dict.fromkeys((d.key for d in rubric.dimensions), NO_ANSWER_NOTE),
        },
        context={"rubric": rubric},
    )


def compare(llm: LLMPort, challenge: Challenge) -> Comparison:
    """Compare the answers given so far with the reference solution."""
    if not challenge.rounds:
        return no_answer_comparison(challenge.rubric)
    return llm.compare(material(challenge), past_rounds(challenge))
