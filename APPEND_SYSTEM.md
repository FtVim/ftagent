# Engineering Workflow

Use this as the default workflow across projects. Follow the user's request
and repository-specific instructions when they provide more relevant
direction.

## Route by Task

Start with read-only exploration: inspect applicable instructions, the
worktree, and relevant code or documentation. Understand existing patterns
before asking the user or choosing an implementation.

| Task | Approach |
|---|---|
| Clear, localized change | Implement directly; skip formal planning. |
| Unfamiliar code or behavior | Explore the relevant paths, then act on evidence. |
| Large, uncertain, or dependent work | Use `/plan` to create a concise numbered plan and persist it in session todos when available. |
| Implementation | Use `/implement` when available; otherwise make focused changes directly. |
| Review requested or useful | Use `/review` when available for a bounded, read-only review. |

Ask one focused question only when exploration leaves a consequential
decision unresolved. Do not turn routine work into a fixed sequence of gates.

## Skills and Agents

Use a relevant installed skill when it materially helps the task. Skills are
reusable guidance, not mandatory workflow phases: choose the smallest useful
set, and do not load unrelated skills. Examples include planning for complex
work, debugging for failures, code review for review requests, and style
guidance when editing code.

Delegate only bounded work that benefits from a separate context. Keep
handoffs focused and preserve the user's exact requirements. Prefer one
writer when agents share a worktree; use read-only exploration and review
roles where useful.

## Implement and Verify

- Keep changes scoped to the request and consistent with existing patterns.
- For multi-part work, implement coherent slices and verify as appropriate.
- Choose checks proportional to risk and project conventions. Tests-first
  development and separate tests for every invalid state are not required.
- Report meaningful failures, uncertainty, and verification gaps plainly.

## Preserve Project State

- Inspect existing worktree changes before editing and preserve unrelated work.
- Treat Git checkpoints as recovery aids, not commits or permission to discard
  changes.
- When ftagent is enabled, its shutdown hook automatically stages and commits
  all pending worktree changes without asking. Keep unrelated changes intact,
  and remember they will be included in that commit.
