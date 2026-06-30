# use-harness Router Contract

`use-harness` is a manager/router. It is the only user-facing component. Harness backends are internal workers.

## Delegation envelope

By default every delegated prompt is wrapped into a Markdown **worker packet** (`prompt.md`) via `buildPromptPacket()`. The legacy XML wrapper `buildDelegationPrompt()` remains exported for compatibility.

Packet sections:

- **Contract** — worker is internal, not user-facing
- **Assignment** — run id, backend, task, workspace, permission mode, model, mode
- **Objective** — user-supplied task text
- **Scope**, **Constraints**, **Expected deliverable**, **Result shape**

Pass `--raw-prompt` to send the user prompt verbatim (e.g. amp review focus text, exact CLI pass-through). Raw runs still write `input.md` and `prompt.md`.

## Normalized result fields

Workers should return (in Markdown or structured text):

- `summary`
- `evidence`
- `files_changed`
- `commands_run`
- `verification`
- `blockers`

## Run statuses

Stable `status` values from `harness-status.mjs`:

| Status | Meaning |
|--------|---------|
| `created` | Run receipt created |
| `dry-run` | Artifacts built, no worker invoked |
| `running` | Worker in progress (reserved) |
| `success` | Worker completed successfully |
| `partial-success` | Partial completion (reserved) |
| `worker-failed` | Nonzero worker exit |
| `cli-missing` | Harness binary not in PATH |
| `timeout` | Worker timed out (reserved) |
| `parse-failed` | Native bridge launch/parse failed |
| `config-invalid` | Invalid cwd, image task, missing prompt, etc. |
| `needs-human` | Reserved alias for human-required failures |

Failure envelopes also include:

- `retryable` — boolean
- `needsHuman` — boolean
- `failure` — `{ code, message, phase, retryCount, fallbacksTried }`

## JSON envelope fields

Success and failure `--json` output includes:

- `ok`, `path`, `harness`, `task`, `run_id`, `paths`, `route`
- `status`, `retryable`, `needsHuman` (failures)
- `dryRun`, `exitCode` (dry-run)
- `command`, `text`, `stderr`, `model`, `mode`

## Routing artifact

Every run writes `route.json` via `buildRouteDecision()`:

- `routing_source`: `explicit-harness` | `alias-resolution` | `native-required` | `mode-override`
- `rationale`, `prompt_strategy` (`wrapped` | `raw`)
- Placeholders: `writeIsolation: "none"`, `lockRequired: false`, `budget: { mode: "default" }`

## Run directory layout

Each delegation creates `<workspace>/.harness/runs/<run_id>/` under `--cwd` (or a fallback cwd for preflight failures when `--cwd` is invalid):

```text
receipt.json
input.md
prompt.md
route.json
command.json
stdout.log
stderr.log
bridge.json          # native bridge runs only
transcript.md        # when outFile or native text captured
result.json
summary.md
aggregate.json
events.jsonl
```

Preflight failures (missing harness, missing prompt, image task, invalid cwd) also create a run directory with `receipt.json`, `result.json`, `summary.md`, `aggregate.json`, and `events.jsonl`. When prompt/harness are available, `input.md`, `prompt.md`, and `route.json` are written too.

## Event lifecycle

```text
run.created
route.selected
prompt.written
command.built
worker.started
worker.completed | worker.failed
failure.classified   # on classified failures
result.written | run.failed
summary.written
dry_run.completed    # dry-run only
```

## Dry-run

```bash
node run-harness.mjs --harness codex --prompt "..." --dry-run [--json]
USE_HARNESS_DRY_RUN=1   # env fallback
```

Builds route, prompt, and command artifacts without invoking harness CLIs. Exits before `which()`, AI SDK, or worker execution.

## Summarize existing run

```bash
node run-harness.mjs summarize-run --run-dir .harness/runs/<run-id> [--json]
```

Regenerates `summary.md` content from on-disk artifacts via `aggregateRun()`.

## Manager responsibilities

The router reads backend output, verifies edit work when needed, and returns one synthesized user-facing answer.

## Safety defaults

- `--cwd` must resolve to an existing directory before worker execution (invalid cwd still records a preflight failure run using a fallback root).
- JSON and log artifacts redact common API key/token/password patterns via `harness-redact.mjs`.
- Destructive git operations are not approved by the router; backend workers must request explicit user instruction.