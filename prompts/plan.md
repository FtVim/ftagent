---
description: Explore the codebase and produce a numbered implementation plan
---
<!-- ftagent:todos -->

Reconcile persisted plan todos included in session context when refining or
continuing an existing plan. Preserve completed steps when still relevant and
mark them `[DONE:n]`.

Copy the persisted todos into the planner's task; use `none` when no saved
todos are present.

Call the subagent tool once in sequential `chain` mode:

```json
{
  "chain": [
    {
      "agent": "scout",
      "task": "Read-only exploration. Original request (verbatim):\n$@"
    },
    {
      "agent": "planner",
      "task": "Request: $@\nTodos: [session todos or none]\nScout: {previous}\nReturn Plan."
    }
  ]
}
```

The planner returns the plan in its response under a `Plan:` heading, with
steps formatted as `1. ...`, `2. ...`. Keep the plan proportional: skip
planning for obvious small changes; for larger work, order coherent slices by
their dependencies and surface important risks or decisions early. Include a
clear outcome and suitable verification in each step.

Do not create a `.md` plan file or implement the plan. The extension saves the
numbered steps as session todos and tracks `[DONE:n]` markers. Present the
planner's numbered list under a `Plan:` heading in the final response.

Follow the user's exact requirements; do not paraphrase their request.
