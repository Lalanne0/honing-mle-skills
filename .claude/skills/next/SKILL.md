---
name: next
description: Start the next batch of Linear issues for honing-mle-skills. Picks up to 3 unblocked Todo issues that touch disjoint areas and launches each in its own git worktree and cmux workspace running Claude. Use when the user runs /next or asks to pick up the next issues.
---

# /next

Start up to 3 issues in parallel, each in its own worktree and cmux workspace. **Never merge anything.**

## 1. Sync main

```
git checkout main && git pull --ff-only
```

If the working tree has tracked changes or the pull fails, stop and tell the user. Untracked files are fine.

## 2. See what is already running

```
git worktree list
cmux workspace list
```

Worktrees named `../hms-vin<N>` and workspaces named `hms-vin<N>` are issues already in flight. Note which areas they occupy (see step 3). Running issues count toward the limit of 3.

## 3. Pick issues from Linear

1. `list_issues` with project `honing-mle-skills`, team `VIN`, state `Todo`.
2. For each candidate, `get_issue` with `includeRelations: true`. Skip it if any **blockedBy** issue is not in a completed state (Done). Skip it if a `hms-vin<N>` worktree already exists.
3. Read each remaining issue's areas from its labels:
   - `area:backend`: `backend/` (domain, LLM, persistence, API). Backend issues usually chain, so take at most one.
   - `area:frontend`: `frontend/`.
   - `area:tooling`: CI, Makefile, `.claude/`, docs.
   - An issue with several `area:*` labels occupies all of them.

   Only if an issue has **no** `area:*` label, guess its area from the description and the files it names, and mark it as guessed in the report so the user can label it.
4. Take issues in priority order (Urgent first, then by identifier), adding one only if its areas are disjoint from every running and already picked issue. Stop at 3 in flight in total.

If nothing qualifies, say why (all blocked, all areas busy, no Todo left) and stop.

## 4. Launch each picked issue

For each `VIN-<N>`, from the main repo root:

```
git worktree add --detach ../hms-vin<N> main
cmux new-workspace --name hms-vin<N> --cwd ../hms-vin<N> --command "claude '<prompt>'"
```

The prompt, with `<N>` filled in (keep it free of apostrophes, it sits inside single quotes):

> Install dependencies for backend and frontend. Then pick up VIN-<N> and follow CLAUDE.md end to end. Do not run live tests unless the issue requires one, and if it does, ask me before running it. Stop once the PR is open and the issue is In Review. Do not merge: never run gh pr merge, only the land skill in the main checkout merges.

The worktree is detached on purpose: the session creates the issue branch from its `gitBranchName` as CLAUDE.md says. Do **not** move the issue to In Progress here; the session does that.

If `git worktree add` or `cmux new-workspace` fails, report it, remove any half-made worktree with `git worktree remove ../hms-vin<N>`, and go on with the others.

## 5. Report

Print one table covering everything in flight, newly started and already running:

| Issue | Worktree | Workspace | Waiting on |
|---|---|---|---|
| VIN-23 Grading API | ../hms-vin23 | hms-vin23 | session starting |
| VIN-19 Practice screen | ../hms-vin19 | hms-vin19 | PR #9 open, ready for `/land 9` |

For "Waiting on", check `gh pr list --state open --json number,title,headRefName` (a PR whose branch contains `vin-<N>-`) and the Linear status:
- no PR yet: `session working`, or `session starting` if just launched
- PR open: `PR #<n> open, ready for /land <n>` (or `checks failing on PR #<n>` if `gh pr checks <n>` shows a failure)
- `cmux read-screen --workspace hms-vin<N> --lines 20` shows a question or permission prompt: `your answer in hms-vin<N>`

Then list any Todo issues that were skipped and why (blocked by VIN-x, area busy). Last, list any issue whose area was guessed because it had no `area:*` label, with the guess, for example: `VIN-24: no area label, guessed area:backend`.
