---
name: land
description: Merge a finished honing-mle-skills PR once CI and CodeRabbit pass, clean up its worktree and cmux workspace, tell the other running sessions to rebase, then run /next. Use when the user runs /land <PR number>.
argument-hint: <PR number>
---

# /land <PR number>

Land the one PR the user named. This skill is the only thing allowed to merge. When every gate passes it merges straight away, without asking; when any gate fails it merges nothing.

## 1. Check the gates

```
gh pr view <n> --json number,title,state,isDraft,headRefName,mergeable,url
gh pr checks <n> --json name,state,bucket
```

Look for unresolved CodeRabbit review threads:

```
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{author{login}}}}}}}}' -F o=Lalanne0 -F r=honing-mle-skills -F n=<n>
```

Count the unresolved threads whose first comment is by `coderabbitai`.

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

If any gate fails, say which ones and stop. Do not merge, wait, retry or override; the user runs /land again when the PR is ready.

## 2. Merge and update main

```
gh pr merge <n> --squash --delete-branch
git checkout main && git pull --ff-only
```

If the merge is refused (for example by branch protection), report the error and stop.

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
