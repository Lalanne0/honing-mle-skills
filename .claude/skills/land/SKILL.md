---
name: land
description: Merge a finished honing-mle-skills PR once CI and CodeRabbit pass, clean up its worktree and cmux workspace, tell the other running sessions to rebase, then run /next. Use when the user runs /land <PR number>.
argument-hint: <PR number>
---

# /land <PR number>

Land the one PR the user named. This skill is the only thing allowed to merge. When every gate passes it merges straight away, without asking; when any gate fails it merges nothing.

**Run it from the main checkout**, the worktree that has `main` checked out (`git worktree list` shows it as `[main]`). If the current directory is somewhere else, `cd` there first. Never run /land from an `hms-vin*` worktree.

## 1. Check the gates

Record the head commit first. Every gate is checked against it, and the merge is tied to it.

```
gh pr view <n> --json number,title,state,isDraft,headRefName,headRefOid,mergeable,url
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
State: OPEN, mergeable: MERGEABLE
CI (lint-and-test): pass
CodeRabbit: pass, 0 unresolved threads
Other checks: 0 failing, 0 pending
```

**The gates.** All of them must hold:

1. `state` is OPEN, `isDraft` is false, and `mergeable` is MERGEABLE. If it is UNKNOWN, GitHub is still computing it, so the PR is not ready.
2. A check named `lint-and-test` **exists** and its bucket is `pass`. If it is missing, the PR is **not ready**. A missing check never counts as passed.
3. A check named `CodeRabbit` exists and its bucket is `pass`.
4. No other check is in the `fail` or `pending` bucket. Skipped is fine.
5. There are 0 unresolved CodeRabbit threads.
6. The head SHA did not change while the gates were being checked.

If any gate fails, say which ones and stop. Do not merge, wait, retry or override; the user runs /land again when the PR is ready.

## 2. Merge and update main

```
gh pr merge <n> --squash --delete-branch --match-head-commit <headRefOid>
git pull --ff-only
```

`--match-head-commit` makes GitHub refuse the merge if anything was pushed after the gates were checked. If the merge is refused for that or any other reason (branch protection, for example), report the error and stop.

Run `git pull` in the main checkout, which is already on `main`. If `git pull --ff-only` fails, stop and report it: `/next` must not start worktrees from a stale `main`.

## 3. Clean up

Find the issue number from the head branch (`vlalanne0/vin-<N>-...`).

```
git worktree remove ../hms-vin<N>
git worktree prune
```

If `git worktree remove` refuses because of local changes, show `git -C ../hms-vin<N> status --short` and ask the user before using `--force`.

Close the workspace: find the ref of `hms-vin<N>` in `cmux workspace list`, then `cmux close-workspace --workspace <ref>`. If none matches, say so and go on.

## 4. Tell the other sessions

For every other workspace in `cmux workspace list` whose name starts with `hms-vin`:

```
cmux send --workspace <ref> "main has moved; rebase on main before opening or updating your PR."
cmux send-key --workspace <ref> Enter
```

If `cmux send` fails because the session has a question or dialog open, do not use `--force`. List that workspace in the report so the user can pass the message on.

## 5. Next batch

Report what was merged, what was cleaned up and which workspaces were notified. Then run the `/next` skill.
