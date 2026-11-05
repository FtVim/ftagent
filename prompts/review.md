---
description: Review code quality before human sign-off
---
Read and follow the `code-review-and-quality` and `style` skills.

Invoke the read-only "reviewer" agent. Pass the original request verbatim and
any approved plan; ask for actionable findings across correctness,
readability, architecture, security, and performance. Include severity, file
and line, evidence, and a fix recommendation. Distinguish pre-existing issues
from regressions; zero findings is valid.

Do not edit, stage, or commit. Report checks already run and material
verification gaps; suggest focused checks where useful. Leave fixes and commit
decisions to the user.
