---
name: land
description: Merge a finished honing-mle-skills PR once CI and CodeRabbit pass, clean up its worktree and cmux workspace, tell the other running sessions to rebase, then run /next. If a gate fails, block the issue, notify the user and still run /next. Use when the user or a worker session runs /land <PR number>.
argument-hint: <PR number>
---

# /land <PR number>

Land the one PR named. Usually a worker session sends `/land <n>` here once its PR is ready; the user can also run it. This skill is the only thing allowed to merge. When every gate passes it merges straight away, without asking; when any gate fails it merges nothing, and the loop goes on with the other issues.

**Run it from the main checkout**, the worktree that has `main` checked out (`git worktree list` shows it as `[main]`). If the current directory is somewhere else, `cd` there first. Never run /land from an `hms-vin*` worktree.

Every step after the merge can safely run twice. So if a step after the merge fails, fix the cause and run `/land <n>` again; it resumes after the merge (see step 1).

## 1. Check the gates

```
gh pr view <n> --json number,title,state,isDraft,baseRefName,headRefName,headRefOid,isCrossRepository,mergeable,url
```

Record `headRefOid`. Every gate is checked against it, the merge is tied to it, and cleanup only deletes a branch that still points at it. A merged PR keeps the `headRefOid` it was merged at, so a resume reads the same value.

First, two checks that apply on every run, including a resume:
- `baseRefName` must be `main`, and `isCrossRepository` must be false. Fork PRs are refused: cleanup derives worktree and branch names from `headRefName`, which a fork could set to collide with a running worker. If either check fails, stop.

Then look at `state`:
- **MERGED**: this is a resume. Say so, skip the gates and the merge, and go to step 3.
- **CLOSED**: stop.
- **OPEN**: check the gates below.

```
gh pr checks <n> --json name,state,bucket
```

Look for unresolved CodeRabbit review threads, reading **every** page:

```
gh api graphql --paginate -f query='query($o:String!,$r:String!,$n:Int!,$endCursor:String){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor} nodes{isResolved comments(first:1){nodes{author{login}}}}}}}}' -F o=Lalanne0 -F r=honing-mle-skills -F n=<n> --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select((.isResolved|not) and .comments.nodes[0].author.login=="coderabbitai")] | length'
```

This prints one count per page. Add them up.

Then run `gh pr view <n> --json headRefOid` again. If the SHA changed while the gates were being checked, the results may not apply to the new head, so the PR is not ready.

Print a short summary:

```
PR #<n>  <title>
State: OPEN, base: main, mergeable: MERGEABLE
CI (lint-and-test): pass
CodeRabbit: pass, 0 unresolved threads
Other checks: none failing, pending or cancelled
```

**The gates.** All of them must hold:

1. `state` is OPEN, `isDraft` is false, and `mergeable` is MERGEABLE. If it is UNKNOWN, GitHub is still computing it, so the PR is not ready.
2. A check named `lint-and-test` **exists** and its bucket is `pass`. If it is missing, the PR is **not ready**. A missing check never counts as passed.
3. A check named `CodeRabbit` exists and its bucket is `pass`.
4. Every other check is in the `pass` or `skipping` bucket. A check in `fail`, `pending` or `cancel` fails this gate.
5. There are 0 unresolved CodeRabbit threads.
6. The head SHA did not change while the gates were being checked.

If the only failing gates are pending checks (bucket `pending`) or `mergeable` UNKNOWN, wait once:
- Pending checks: `gh pr checks <n> --watch`, which returns when every check has finished.
- `mergeable` UNKNOWN: `--watch` does not wait for this. Run `gh pr view <n> --json mergeable` again, up to 3 times, until it is no longer UNKNOWN.

Then check every gate again from the top of this step. Wait at most once per `/land` run.

If any gate still fails, **do not merge** and never override. Instead:

1. Find the issue number from the head branch (`vlalanne0/vin-<N>-...`).
2. `save_comment` on VIN-<N>: the PR link, which gates failed and what they showed, and that the user runs `/land <n>` once it is fixed.
3. `save_issue` VIN-<N> with state `Blocked`, so `/next` stops counting it as in flight. Leave its worktree and workspace alone.
4. Notify the user:

   ```
   cmux notify --title hms-loop --body "PR #<n> not merged: <failing gates>"
   ```

5. Skip steps 2 to 5 and go to step 6.

## 2. Merge

```
gh pr merge <n> --squash --match-head-commit <headRefOid>
```

`--match-head-commit` makes GitHub refuse the merge if anything was pushed after the gates were checked. Do not pass `--delete-branch`: it fails while the branch is still checked out in the worker's worktree. GitHub deletes the remote branch itself on merge (the repository's "Automatically delete head branches" setting), and step 4 deletes the local one. If the merge is refused (a new push, branch protection, anything else), report the error and stop.

## 3. Update main

In the main checkout, which is already on `main`:

```
git pull --ff-only
```

If it fails, stop and report it: `/next` must not start worktrees from a stale `main`. Once the user has fixed it (usually by committing or stashing local changes), `/land <n>` resumes here.

## 4. Clean up

Find the issue number from the head branch (`vlalanne0/vin-<N>-...`). Each step below may find its target already gone; that is fine, go on. Do the steps in this order.

**a. Confirm the worktree belongs to this PR.** A later `/next` may have reused the path for a new issue. Read every worktree's HEAD and branch in one call:

```
git worktree list --porcelain
```

Each worktree is a block of lines: `worktree <absolute path>`, `HEAD <sha>`, then `branch refs/heads/<name>` (or `detached`). Find the block whose `worktree` path ends in `/hms-vin<N>`. If there is none, the worktree is already gone (for example, a previous run removed it and then stopped): close the `hms-vin<N>` workspace if `cmux workspace list` still shows one, then go to step d. If its `branch` line is not `branch refs/heads/<headRefName>`, the path was reused: leave that worktree **and** its `hms-vin<N>` workspace alone, report the conflict, and go to step d.

**b. Check HEAD.** If the block's `HEAD` is not `<headRefOid>`, the worker has commits that are not in the merged branch. **Skip cleanup for this worktree**: leave the worktree, its workspace and its branch alone, report it to the user, and go to step 5.

**c. Remove the worktree, then stop the worker.**

```
git worktree remove ../hms-vin<N>
```

Never pass `--force`. Without it, git refuses to remove a worktree that has modified or untracked files. That refusal is the guard for uncommitted work. Ignored files (`.venv`, `node_modules`, any `backend/.env` copied in) are deleted with the worktree; they are disposable, and the main checkout keeps the real `backend/.env`. If git refuses, **skip cleanup for this worktree**: leave its workspace and its branch alone, report git's message to the user, and go to step 5.

Once the worktree is removed, find the ref of `hms-vin<N>` in `cmux workspace list` and run `cmux close-workspace --workspace <ref>`. If no workspace matches, go on. Then:

```
git worktree prune
```

**d. Delete the local branch.**

```
git worktree list --porcelain
git update-ref -d refs/heads/<headRefName> <headRefOid>
```

If any line of `git worktree list --porcelain` reads `branch refs/heads/<headRefName>`, another worktree still has the branch checked out. Stop and report it rather than leave that worktree with a missing branch. `update-ref -d` with the recorded SHA deletes the branch only if it still points at the merged commit. If it fails because the tip moved, stop and report it, so those commits are not lost.

**e. Check the remote branch.** Run `git ls-remote --heads origin <headRefName>`. It should be gone, because GitHub deleted it on merge. If it is still there, that setting is off. Delete it only if it still points at the merged commit, then tell the user the setting is off:

```
git push --force-with-lease=refs/heads/<headRefName>:<headRefOid> origin :refs/heads/<headRefName>
```

This command is deliberately not on the allowlist, so it asks first. If the lease fails, the branch moved: stop and report it.

## 5. Tell the other sessions

For every other workspace in `cmux workspace list` whose name starts with `hms-vin`:

```
cmux send --workspace <ref> "main has moved; rebase on main before opening or updating your PR."
cmux send-key --workspace <ref> Enter
```

If `cmux send` fails because the session has a question or dialog open, do not use `--force`. List that workspace in the report so the user can pass the message on.

## 6. Next batch

Report what was merged (or which gates failed), what was cleaned up and which workspaces were notified. Then run the `/next` skill.
