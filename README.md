# honing-mle-skills

A local web app for practicing **ML engineering system-design interviews**.

Pick a seniority level and a topic. An LLM writes a realistic design challenge and keeps a hidden reference solution and grading rubric. You write your answer in a Markdown editor. Each round is graded dimension by dimension, and the model can ask up to two follow-up questions. When you're done, **reveal** shows the reference solution and rubric next to your answers, with notes for each rubric dimension. A history page tracks your scores, trends and weakest dimensions for each topic.

- **Levels:** junior, mid, senior
- **Topics (10):** RAG & LLM apps, model serving, batch vs streaming inference, training pipelines, feature stores, MLOps & monitoring/drift, data pipelines, recommender systems, A/B testing & experimentation, privacy & security
- **Rounds:** up to 3 per challenge, each scored 0–5 on every rubric dimension, which rolls up into a weighted score out of 100

The vocabulary used in the code, UI and issues (challenge, round, rubric, dimension, verdict, reveal…) is defined in [`docs/glossary.md`](docs/glossary.md).

---

## Quick start

### Prerequisites

| Tool | Version used |
|---|---|
| Python | ≥ 3.13 (managed by [uv](https://docs.astral.sh/uv/)) |
| uv | 0.9+ |
| Node.js | 26 |
| make | any |

### 1. Install

```sh
make install          # uv sync (backend) + npm install (frontend)
```

### 2. Configure the LLM (optional)

The app talks to any **OpenAI-compatible gateway**. I use a LiteLLM proxy in front of Claude. Copy the template and fill in the gateway values:

```sh
cp backend/.env.example backend/.env    # backend/.env is gitignored
```

```dotenv
LLM_BASE_URL=https://your-gateway.example.com/v1
LLM_API_KEY=...
LLM_MODEL=anthropic/claude-sonnet-5-5
```

Settings are read **from this file only**, so a key exported in your shell is never picked up. `LLM_BASE_URL` must use https unless the gateway runs on localhost.

No key? Run in **fake mode**. A built-in deterministic stand-in replaces the model: no network calls, no cost. It's handy for clicking around the UI.

### 3. Launch

```sh
make dev                    # real model, configured in backend/.env
LLM_MODE=fake make dev      # no key needed, canned challenges and grades
```

This starts both servers, bound to **127.0.0.1 only**:

| | URL |
|---|---|
| **App (open this)** | <http://127.0.0.1:5173> |
| API | <http://127.0.0.1:8000> (Vite proxies `/api` there) |
| API docs (Swagger) | <http://127.0.0.1:8000/docs> |
| Health check | <http://127.0.0.1:8000/api/health> |

Pages: `/` starts a challenge, `/c/:id` is a challenge, `/history` shows history and stats, `/design` shows the design-system reference.

The ports can be changed, for example to run two copies side by side:

```sh
BACKEND_PORT=8001 FRONTEND_PORT=5174 make dev
```

Your data lives in a SQLite file at `backend/data/app.db` (gitignored). The app creates it on first start. Delete the file to start over.

### 4. Stop

Press **Ctrl-C** in the terminal running `make dev`. It stops both servers. If either server exits on its own, `scripts/dev.sh` also stops the other one.

If a server is left orphaned (for example after the terminal was closed), free the ports with:

```sh
lsof -ti tcp:8000 -ti tcp:5173 | xargs kill
```

---

## Architecture

```
frontend/  React 19 + Vite + TypeScript ── /api ──▶  backend/  FastAPI + SQLModel/SQLite
           CodeMirror editor, react-router                     │
           typed client generated from OpenAPI                 ▼
                                                    LLMPort ─┬─ OpenAICompatibleLLM ──▶ LiteLLM gateway ──▶ Claude
                                                             └─ FakeLLM (tests, LLM_MODE=fake)
```

Design decisions worth pointing out:

- **The answer key never leaks.** The reference solution and rubric stay in the backend until reveal. Two separate response models (`ChallengePublic` and `ChallengeRevealed`) enforce this, and a dedicated leak test guards it.
- **Treat the LLM as untrusted.** Every call goes through one adapter. It requests a JSON-schema response but doesn't rely on the gateway to enforce it. The reply is validated with Pydantic plus domain rules (for example, a grade must score exactly the rubric's dimensions). On failure the adapter retries once and feeds the validation error back, then raises a typed `LLMError`. Rate limits (429) and 5xx responses also become typed errors.
- **An explicit state machine.** Challenge states (`Awaiting(n)` → `Completed` / `Revealed`) change only in one function, `advance(state, event)`. That makes the rules easy to test exhaustively.
- **Ports and adapters.** The domain depends on an `LLMPort`. The real gateway client and `FakeLLM` are chosen at startup by `LLM_MODE`. So unit tests, CI and the E2E suite never spend a token.
- **Contract-typed frontend.** `npm run gen:api` creates the TypeScript API types from the backend's OpenAPI schema.
- **Local-first and safe by default.** It binds to loopback only, reads secrets from a single gitignored file, and keeps the key out of logs and error messages.

---

## Quality gates

```sh
make test     # pytest (backend) + vitest (frontend)
make lint     # ruff, ruff format, mypy --strict · oxlint, tsc
make e2e      # Playwright: full flows in Chromium, LLM_MODE=fake, throwaway DB
```

Tests marked `live` call the real gateway and cost money. They're excluded by default and run only on purpose (`uv run pytest -m live`).

CI (GitHub Actions) runs lint, unit tests and the Playwright suite on every PR, with no secrets.

Three more metrics come from Robert C. Martin's (Uncle Bob's) command-line tools: [crapper](https://github.com/unclebob/crapper), [dryer](https://github.com/unclebob/dryer) and [mutator](https://github.com/unclebob/mutator). Check them out side by side under `~/tools`, or point `TOOLS_DIR` somewhere else:

```sh
make crap     # CRAP score (complexity × lack of coverage): every function must stay under 10
make dry      # duplicate-code detection: nothing scored 0.8 or above
make mutate   # mutation testing: kill the surviving mutants or delete the dead code
```

---

## How it was built

I built this app over two days with **Claude Code** as the main implementer. The goal was less "AI writes code" and more an engineering process: an agent can run it without supervision, and I can still audit the result. That setup is a big part of why this repo exists, so here it is.

### Workflow

1. **Linear as the source of truth.** The work is split into small issues (team `VIN`) with explicit blocking relations: domain → persistence → LLM adapter → API → UI → E2E. Each issue gets its own branch, and each PR closes one issue.
2. **Test-first, clean-code discipline** with Uncle Bob's [`ub-mode`](https://github.com/unclebob/ub-mode) Claude Code skill: write a failing test first, then the smallest change that passes, then refactor. Refactoring isn't done until the CRAP, duplication and mutation gates pass.
3. **Design before UI.** A design-system issue (VIN-14) collected UI references from **Mobbin** and fixed the tokens and components before any screen was built.
4. **Browser verification.** Every UI change is clicked through in a real browser with **Playwright MCP** before review, and later locked in by the Playwright E2E suite.
5. **Automated code review.** **CodeRabbit** reviews each change locally and on the PR. It's capped at two re-review rounds, so the loop always ends, and leftover findings are answered in the PR rather than silently dropped.
6. **Small commits** that each say *why*, *what changed* and *how it was proven*.

### Parallel, unattended agents

Two project skills in [`.claude/skills/`](.claude/skills) turn this into a loop that runs on its own:

- **`/next`** picks up to 3 unblocked Todo issues that touch disjoint parts of the code. It launches each one in its own **git worktree** and **cmux** terminal workspace, running an unattended Claude Code worker.
- Each worker implements its issue, runs the full workflow above and opens a PR. Then it hands control back to the orchestrator with **`/land <PR>`**.
- **`/land`** merges only when CI and CodeRabbit pass, pinned to the exact commit it checked. It cleans up the worktree, tells the still-running workers to rebase, and calls `/next` again. If a gate fails, it marks the issue *Blocked*, notifies me and keeps going with the rest.

Guardrails: the project's [`CLAUDE.md`](CLAUDE.md) holds the rules every agent must follow (secrets handling, loopback-only, the leak test, the LLM call contract, no paid API calls in tests). [`.claude/settings.json`](.claude/settings.json) allow-lists only the narrow commands the loop needs.

### Toolbox

| Area | Tools |
|---|---|
| Agent | Claude Code, with the project skills `/next` and `/land` plus [ub-mode](https://github.com/unclebob/ub-mode) by Uncle Bob |
| Planning | Linear (via MCP) |
| Parallelism | git worktrees, cmux workspaces |
| Review | CodeRabbit (CLI + GitHub app), GitHub Actions CI |
| UI | Mobbin (references), Playwright MCP (manual verification) |
| Quality | pytest, vitest, Playwright, ruff, mypy `--strict`, oxlint, tsc, Uncle Bob's [crapper](https://github.com/unclebob/crapper), [dryer](https://github.com/unclebob/dryer) and [mutator](https://github.com/unclebob/mutator) |
| Runtime model | Claude Sonnet via a LiteLLM gateway (OpenAI-compatible API) |

---

## Project layout

```
backend/
  app/
    domain.py, challenge.py   levels, topics, rubric, state machine
    answering.py, revealing.py  use cases: grade a round, reveal and compare
    stats.py, views.py        history and per-topic stats
    api.py, main.py           FastAPI routes and app wiring
    repository.py, tables.py, db.py   SQLModel persistence
    llm/                      LLMPort, gateway client, FakeLLM, prompts, schemas
  tests/
frontend/
  src/pages/                  Start, Challenge, Reveal, History
  src/api/                    typed client (generated schema)
  src/design/                 design-system page and tokens
  e2e/                        Playwright specs
docs/glossary.md              domain vocabulary
scripts/dev.sh                runs both servers, stops both on Ctrl-C
.claude/skills/               /next and /land orchestration skills
```
