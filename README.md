# ftagent

## Install

```bash
pi install git:github.com/ftvim/ftagent
```

## Load the workflow

```bash
PACKAGE_DIR="$HOME/.pi/agent/git/github.com/ftvim/ftagent"
mkdir -p "$HOME/.pi/agent/agents"
cp "$PACKAGE_DIR/APPEND_SYSTEM.md" "$HOME/.pi/agent/APPEND_SYSTEM.md"

for f in "$PACKAGE_DIR"/agents/*.md; do
  [ -e "$f" ] || continue
  ln -sf "$f" "$HOME/.pi/agent/agents/$(basename "$f")"
done
```

Pi loads the package's prompts and skills from its manifest. Restart Pi or run
`/reload` to load the copied instructions and resources.
