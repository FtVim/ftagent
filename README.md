# ftagent

```bash
pi install git:github.com/ftvim/ftagent
```

## Subagents

Link the bundled scout, planner, reviewer, and worker agents and their workflow
prompts into Pi:

```bash
PACKAGE_DIR="$HOME/.pi/agent/git/github.com/ftvim/ftagent"
mkdir -p "$HOME/.pi/agent/agents" "$HOME/.pi/agent/prompts"

for f in "$PACKAGE_DIR"/agents/*.md; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$HOME/.pi/agent/agents/$(basename "$f")"
done

for f in "$PACKAGE_DIR"/prompts/*.md; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$HOME/.pi/agent/prompts/$(basename "$f")"
done
```
