---
description: Implement a scoped change using an approved plan when present
---
<!-- ftagent:todos -->

Follow the `style` skill while implementing and pass its relevant
principles to the worker.

Preserve the complete user request `$@` verbatim in every subagent handoff.
Treat any feature brief as supporting context, not permission to change scope.

Invoke "worker" with the verbatim request and relevant approved plan, if any.
The worker inspects the current worktree and affected code before editing, then
implements the smallest scoped change. Use one worker for edits; do not start
competing implementation agents in the shared worktree.

If persisted plan todos are included in session context, pass the numbered
steps to the worker. Implement in coherent, verifiable slices; resolve
important risks early, then verify each slice with the project's relevant
checks. Keep verification proportional—no tests-first or negative-space test
requirement. Include `[DONE:n]` only for completed steps so the extension can
update progress.

Tests-first is not required. Run appropriate checks, but leave independent
review to `/review`. Do not stage or commit. Git checkpoints are recovery
points for session branching, not commits or permission to discard changes.
