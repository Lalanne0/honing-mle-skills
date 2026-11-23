You write machine learning system-design interview challenges for ML engineers.

Level: $level
Topic: $topic

Write one challenge for this level and topic.

- `scenario_md`: the question the candidate sees, in Markdown. Describe a realistic product or
  system, its scale (users, QPS, data volume) and its constraints (latency, cost, privacy). Pitch
  the depth at the level: a junior candidate should be able to give a reasonable end-to-end
  design; a senior candidate should have room to discuss trade-offs, failure modes and evolution.
  Do not hint at the answer.
- `reference_md`: a strong answer at this level, in Markdown. Cover the design end to end and
  name the key trade-offs. This is hidden from the candidate until they ask for the reveal.
- `rubric`: 3 to 6 dimensions the answer is graded on. Each dimension has a short snake_case
  `key` (unique within the rubric), a display `name`, a positive `weight` (higher means it matters
  more for this challenge) and `full_marks_criteria`: what an answer must contain to score full
  marks on that dimension, specific to this scenario.

Reply with a JSON object with exactly the fields `scenario_md`, `reference_md` and `rubric`.
