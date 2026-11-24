---
name: next
description: Start the next batch of Linear issues for honing-mle-skills. Picks up to 3 unblocked Todo issues that touch disjoint areas and launches each in its own git worktree and cmux workspace running an unattended Claude worker that hands its PR back with /land. Posts a final summary when the loop is done. Use when the user runs /next or asks to pick up the next issues.
---

# /next

Start up to 3 issues in parallel, each in its own worktree and cmux workspace. **Never merge anything** here: workers hand their finished PR back to this session as `/land <n>`, and `/land` runs `/next` again. That closes the loop, which runs unattended until nothing is left (step 7).

## 1. Sync main

```
git checkout main && git pull --ff-only
```

If the working tree has tracked changes or the pull fails, stop and tell the user. Untracked files are fine.

## 2. Find this session's workspace

```
cmux identify
```

Record `caller.workspace_ref` (for example `workspace:1000020006`). This is the **orchestrator ref**: workers send `/land <n>` to it. Use `caller`, not `cmux current-workspace` or `focused`: those name the workspace on screen, which is often a worker's when `/next` runs at the end of a `/land` a worker triggered. If `caller` has no `workspace_ref`, this session is not running inside cmux, so workers could not hand back. Stop and tell the user.

## 3. See what is already running

```
git worktree list
cmux workspace list
```

Worktrees named `../hms-vin<N>` and workspaces named `hms-vin<N>` belong to issues already started. Look up each one's Linear status:
- **Blocked**: the worker stopped and needs the user. It is not in flight: it does not count toward the limit and does not hold its areas. Leave its worktree and workspace alone.
- Anything else (In Progress, In Review): **in flight**. Note which areas it occupies (see step 4). In-flight issues count toward the limit of 3.

## 4. Pick issues from Linear

1. `list_issues` with project `honing-mle-skills`, team `VIN`, state `Todo`.
2. For each candidate, `get_issue` with `includeRelations: true`. Skip it if any **blockedBy** issue is not in a completed state (Done). Skip it if a `hms-vin<N>` worktree already exists.
3. Read each remaining issue's areas from its labels:
   - `area:backend`: `backend/` (domain, LLM, persistence, API). Backend issues usually chain, so take at most one.
   - `area:frontend`: `frontend/`.
   - `area:tooling`: CI, Makefile, `.claude/`, docs.
   - An issue with several `area:*` labels occupies all of them.

   Only if an issue has **no** `area:*` label, guess its area from the description and the files it names, and mark it as guessed in the report so the user can label it.
4. Take issues in priority order (Urgent first, then by identifier), adding one only if its areas are disjoint from every running and already picked issue. Stop at 3 in flight in total.

If nothing qualifies and nothing is in flight, the loop is done: go to step 7. If nothing qualifies but some issue is in flight, report (step 6) and stop; the next `/land` runs `/next` again.

## 5. Launch each picked issue

For each `VIN-<N>`, from the main repo root:

```
git worktree add --detach ../hms-vin<N> main
cmux new-workspace --name hms-vin<N> --cwd ../hms-vin<N> --command "BACKEND_PORT=<8000+N> FRONTEND_PORT=<5200+N> claude '<prompt>'"
```

Each worktree gets its own ports (VIN-23 gets 8023 and 5223) so parallel workers can run `make dev` side by side. `scripts/dev.sh` and the Vite config read both variables, and the Vite `/api` proxy follows `BACKEND_PORT`.

The prompt, with `<N>`, the ports and `<ORCH>` (the orchestrator ref from step 2) filled in. It sits inside single quotes inside a double-quoted `--command`, so it must contain no apostrophes, no double quotes, no `$` and no backticks:

> Install dependencies for backend and frontend. Then pick up VIN-<N> and follow CLAUDE.md end to end. Other issues run in parallel, so make dev must use this session ports: BACKEND_PORT=<8000+N> and FRONTEND_PORT=<5200+N> are already exported, and the browser check opens http://127.0.0.1:<5200+N>.
> You run unattended. Do not ask me routine questions: make a reasonable decision consistent with CLAUDE.md, docs/glossary.md and the VIN-14 design system, and list each decision under a Decisions made heading in the PR description.
> Live tests: only a VIN-9 style smoke test is allowed, at most one live call for this issue. Nothing else that costs money.
> Do not merge: never run gh pr merge, only the land skill in the orchestrator merges.
> Hand-off: once the PR is open, the issue is In Review, gh pr checks puts every check in the pass or skipping bucket (the same rule as the land skill), and the CodeRabbit rounds are done per the cap with no unresolved CodeRabbit thread, run cmux send --workspace <ORCH> with the text /land followed by the PR number as one quoted argument, then run cmux send-key --workspace <ORCH> Enter, then stop. If cmux send fails, run cmux notify --title hms-loop --body with the text PR number ready for /land, then stop.
> Stop conditions: if lint-and-test fails on 3 pushes in a row, or you need credentials, or anything that costs money beyond that one live call, do not send /land. Move VIN-<N> to Blocked with a comment explaining why, run cmux notify --title hms-loop --body with the text VIN-<N> blocked and a short reason. Then run cmux send --workspace <ORCH> with the text /next as one quoted argument and cmux send-key --workspace <ORCH> Enter, so the orchestrator moves on to other issues, then stop.

Pass the prompt to `claude` as one line: join the lines above with spaces.

The worktree is detached on purpose: the session creates the issue branch from its `gitBranchName` as CLAUDE.md says. Do **not** move the issue to In Progress here; the session does that.

If `git worktree add` or `cmux new-workspace` fails, report it, remove any half-made worktree with `git worktree remove ../hms-vin<N>`, and go on with the others.

## 6. Report

Print one table covering everything in flight (newly started and already running) and every Blocked worktree:

| Issue | Worktree | Workspace | Waiting on |
|---|---|---|---|
| VIN-23 Grading API | ../hms-vin23 | hms-vin23 | session starting |
| VIN-19 Practice screen | ../hms-vin19 | hms-vin19 | PR #9 open, worker hands off with `/land 9` |
| VIN-21 Grading screen | ../hms-vin21 | hms-vin21 | Blocked: CI failed 3 times |

For "Waiting on", check `gh pr list --state open --json number,title,headRefName` (a PR whose branch contains `vin-<N>-`) and the Linear status:
- no PR yet: `session working`, or `session starting` if just launched
- PR open: `PR #<n> open, worker hands off with /land <n>` (or `checks failing on PR #<n>` if `gh pr checks <n>` shows a failure)
- Linear status Blocked: `Blocked: <reason from the latest issue comment>`
- `cmux read-screen --workspace hms-vin<N> --lines 20` shows a question or permission prompt: `your answer in hms-vin<N>`

Then list any Todo issues that were skipped and why (blocked by VIN-x, area busy). Last, list any issue whose area was guessed because it had no `area:*` label, with the guess, for example: `VIN-24: no area label, guessed area:backend`.

## 7. Loop finished

Run this step only when nothing is in flight (step 3) and no Todo issue can start (step 4): none are left, or every remaining one waits on an unfinished blocker.

Gather:
- **Merged PRs**: the PR numbers this session merged with `/land` (each `/land` report names its PR). Do not search by merge date: that picks up PRs other sessions merged. Get each body with `gh pr view <n> --json number,title,body`.
- **Blocked issues**: `list_issues` with project `honing-mle-skills`, team `VIN`, state `Blocked`. Take each reason from its latest comment (`list_comments`).
- **Decisions to review**: the bullets under "Decisions made" in each merged PR body, grouped by PR.
- **Stuck Todo issues**: any Todo issue left, with the blocker it waits on.

Print the summary in this session:

```
Loop finished
Merged:   #11 VIN-19 Practice screen, #12 VIN-20 E2E suite
Blocked:  VIN-21 Grading screen (CI failed 3 times), ../hms-vin21 kept
Stuck:    VIN-25 waits on VIN-21
Decisions to review:
  #11  Used the Field Notes card for the prompt panel
  #12  ...
```

Then run:

```
cmux notify --title hms-loop --body "Loop finished"
```
