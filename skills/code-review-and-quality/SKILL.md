---
name: code-review-and-quality
description: >-
  Reviews completed changes before merge or sign-off. Use during /verify to
  assess correctness, readability, architecture, security, and performance.
---

# Code Review and Quality

Review the change against the user's request, an approved plan if present, and
the repository's conventions. This is a read-only review, not a request to
rewrite code.

## Review

Inspect the diff and relevant surrounding code. Evaluate:

- **Correctness:** requirements, boundary cases, state transitions, and error
  handling.
- **Readability:** names, control flow, and unnecessary complexity.
- **Architecture:** existing patterns, boundaries, and appropriate abstractions.
- **Security:** validation at trust boundaries, access control, secrets, and
  unsafe data flows relevant to the change.
- **Performance:** unbounded work, avoidable I/O, and hot-path costs relevant to
  the change.

Use the `style` skill for code-style concerns. Do not invoke
specialist audits unless the user asks for them or the change warrants them.
Check relevant verification evidence without requiring tests-first or a
separate test for every invalid state.

## Findings

Report only actionable issues. For each finding, include severity (`Critical`,
`Required`, `Optional`, or `Nit`), file and line, concise evidence, and a
recommended fix. Check callers, guards, and tests before reporting. Identify
pre-existing issues separately; zero findings is a valid result.

End with a concise verdict and note checks run and material verification gaps.
Do not edit, stage, or commit.
