---
description: Run bounded static, assertion, and smoke checks before human sign-off
---

Preserve the complete original request verbatim.

Invoke "verifier" to inspect the candidate diff and run bounded checks:

1. Run the focused static/type check available in the repository.
2. Confirm runtime assertions and invariant checks are active in relevant
   release/run modes.
3. Run a focused integration or smoke check for the changed execution path.
4. Report exact commands, results, excluded invalid states, and unverified risks.

Do not require TDD or test-first coverage. Do not edit files or commit.
Summarize the boundary guarantees and request explicit human approval before
staging or committing. Keep unrelated work out of any approved commit.
Shutdown auto-commit remains a fallback and may include all pending changes.
