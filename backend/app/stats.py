"""Per-topic stats over past challenges, so weak areas stand out. Pure functions, no I/O.

Terms are defined in docs/glossary.md. A challenge's score is the weighted score of its last
graded round; a challenge without one counts as an attempt but has no score.
"""

import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from statistics import fmean

from pydantic import BaseModel, ConfigDict

from app.challenge import Challenge
from app.domain import MAX_SCORE, Topic

WEAKEST_DIMENSIONS = 2
"""How many dimensions a topic lists as its weakest."""


class _Value(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class DimensionStat(_Value):
    key: str
    """Only the key: it is public already in each round's scores, while the dimension's name
    and criteria are rubric text, hidden until reveal."""
    average_score: float
    """From 0 to MAX_SCORE, over the last graded round of each challenge."""


class TopicStats(_Value):
    topic: Topic
    attempts: int
    """Every challenge started in this topic, graded or not."""
    graded: int
    """The attempts with at least one graded round. Only these have a score."""
    average_score: float | None
    """Mean weighted score, from 0 to 100. None when nothing was graded."""
    trend: float | None
    """The latest score minus the mean of the earlier ones, in points. None with fewer than
    two graded attempts."""
    weakest_dimensions: tuple[DimensionStat, ...]
    """Lowest average score first, ties by key."""


def weighted_score(challenge: Challenge) -> float | None:
    """The last graded round's scores weighted by the rubric, from 0 to 100."""
    if not challenge.rounds:
        return None
    scores = challenge.rounds[-1].scores
    dimensions = challenge.rubric.dimensions
    earned = sum(d.weight * scores[d.key] for d in dimensions)
    return 100 * earned / (MAX_SCORE * sum(d.weight for d in dimensions))


def topic_stats(challenges: Iterable[Challenge]) -> list[TopicStats]:
    """Stats for each topic with at least one attempt: weakest average first, then the
    topics with nothing graded, ties in topic order."""
    by_topic: dict[Topic, list[Challenge]] = defaultdict(list)
    for challenge in sorted(challenges, key=lambda c: c.created_at):
        by_topic[challenge.topic].append(challenge)
    stats = [_one_topic(topic, by_topic[topic]) for topic in Topic if topic in by_topic]
    return sorted(stats, key=lambda s: math.inf if s.average_score is None else s.average_score)


def _one_topic(topic: Topic, oldest_first: Sequence[Challenge]) -> TopicStats:
    graded = [c for c in oldest_first if c.rounds]
    scores = [s for c in graded if (s := weighted_score(c)) is not None]
    return TopicStats(
        topic=topic,
        attempts=len(oldest_first),
        graded=len(graded),
        average_score=fmean(scores) if scores else None,
        trend=scores[-1] - fmean(scores[:-1]) if len(scores) > 1 else None,
        weakest_dimensions=_weakest(graded),
    )


def _weakest(oldest_first: Sequence[Challenge]) -> tuple[DimensionStat, ...]:
    scores: dict[str, list[int]] = defaultdict(list)
    for challenge in oldest_first:
        for key, score in challenge.rounds[-1].scores.items():
            scores[key].append(score)
    averages = [DimensionStat(key=k, average_score=fmean(s)) for k, s in scores.items()]
    ranked = sorted(averages, key=lambda d: (d.average_score, d.key))
    return tuple(ranked[:WEAKEST_DIMENSIONS])
