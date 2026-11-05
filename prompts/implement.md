---
description: Implement a scoped change using an approved plan when present
---
<!-- ftagent:todos -->

Invoke one `worker` with the complete original request `$@`, approved plan if
present, and persisted todos. The worker follows `style` and returns
`[DONE:n]` for completed todos. Leave independent review to `/review`.
