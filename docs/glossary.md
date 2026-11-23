# Glossary

Use these terms the same way in code, UI and issues. Code names are in `backend/app/domain.py`.

| Term | Code | Meaning |
|---|---|---|
| **Challenge** | — | One ML system-design interview question at a chosen level and topic. It is answered over one to three rounds and comes with a hidden reference solution and rubric. |
| **Level** | `Level` | The seniority the challenge targets: `junior`, `mid` or `senior`. |
| **Topic** | `Topic` | The ML system-design area the challenge is about. There are 10: RAG & LLM apps (`rag_and_llm_apps`), model serving (`model_serving`), batch vs streaming inference (`batch_vs_streaming_inference`), training pipelines (`training_pipelines`), feature stores (`feature_stores`), MLOps & monitoring/drift (`mlops_monitoring_and_drift`), data pipelines (`data_pipelines`), recommender systems (`recommender_systems`), A/B testing & experimentation (`ab_testing_and_experimentation`), privacy & security (`privacy_and_security`). |
| **Round** | `Awaiting.round` | One answer from the user and its grade. A challenge has at most `MAX_ROUNDS` = 3 rounds. |
| **Rubric** | `Rubric` | How answers are graded: 3 to 6 dimensions with unique keys. Hidden until reveal. |
| **Dimension** | `Dimension` | One graded aspect of an answer: a `key`, a display `name`, a positive `weight`, and the `full_marks_criteria` an answer must meet to score full marks. |
| **Grade** | `Graded` | The result of grading one round's answer against the rubric. It carries a verdict. |
| **Verdict** | `Verdict` | What happens after a round: `FollowUp` (with the follow-up question for the next round) or `Complete`. |
| **Follow-up** | `FollowUp` | A verdict asking the user one more question. In the last round it completes the challenge instead. |
| **Reveal** | `RevealRequested`, `Revealed` | Showing the reference solution and rubric to the user. Allowed from any state. Once revealed, the challenge takes no more answers. `Revealed` is final. |
| **Reference solution** | — | The model answer to a challenge. Like the rubric, it never leaves the backend before reveal. |
| **Comparison** | — | Shown at reveal: the user's answers side by side with the reference solution, scored per dimension. |

## Challenge states

```
Awaiting(1) --grade--> Awaiting(2) --grade--> Awaiting(3) --grade--> Completed
     \                     \                     \                       \
      `----------------------------- reveal -------------------------------> Revealed (final)
```

- A `FollowUp` in rounds 1 and 2 moves to the next round. A `FollowUp` in round 3, or a `Complete` in any round, moves to `Completed`.
- No answers are accepted in `Completed` or `Revealed` (`IllegalTransitionError`).
- `advance(state, event)` is the only place these rules live.
