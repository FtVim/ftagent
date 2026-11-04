# ftagent

An aesthetic and feature-rich pi config.

```bash
pi install git:github.com/ftvim/ftagent
```

## Subagents

The `subagent` tool runs named agents in separate Pi processes. Define user agents
as Markdown files in `~/.pi/agent/agents/` with `name` and `description`
frontmatter, and optionally `tools` and `model`. The tool supports a single task,
parallel `tasks`, or a sequential `chain` where `{previous}` inserts the prior
agent's output.

User agents are the default. To use repository agents from `.pi/agents/`, set
`agentScope` to `project` or `both`; Pi asks for confirmation before running
their prompts. Project agents are not run when interactive confirmation is
unavailable.
