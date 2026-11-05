---
name: style
description: >-
  Applies Style principles to code writing and review. Use when designing,
  implementing, or reviewing code in any language, adapting details to the
  repository's established conventions.
---

# Style

## Design Priorities

Evaluate decisions in this order: safety, performance, and developer
experience. Think through failure modes before implementation, prefer the
smallest design that satisfies the real requirements, and record the reason
for non-obvious choices. Do not leave known correctness problems as future
work.

## Safety

- Keep control flow explicit. Bound loops, queues, retries, buffers, and
  batches; make termination conditions and limits visible.
- Use types and contracts to exclude invalid states. Assert internal
  invariants and validate external input at boundaries.
- Treat programmer mistakes differently from expected operating failures:
  fail fast on broken invariants, but handle expected errors explicitly.
- Make important boundaries clear. Do not use assertions to reject ordinary
  user input or hide errors behind success-shaped fallbacks.
- Keep state and variables close to where they are used. Prefer a small number
  of clear abstractions over generic machinery.
- Keep functions under 70 lines and source lines under 100 columns. Split
  functions around responsibilities, keeping decisions easy to follow.
- Respect strict compiler warnings and existing formatter and lint rules.

## Performance

Consider resource costs while choosing a design, especially for hot paths.
Batch work when it reduces repeated I/O or coordination; measure before
optimizing non-critical code. Avoid unpredictable work and allocations where
the language or runtime provides a practical alternative.

## Developer Experience

- Use descriptive names and the repository's naming conventions; avoid
  unexplained abbreviations. Include units in names when they clarify values.
- Make argument meaning and library options explicit at call sites.
- Put important entry points and concepts where readers encounter them early.
- Explain why code takes a non-obvious path. Keep comments focused on rationale.
- Add dependencies only when their benefits justify their maintenance and
  supply-chain costs.

## Review Checklist

- [ ] Are inputs validated and internal invariants asserted?
- [ ] Are error paths explicit, and is forbidden state rejected?
- [ ] Are all repeating operations bounded?
- [ ] Are control flow and state changes straightforward to audit?
- [ ] Are naming, function size, line width, warnings, and formatting in bounds?
- [ ] Were performance costs considered where they matter?

Tests and verification should fit the risk. This style does not require
tests-first development.
