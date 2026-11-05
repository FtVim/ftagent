# ftagent

```bash
pi install git:github.com/ftvim/ftagent
```

## Engineering Workflow

The workflow adapts to the size and uncertainty of the task. A clear,
localized change can go straight to implementation. Explore unfamiliar work,
plan only when complexity or risk warrants it, then verify proportionally.

```text
Task arrives
    │
    ├── Clear and localized → /build
    │
    └── Unfamiliar or uncertain → /explore
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
        Understood and small          Complex or high-risk
                  │                   /plan → user approval
                  │                               │
                  └───────────────┬───────────────┘
                                  ▼
/build — types and contracts → invariants → implementation
                                  │
                                  ▼
/verify — focused checks → findings and remaining risks
                                  │
                                  ▼
                         Human approval → commit
```

### Choose the right tool

- **Prompts:** `/explore`, `/plan`, `/build`, and `/verify` are the lifecycle
  phases. Their prompt files contain the phase-specific instructions; `/plan`
  is optional.
- **Agents:** `scout`, `planner`, `worker`, and `verifier` provide bounded
  read-only exploration, conditional feature writing, scoped implementation,
  and read-only verification.
- **Extension:** the existing ftagent extension provides unrelated runtime
  features such as the subagent tool, Git checkpoints, and safety guards. The
  engineering workflow itself uses Pi-native prompts and skills.

proportional: no mandatory spec, task list, tests-first process, or per-slice

Pi discovers the package's prompt templates and skill through the `pi`
manifest. Only the bundled subagent definitions need to be linked into Pi's
agent directory:

```bash
PACKAGE_DIR="$HOME/.pi/agent/git/github.com/ftvim/ftagent"
mkdir -p "$HOME/.pi/agent/agents"

for f in "$PACKAGE_DIR"/agents/*.md; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$HOME/.pi/agent/agents/$(basename "$f")"
done
```

The build approach is type- and invariant-first, not tests-first. Validate
external input, handle operational errors, and use static or smoke checks
proportional to risk. Preserve the user's complete request and important
context strings verbatim in handoffs and feature documents.

`/verify` does not stage or commit. Get human approval and commit only the
intended files. Shutdown auto-commit remains a fallback and can stage every
pending worktree change.
