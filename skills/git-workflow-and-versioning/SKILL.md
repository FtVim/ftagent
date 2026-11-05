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

- Keep changes focused and commits limited to one coherent unit of work.
- Use a descriptive conventional subject, such as `fix: preserve todo order`.
  Explain why in the body when the reason is not clear from the subject.
- Check the intended changes before committing. Keep unrelated work intact;
  identify it rather than silently folding it into a manual commit.
- Choose verification proportional to risk and repository conventions.
  Tests-first and a test for every invalid state are not required.
- Do not force-push or rewrite shared history unless explicitly asked.

## ftagent Checkpoints and Auto-Commit

- ftagent captures Git checkpoints as session recovery snapshots. They are
  not commits or branches. Restore a checkpoint only after user confirmation.
- ftagent automatically stages and commits all pending worktree changes at
  session shutdown. This is intentional; unrelated pending changes will be
  included, so preserve them and make their presence clear to the user.
- Agents should not create competing manual commits during implementation.
  Leave the completed task for the configured shutdown commit.
- The shutdown hook derives a short commit subject from the latest assistant
  summary and does not run tests, lint, or secret scans. Report relevant
  verification gaps instead of implying those checks ran.

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
