# honing-mle-skills

Local, single-user web app for practicing ML engineering system-design interviews.
FastAPI + SQLModel/SQLite + `openai` SDK against an OpenAI-compatible LLM gateway (LiteLLM proxy; model from `LLM_MODEL`, currently `anthropic/claude-sonnet-5-5`) · React + Vite + TypeScript.

## Commands

```
make dev      # backend on 127.0.0.1:8000, frontend on 127.0.0.1:5173
make test     # backend pytest + frontend vitest
make lint     # ruff, mypy --strict, eslint, tsc
make e2e      # Playwright suite, LLM_MODE=fake (no API key, no cost) — added by VIN-20
make crap     # CRAP scores        (~/tools/crapper, override with TOOLS_DIR=...)
make dry      # duplicate code     (~/tools/dryer)
make mutate   # mutation testing   (~/tools/mutator)
```

## Rules

- `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` live only in `backend/.env` (gitignored), and settings read them from that file only. Never export `LLM_API_KEY`, log it, print it, or read it into the conversation.
- Servers bind to 127.0.0.1 only.
- The reference solution and rubric never leave the backend before reveal. `ChallengePublic` and `ChallengeRevealed` are separate models, and the leak test must stay green.
- Every LLM call goes through `OpenAICompatibleLLM`: `chat.completions.create` with `response_format` json_schema (`strict: false`), because the gateway isn't trusted to enforce it. The reply is validated with the Pydantic model plus domain validation. On failure, retry once with the validation error, then raise a typed `LLMError`. 429 and 5xx responses also become typed errors.
- Tests use `FakeLLM`. Live tests are marked `-m live`, go through the gateway, and run only when the user asks, because they cost money.
- Domain terms are defined in `docs/glossary.md`. Use them consistently in code, UI and issues.

## Workflow

Work is tracked in Linear: project **honing-mle-skills**, team **VIN**.

1. Read the issue and its blockers, then move it to **In Progress**. Use the issue's `gitBranchName` as the branch.
2. **Parallel work:** when two issues are independent (no blocking relation, and they touch different files), suggest running them in parallel in separate git worktrees, one per issue.
3. Implement with **/ub-mode**: failing test first, smallest change that passes, then make it right with `make crap` (every function under CRAP 10), `make dry` (no duplication scored 0.8 or above) and `make mutate` (cover what's uncovered, kill survivors, delete dead code).
4. UI work: follow the design patterns in VIN-14. Pull references from Mobbin when it's available and note which patterns are borrowed. Use fal for custom imagery and save it under `frontend/public/assets/` with descriptive names.
5. Verify in the browser with **Playwright MCP**: run `make dev` (with `LLM_MODE=fake` unless a live check is wanted) and click through the flow.
6. Run **/coderabbit:code-review**, fix the findings, and re-run until it's clean. Run **at most 2 re-review rounds per PR**, local and PR reviews counted together. After the second re-review:
   * Fix only critical and major findings.
   * Once the PR is open (step 7), list the remaining findings in the PR description, reply to each one with the reason it isn't fixed, then resolve it.
7. Make small commits that each say why, what changed and how it was proven. Push and open a PR.
8. Comment on the issue with a summary and the action log, then move it to **In Review**.
