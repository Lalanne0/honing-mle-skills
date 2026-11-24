# Glossary

Use these terms the same way in code, UI and issues. Code names are in `backend/app/domain.py`, except `Challenge` and `Round`, which are in `backend/app/challenge.py`, `GradeResult` and `Comparison`, which are in `backend/app/llm/schemas.py`, and the history and stats terms, which are in `backend/app/views.py` (`ChallengeSummary`) and `backend/app/stats.py`.

| Term | Code | Meaning |
|---|---|---|
| **Challenge** | `Challenge` | One ML system-design interview question at a chosen level and topic. It is answered over one to three rounds and comes with a hidden reference solution and rubric. |
| **Level** | `Level` | The seniority the challenge targets: `junior`, `mid` or `senior`. |
| **Topic** | `Topic` | The ML system-design area the challenge is about. There are 10: RAG & LLM apps (`rag_and_llm_apps`), model serving (`model_serving`), batch vs streaming inference (`batch_vs_streaming_inference`), training pipelines (`training_pipelines`), feature stores (`feature_stores`), MLOps & monitoring/drift (`mlops_monitoring_and_drift`), data pipelines (`data_pipelines`), recommender systems (`recommender_systems`), A/B testing & experimentation (`ab_testing_and_experimentation`), privacy & security (`privacy_and_security`). |
| **Round** | `Round`, `Awaiting.round` | One answer from the user and its grade. A challenge has at most `MAX_ROUNDS` = 3 rounds. |
| **Rubric** | `Rubric` | How answers are graded: 3 to 6 dimensions with unique keys. Hidden until reveal. |
| **Dimension** | `Dimension` | One graded aspect of an answer: a `key`, a display `name`, a positive `weight`, and the `full_marks_criteria` an answer must meet to score full marks. |
| **Score** | `Score` | How well an answer meets one dimension: an integer from 0 to `MAX_SCORE` = 5. |
| **Grade** | `GradeResult`, `Graded` | The result of grading one round's answer against the rubric: one score per rubric dimension (exactly the rubric's keys, no more, no fewer), a comment and a verdict. `Graded` is the state-machine event; it carries only the verdict. |
| **Verdict** | `Verdict` | What happens after a round: `FollowUp` (with the follow-up question for the next round) or `Complete`. |
| **Follow-up** | `FollowUp` | A verdict asking the user one more question. In the last round it completes the challenge instead. |
| **Reveal** | `RevealRequested`, `Revealed` | Showing the reference solution and rubric to the user. Allowed from any state. Once revealed, the challenge takes no more answers. `Revealed` is final. |
| **Reference solution** | — | The model answer to a challenge. Like the rubric, it never leaves the backend before reveal. |
| **Comparison** | `Comparison` | Shown at reveal: the user's answers side by side with the reference solution, with a summary and one note per rubric dimension. Written once, at the first reveal, and stored with the challenge. When nothing was answered it says there is no answer to compare, without a model call. |
| **Weighted score** | `weighted_score` | A challenge's score from 0 to 100: the scores of its last graded round, each weighted by its dimension's rubric weight, as a share of full marks. A challenge with no graded round has none. |
| **History** | `ChallengeSummary` | The list of past challenges, newest first, each with its state, rounds answered and weighted score. Carries no rubric or reference solution. |
| **Attempt** | `TopicStats.attempts` | Any challenge started in a topic, graded or not. A challenge revealed before any graded round is an attempt without a weighted score. |
| **Topic stats** | `TopicStats` | Per topic: attempts, how many were graded, the average weighted score, the trend and the weakest dimensions. Weakest topic first. |
| **Trend** | `TopicStats.trend` | The latest weighted score in a topic minus the mean of the earlier ones, in points. Needs two graded attempts. |
| **Weakest dimensions** | `DimensionStat` | The 2 dimension keys with the lowest average score (0 to `MAX_SCORE`) over the last graded round of each challenge in a topic; ties by key. Only keys are sent, since dimension names are rubric text. |

## Challenge states

```
Awaiting(1) --grade--> Awaiting(2) --grade--> Awaiting(3) --grade--> Completed
     \                     \                     \                       \
      `----------------------------- reveal -------------------------------> Revealed (final)
```

- A `FollowUp` in rounds 1 and 2 moves to the next round. A `FollowUp` in round 3, or a `Complete` in any round, moves to `Completed`.
- No answers are accepted in `Completed` or `Revealed` (`IllegalTransitionError`).
- `advance(state, event)` is the only place these rules live.
