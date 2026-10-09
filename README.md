# audit-plan

Audits an agent-written implementation plan against the actual codebase, then fixes it, in a loop, until it passes.

Each iteration:

1. **Audit** (read-only, default `opus`): checks every claim the plan makes about existing code (signatures, exports, file locations, data shapes) and ends with `VERDICT: PASS` or `VERDICT: FAIL`.
2. **Fix** (default `sonnet`): on `FAIL`, edits the plan in place to resolve the findings, then re-audits.

The tool stops when the plan gets `--required-clean` clean audits in a row. It also stops if a fix step leaves the file unchanged, if an audit doesn't finish, or if it reaches `--max-iters`. Each step prints its cost and the running total.

Built on the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

## Requirements

- Node >= 24
- pnpm
- A logged in, active claude code session

## Install

```sh
TBD
```

## Usage

```sh
audit-plan <plan> [options]
```

`<plan>` is resolved in this order:

1. a path relative to the current directory
2. a filename in `<repo-root>/.claude/plans/`
3. the same, with `.md` appended

The repo root is the enclosing git repo, or the current directory if you're not in one. Both agents run from the repo root.

### Options

| Flag | Default | Description |
| --- | --- | --- |
| `--paths` | whole repo | Paths the audit may read. Accepts `"a b"`, `a,b`, or a repeated flag. |
| `--run-tests` | — | Command the audit may run via Bash to confirm runtime claims. |
| `--max-iters` | `8` | Max audit/fix iterations. |
| `--audit-model` | `opus` | Model for the audit phase. |
| `--fix-model` | `sonnet` | Model for the fix phase. |
| `--audit-effort` | `high` | `low` \| `medium` \| `high` \| `xhigh` \| `max` |
| `--fix-effort` | `medium` | `low` \| `medium` \| `high` \| `xhigh` \| `max` |
| `--required-clean` | `2` | Consecutive clean audits required to converge. |
| `--turn-cap` | `30` | Max tool-use round trips per audit or fix call. |
| `-h, --help` | | Show help. |

### Examples

```sh
# Plan in .claude/plans/, audit the whole repo
audit-plan add-auth

# Scope the audit and let it run tests
audit-plan ./plans/refactor.md --paths src/api,src/db --run-tests "pnpm test"

# Cheaper, faster run
audit-plan add-auth --audit-model sonnet --audit-effort medium --required-clean 1
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Converged |
| `1` | Plan not found, audit error, fix made no change, or hit `--max-iters` |
| `2` | Invalid arguments |

## Permissions

- **Audit**: runs in `plan` mode with only `Read`, `Glob`, `Grep`, plus `Bash(<cmd>)` when `--run-tests` is set.
- **Fix**: runs with `bypassPermissions` so it can edit files under `.claude/` headlessly. It gets `Read`, `Edit`, `Glob`, `Grep`, and Bash is denied.
