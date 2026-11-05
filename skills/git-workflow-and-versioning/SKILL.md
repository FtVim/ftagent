---
name: git-workflow-and-versioning
description: >-
  Guides Git changes, commits, branches, checkpoints, worktrees, and releases.
  Use when changing code or handling Git state.
---

# Git Workflow and Versioning

Use Git to preserve clear, reviewable history and recoverable work. Follow
the project's configured workflow when it differs from these defaults.

## Changes and Commits

- Keep each commit limited to one coherent unit of work.
- Use a descriptive conventional subject, such as `fix: preserve todo order`.
  Explain why in the body when the reason is not clear from the subject.
- Check the intended staged changes before committing. Keep unrelated work
  intact; identify it rather than silently folding it into a commit.
- Choose verification proportional to risk and repository conventions.
  Tests-first and a test for every invalid state are not required.
- Do not force-push or rewrite shared history unless explicitly asked.

## ftagent Checkpoints

- ftagent captures Git checkpoints as session recovery snapshots. They are
  not commits or branches. Restore a checkpoint only after user confirmation.
- Checkpoints do not stage, commit, or apply the commit conventions below.
- Do not stage or commit until the user or repository workflow authorizes it.

## Branches and Worktrees

- Prefer the repository's existing branch workflow. Use short-lived branches
  or separate Git worktrees when parallel work needs isolated files and
  history.
- Do not switch branches or overwrite existing worktree changes without
  checking the current state first.
- Keep each worktree focused on one task and preserve user changes when
  integrating or cleaning up.

## Releases

For versioned releases, use semantic versioning: breaking changes increase
major, compatible features increase minor, and fixes increase patch. Keep
tags and changelog entries aligned with the released version.
