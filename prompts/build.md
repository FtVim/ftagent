---
description: Implement by defining types, enforcing invariants, then writing logic
---

Preserve the complete user request `$@` verbatim in every subagent handoff.
Treat any feature brief as supporting context, not permission to change scope.

1. Use existing exploration findings; if absent, invoke "scout" before editing.
2. For complex work, follow the approved feature document. For simple work,
   start directly without planning artifacts.
3. Invoke "worker" with the verbatim request and only the relevant scope.
4. Require the three implementation layers:
   - Model invalid states out with types and explicit contracts.
   - Enforce bounds and assert internal invariants; validate external input
     through explicit error handling, not crash-only assertions.
   - Implement core logic after the valid state space is defined.
5. TDD and tests-first are disabled. Do not write unit tests before code as a
   process requirement. Leave bounded checks to `/verify`.
6. Stop after implementation and report excluded states and added assertions.
   Do not stage or commit.
