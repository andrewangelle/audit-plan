---
name: audit-plan
description: Audit an implementation plan (e.g. in .claude/plans/) against the actual codebase and fix it in a loop until it passes. Use when the user wants a plan verified before implementing it.
---

Run `npx -y audit-plan <plan> [options]` via Bash from the repo root. `<plan>` is a path, or a filename in `.claude/plans/` (with or without `.md`). Pass through any options the user gave:

- `--paths` paths the audit may read (`"a b"`, `a,b`, or repeated)
- `--run-tests` command the audit may run to confirm runtime claims
- `--max-iters` (default 8), `--required-clean` (default 2), `--turn-cap` (default 30)
- `--audit-model` / `--fix-model` (defaults `opus` / `sonnet`)
- `--audit-effort` / `--fix-effort` (`low` | `medium` | `high` | `xhigh` | `max`)

The run can take several minutes; use a long timeout. Afterwards, report the final verdict, the number of iterations, and the total cost.

Exit codes: `0` converged; `1` plan not found, audit error, fix made no change, or hit `--max-iters`; `2` invalid arguments.
