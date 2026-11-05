# ftagent

```bash
pi install git:github.com/ftvim/ftagent
```

## Engineering Workflow

The workflow has three phases: plan when useful, implement the scoped change,
then review before sign-off.

```text
Task arrives ──→ /plan <request> (optional, when a plan helps)
                                  │
                                  ▼
/implement — types and contracts → invariants → implementation
                                  │
                                  ▼
/review — code review → findings and verification gaps
                                  │
                                  ▼
                         Human approval → commit
```

### Choose the right tool

- **Skill:** `style` is reusable coding guidance for implementation and
  review. Pi loads it when relevant; use `/skill:style` to invoke it.
- **Prompts:** `/plan`, `/implement`, and `/review` are the lifecycle phases.
  Planning is optional; the prompt files contain phase-specific instructions.
- **Review skill:** `code-review-and-quality` guides `/review` across
  correctness, readability, architecture, security, and performance. It uses
  `style` for coding guidance.
- **Agents:** `/plan` chains read-only `scout` exploration into `planner`;
  `/implement` delegates to `worker`; `/review` delegates to read-only
  `reviewer`.
- **Extension:** the ftagent runtime powers the workflow's subagent tool and
  provides Git checkpoints, safety guards, and persisted plan todos. It
  extracts numbered steps from `/plan` responses and tracks `[DONE:n]`
  markers. `/implement` delegates to one worker; `/review` delegates to one
  read-only reviewer. One implementation worker avoids competing edits in the
  shared worktree.

Plan todos are stored in the Pi session rather than a project `.md` file. The
saved list appears in the TUI checklist and is supplied as context to later
`/plan` and `/implement` prompts.

Git checkpoints are automatic recovery points for session branching, not
commits or a substitute for preserving existing work. Agents inspect the
worktree before editing, leave unrelated changes untouched, and do not stage
or commit. The shutdown auto-commit is a fallback that may stage all pending
worktree changes, so review the intended files before relying on it.

mandatory specs, task lists, tests-first development, or per-slice commits.
Review uses one review skill and one reviewer agent; it does not fan out to
specialists by default. Style guidance is cross-cutting, not another phase.

Pi discovers the package's prompt templates and skills through the `pi`
manifest. To link the bundled agents, prompts, and skills into your global Pi
agent configuration:

```bash
PACKAGE_DIR="$HOME/.pi/agent/git/github.com/ftvim/ftagent"
mkdir -p "$HOME/.pi/agent/agents" "$HOME/.pi/agent/prompts" "$HOME/.pi/agent/skills"

for f in "$PACKAGE_DIR"/agents/*.md; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$HOME/.pi/agent/agents/$(basename "$f")"
done

for f in "$PACKAGE_DIR"/prompts/*.md; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$HOME/.pi/agent/prompts/$(basename "$f")"
done

for d in "$PACKAGE_DIR"/skills/*; do
  [ -d "$d" ] || continue
  ln -sfn "$d" "$HOME/.pi/agent/skills/$(basename "$d")"
done
```

The implementation approach is type- and invariant-first, not tests-first.
Validate external input, handle operational errors, and use static or smoke
checks proportional to risk. Preserve the user's complete request and
important context strings verbatim in agent handoffs.

`/review` does not stage or commit. Get human approval and commit only the
intended files.
