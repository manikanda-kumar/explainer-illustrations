# Droid-native bridge spec

Omnigent-style **Tier A** harness: run Factory Droid's interactive TUI in tmux, inject via `tmux send-keys`, mirror output from `~/.factory/sessions/*.jsonl`.

> **Path note:** Commands in this file use `$SKILL_DIR/scripts/...`. Set `SKILL_DIR` to the absolute path of the `use-harness` skill directory (e.g. `~/.agents/skills/use-harness`) — see SKILL.md "How to invoke".

**Model constraint:** only custom models routed to **OpenCode Zen Go** (`https://opencode.ai/zen/go/v1`) defined in `~/.factory/config.json` and `~/.factory/settings.json`. No OpenCode CLI bridge required.

## Factory config locations

| Path | Purpose |
|------|---------|
| `~/.factory/config.json` | **Custom model definitions** — `custom_models[]` with `model`, `model_display_name`, `base_url`, `api_key`, `provider`. Source of truth for zen/go allowlist. |
| `~/.factory/settings.json` | **Droid runtime settings** — `customModels[]` with stable Droid ids (`custom:OpenCode-*`), `sessionDefaultSettings.model`, hooks, autonomy. Merged at runtime. |
| `~/.factory/sessions/` | **Session transcripts** — `<encoded-cwd>/<uuid>.jsonl` (bridge mirror source). |
| `~/.grok/droid-native/` | **Bridge state** — tmux targets, inject locks, optional `events.ndjson`. |

Docs: https://docs.factory.ai/cli/getting-started/overview

After editing `config.json`, restart Droid or run a fresh `droid exec` so custom models reload. Droid surfaces custom models from `~/.factory/settings.json` (note in `droid exec` error output: *"Custom models are loaded from ~/.factory/settings.json"*) — keep both files in sync.

## Droid CLI (`droid --help`)

```text
Usage: droid [options] [command] [prompt...]

Options:
  --settings <path>     Runtime settings merged for this process only
  --cwd <path>          Working directory
  -r, --resume [id]     Resume session (default: last modified)
  --fork <id>           Fork and resume
  -w, --worktree [name] Git worktree isolation

Commands:
  exec [prompt]         Non-interactive (scripts, bridge Tier B)
  search|find <query>   Search local sessions
  mcp / plugin          Extensions

Examples:
  droid "review app.tsx"          Interactive TUI with initial prompt
  droid                           Interactive TUI
  droid exec "analyze this file"  Headless one-shot
```

### `droid exec --help` (headless / automation)

Key flags for harness routing:

| Flag | Use |
|------|-----|
| `-m, --model <id>` | Model id — built-in (`claude-opus-4-8`) or custom (`custom:OpenCode-Kimi-2.6-0`) |
| `-o, --output-format` | `text` or `json` |
| `--auto low\|medium\|high` | Autonomy for writes (default: read-only) |
| `--skip-permissions-unsafe` | YOLO — skip permission prompts |
| `--settings <path>` | Override `sessionDefaultSettings` (model, autonomy) for one run |
| `--use-spec` | Spec mode |
| `--mission` | Multi-agent mission mode |
| `-s, --session-id` | Continue existing session |
| `--cwd`, `-w, --worktree` | Directory / worktree |

```bash
droid --help
droid exec --help
droid help exec
```

## Setup: zen/go custom models in Droid

### 1. Add model to `~/.factory/config.json`

Each zen/go entry must use the OpenCode Zen Go API base URL:

```json
{
  "custom_models": [
    {
      "model": "kimi-k2.6",
      "model_display_name": "OpenCode Kimi-2.6",
      "base_url": "https://opencode.ai/zen/go/v1",
      "api_key": "$OPENCODE_API_KEY",
      "provider": "generic-chat-completion-api",
      "max_tokens": 16384
    }
  ]
}
```

- **`model`** — upstream id sent to Zen Go (same id as `opencode-go/<model>` suffix).
- **`model_display_name`** — shown in Droid UI; becomes part of `custom:OpenCode-*` label.
- **`api_key`** — prefer env var (`$OPENCODE_API_KEY`) over inline secrets.

### 2. Sync Droid custom id in `~/.factory/settings.json`

Droid assigns runtime ids like `custom:OpenCode-Kimi-2.6-0`. After adding to `config.json`, run:

```bash
droid exec -m __invalid__ -o text probe 2>&1 | grep -o 'custom:OpenCode[^,]*'
```

Copy the matching `custom:OpenCode-*` id into `settings.json` → `customModels[]` (or let Droid regenerate on next launch). Set default model:

```json
{
  "sessionDefaultSettings": {
    "model": "custom:OpenCode-Kimi-2.6-0",
    "autonomyMode": "auto-medium"
  }
}
```

Ensure `settings.json` is valid JSON (a syntax error here breaks id lookup; bridge falls back to probing `droid exec`).

### 3. Verify model names

```bash
# Bridge allowlist (zen/go only)
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" models

# Quick exec smoke test (pass the Droid custom id directly to raw `droid exec`)
droid exec -m custom:OpenCode-Kimi-2.6-0 -o text "reply ok"
```

> The `opencode-go/<id>` alias (e.g. `opencode-go/kimi-k2.6`) is resolved to `custom:OpenCode-*` by the **router** (`run-harness.mjs`) and **native bridge** (`droid-native-bridge.mjs`) resolver only. Raw `droid exec` does not understand `opencode-go/...` — pass the `custom:OpenCode-*` id directly.

### Model name cheat sheet

| You say | Config `model` | Droid `-m` | Bridge `--model` |
|---------|----------------|------------|------------------|
| OpenCode Go style | `kimi-k2.6` | `custom:OpenCode-Kimi-2.6-0` | `opencode-go/kimi-k2.6` |
| Bare upstream id | `kimi-k2.6` | `custom:OpenCode-Kimi-2.6-0` | `kimi-k2.6` |
| Droid custom id | — | `custom:OpenCode-Kimi-2.6-0` | `custom:OpenCode-Kimi-2.6-0` |
| Built-in (not in bridge) | — | `claude-opus-4-8` | ❌ rejected |

Interactive TUI has no `-m` flag — pass model via `--settings` (bridge does this automatically) or `sessionDefaultSettings` in `settings.json`.

## Model resolution

Accept any of:

| Input | Example | Droid `-m` |
|-------|---------|------------|
| OpenCode Go id | `opencode-go/kimi-k2.6` | `custom:OpenCode-Kimi-2.6-0` |
| Bare zen/go model id | `kimi-k2.6` | `custom:OpenCode-Kimi-2.6-0` |
| Droid custom id | `custom:OpenCode-Kimi-2.6-0` | (passthrough) |

Resolver: `scripts/droid-model-resolver.mjs` — reads `~/.factory`, validates `base_url` / `baseUrl` contains `opencode.ai/zen/go`, maps to Droid `custom:OpenCode-*` ids.

List allowed models:

```bash
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" models
```

Default: `DROID_NATIVE_DEFAULT_MODEL` or `opencode-go/kimi-k2.6`.

Launch merges a runtime settings file so the TUI picks the model:

```json
{
  "sessionDefaultSettings": {
    "model": "custom:OpenCode-Kimi-2.6-0",
    "autonomyMode": "auto-medium"
  }
}
```

via `droid --settings <path> --cwd <repo>`.

### Example zen/go entries in `~/.factory/config.json`

Models with `"base_url": "https://opencode.ai/zen/go/v1"` — e.g. `kimi-k2.6`, `deepseek-v4-pro`, `minimax-m2.7`, `glm-5.1`, `qwen3.6-plus`. Droid registers them as `custom:OpenCode-*` (see `~/.factory/settings.json` `customModels` for stable ids).

## Execution tiers

| Tier | Mechanism | When |
|------|-----------|------|
| **A — native** | tmux + bridge + JSONL mirror | Multi-turn TUI, mission mode, orchestrator inject |
| **B — exec** | `droid exec -m custom:OpenCode-*` | Scripts, CI, router default |
| **C — stream** | `droid exec --input-format stream-json` | Programmatic multi-turn without tmux |

## Bridge layout

Root: `~/.grok/droid-native/<bridge_id>/`

```
<bridge_id>/
  bridge.json      # harness, cwd, model, droid_model, settings_path
  tmux.json        # socket, session, pane target
  state.json       # session_id, jsonl_path, byte_offset, phase
  inject.lock
  events.ndjson    # optional mirror log
```

## Session discovery

Cwd-scoped: `~/.factory/sessions/<encoded-cwd>/<uuid>.jsonl`

Encoded cwd: `/Users/you/repo` → `-Users-you-repo`

## Launch / inject / mirror

Same as Omnigent pattern:

```bash
tmux -L droid-native new-session -d -s droid-<id> -c "$CWD" -- \
  droid --settings /tmp/droid-bridge-settings.json --cwd "$CWD" ["$PROMPT"]

tmux -L droid-native send-keys -t droid-<id>:0.0 -l -- "$PROMPT"
tmux -L droid-native send-keys -t droid-<id>:0.0 Enter
```

Tail `jsonl_path` from `byte_offset`; map `message` rows to unified NDJSON (`user`, `assistant`, `tool_use`, `todo_state`).

## Helper CLI

```bash
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" launch \
  --cwd . --model opencode-go/kimi-k2.6 --prompt "start"

node "$SKILL_DIR/scripts/droid-native-bridge.mjs" inject \
  --id <bridge_id> --prompt "next step"

node "$SKILL_DIR/scripts/droid-native-bridge.mjs" tail \
  --id <bridge_id> --follow --mirror
```

Router one-shot:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness droid --mode native --model opencode-go/kimi-k2.6 --prompt "..." --cwd .
```

## Tier B exec (same models)

```bash
droid exec --settings /tmp/settings.json -m custom:OpenCode-Kimi-2.6-0 -o text "<prompt>"
droid exec -m custom:OpenCode-Deepseek-v4-Pro-0 --auto high -o text "<prompt>"
```

## Fallbacks

| Condition | Fallback |
|-----------|----------|
| tmux missing | **No fallback** — bridge exits 127. Use `droid exec -m custom:OpenCode-*` directly (drop `--mode native`). |
| Model not in `~/.factory` zen/go list | abort with `models` subcommand output |
| JSONL not found in 45s | attach manually; check `~/.factory/sessions/` |

## Not in scope

- OpenCode CLI / `opencode serve` bridge
- Non-zen/go custom models (OpenRouter, OpenAI direct, cliproxy Claude)
- Built-in Droid models (`claude-opus-4-8`, `gpt-5.4`, …) unless added to zen/go custom config