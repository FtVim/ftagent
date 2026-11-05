---
description: Read existing types and invariants before deciding whether planning is needed
---
Use the user-level "scout" subagent as a read-only explorer for: $@

Preserve the complete user request verbatim in the task sent to the agent. Do not
rephrase it or replace it with a summary.

Ask "scout" to inspect the relevant code, types, assertions, error paths, and
boundaries before asking the user anything. Return:

## Findings
- Relevant files and existing patterns
- Whether the task is small/understood or complex/high-risk
- Any unresolved decision that blocks safe progress

Ask at most one focused question, and only for a blocking architectural or
design decision discovered during exploration. Otherwise, ask no broad
requirements questions and do not write files.

For small, understood work, recommend direct execution with `/build`.
For complex/high-risk work, recommend `/plan` for one feature document.
