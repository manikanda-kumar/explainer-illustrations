# Native harness bridges

Omnigent-style **Tier A** wraps: run each harness in tmux, inject prompts, mirror output from local session files or Amp export polling.

> **Path note:** Commands in this file use `$SKILL_DIR/scripts/...`. Set `SKILL_DIR` to the absolute path of the `use-harness` skill directory (e.g. `~/.agents/skills/use-harness`) — see SKILL.md "How to invoke".

**Amp and Agy are unrelated harnesses** — different CLIs, different products:

| | **Amp** (Ampcode) | **Agy** (Google Antigravity) |
|---|-------------------|------------------------------|
| Binary | `amp` | `agy` |
| Aliases | `amp`, `ampcode` | `agy` only |
| Bridge root | `~/.grok/amp-native/` | `~/.grok/agy-native/` |
| Mirror | `amp threads export` poll | `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl` |
| Default | mode `smart` | model `Gemini 3.5 Flash (High)` |

**Amp headless:** thread id from `~/.cache/amp/pids/T-*.pid`; continue on the web at `https://ampcode.com/threads/<id>`. Initial prompts via `amp threads continue <id> -x` **before** headless attaches; follow-ups while headless is running go through the web UI (CLI inject conflicts with the active executor).

**Unified bridge CLI:**

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" <harness> <command> [options]
```

**Harnesses:** `codex`, `claude`, `grok`, `amp`, `agy`, `droid` (alias: `ampcode` → amp; `factory` → droid).

**Bridge commands (all harnesses):**

| Command | Purpose |
|---------|---------|
| `launch` | Start tmux session + discover mirror |
| `inject` | tmux send-keys; Amp: `threads continue -x` only when headless stopped, else use `thread_url` |
| `tail` | Stream mirrored events (`--follow` waits for idle) |
| `status` | List bridges or inspect one |
| `attach` | Attach human to tmux |
| `stop` | Kill tmux session |

**Router one-shot** (launch + tail + return assistant text):

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness <codex|claude|grok|amp|agy|droid> --mode native \
  --prompt "..." --cwd /path/to/repo [--model ...] [--write]
```

**Bridge state roots** (override with `*_NATIVE_BRIDGE_ROOT`):

| Harness | Default root | tmux socket |
|---------|--------------|-------------|
| codex | `~/.grok/codex-native/` | `harness-native` |
| claude | `~/.grok/claude-native/` | `harness-native` |
| grok | `~/.grok/grok-native/` | `harness-native` |
| amp | `~/.grok/amp-native/` | `harness-native` |
| agy | `~/.grok/agy-native/` | `harness-native` |
| droid | `~/.grok/droid-native/` | `droid-native` |

---

## Codex

### Help commands

```bash
codex --help
codex -h
codex exec --help
codex resume --help
codex review --help
```

### CLI synopsis (`codex --help`)

```text
Usage: codex [OPTIONS] [PROMPT]
       codex [OPTIONS] <COMMAND> [ARGS]

Commands:
  exec      Run non-interactively [alias: e]
  review    Run a code review non-interactively
  resume    Resume a previous interactive session (--last for most recent)
  fork      Fork a previous session
  apply     Apply latest agent diff as git apply

Key options (interactive + exec):
  -m, --model <MODEL>              Model override
  -c, --config <key=value>         Override ~/.codex/config.toml (TOML values)
  -p, --profile <name>             Layer $CODEX_HOME/<name>.config.toml
  -C, --cd <DIR>                   Working root
  -s, --sandbox <MODE>             read-only | workspace-write | danger-full-access
  -a, --ask-for-approval <POLICY> untrusted | on-request | never
  --search                         Enable web search tool
```

### Models and config

Default model comes from `~/.codex/config.toml` (`model`, `model_reasoning_effort`).

| Flag / config | Example | Notes |
|---------------|---------|-------|
| `-m` | `gpt-5.5`, `gpt-5.3-codex-spark`, `gpt-5.4` | Pass to interactive or `codex exec` |
| `-c model=...` | `-c model="gpt-5.3-codex-spark"` | TOML override |
| `-c model_reasoning_effort=...` | `-c model_reasoning_effort="xhigh"` | Reasoning depth |
| `-p edit` | `codex exec --profile edit` | Edit profile (writes) |

Common model ids (from Codex migrations / skill usage): `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2-codex`, `gpt-5.1-codex-max`. Run `codex doctor` or check `~/.codex/config.toml` for your active default.

**Config:** `~/.codex/config.toml`  
**Mirror:** `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`

### Examples

**Interactive (TUI):**

```bash
codex "review the diff and suggest a commit message"
codex -m gpt-5.3-codex-spark "quick fix for flaky test"
codex -c model_reasoning_effort="xhigh" "design auth migration"
codex resume --last
```

**Headless (`codex exec`):**

> **Stderr note:** codex writes progress noise to stderr. Don't blindly `2>/dev/null` it — that also hides auth/quota/model errors. Either leave stderr attached, or capture it separately and surface on non-zero exit (the router does the latter).

```bash
CODEX_OUT=$(mktemp)
# Leave stderr attached; check exit code and `$?` for failures.
codex exec --skip-git-repo-check -o "$CODEX_OUT" "review unstaged changes"
status=$?; cat "$CODEX_OUT"; rm -f "$CODEX_OUT"; [ $status -eq 0 ] || exit $status

# Edit run (writes files)
codex exec --skip-git-repo-check --profile edit -o "$CODEX_OUT" "fix the failing test"

# Resume last session with a follow-up (prompt via stdin; `-` tells codex exec resume to read it)
echo "follow-up" | codex exec --skip-git-repo-check -o "$CODEX_OUT" resume --last -
```

**Native bridge:**

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" codex launch \
  --cwd /path/to/repo --model gpt-5.3-codex-spark --prompt "review diff"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" codex inject \
  --id <bridge_id> --prompt "now run the tests"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" codex tail \
  --id <bridge_id> --follow --json

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex --mode native --model gpt-5.3-codex-spark --prompt "review diff" --cwd .
```

---

## Claude Code

**Orchestration rule:** never delegate with `claude -p` / `--print`. That uses API billing and can fail when the Claude Code subscription should apply. Always use the **native tmux bridge** below (or `run-harness.mjs --harness claude`, which routes there automatically).

### Help commands

```bash
claude --help
claude -h
claude help
```

### CLI synopsis (`claude --help`)

```text
Usage: claude [options] [command] [prompt]

Claude Code — interactive by default; use -p/--print for non-interactive output.

Key options:
  -p, --print                      Non-interactive; print response to stdout
  -c, --continue                   Continue most recent conversation in cwd
  --model <model>                  Session model (alias or full id)
  --effort <level>                 low | medium | high | xhigh | max
  --dangerously-skip-permissions   Allow writes without prompts (sandbox only)
  --output-format <fmt>            text | json | stream-json (with --print)
  --resume [sessionId]             Resume by id
  --settings <path>                Runtime settings merge
  --add-dir <dirs...>              Extra allowed directories
```

### Models

No `claude models` subcommand — pass `--model` per session.

| Form | Examples |
|------|----------|
| **Aliases** | `opus`, `sonnet`, `fable` |
| **Full ids** | `claude-sonnet-4-6`, `claude-fable-5`, `claude-opus-4-6` |
| **Effort** | `--effort low\|medium\|high\|xhigh\|max` |

Default model comes from Claude Code settings / account unless `--model` is set.

**Mirror:** `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`  
Encoding: `/Users/foo/bar` → `-Users-foo-bar`

### Examples

**Interactive (TUI):**

```bash
claude "add a migration for the users table"
claude --model sonnet --effort high "refactor auth middleware"
claude -c "continue from where we left off"
claude --dangerously-skip-permissions "apply the fix"
```

**Avoid for delegation (`-p` / `--print`):** bills API; may fail vs subscription auth. Do not use from Grok/orchestrator skills.

**Native bridge (required for automation):**

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" claude launch \
  --cwd . --model sonnet --write --prompt "add migration"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" claude inject \
  --id <bridge_id> --prompt "run tests and fix failures"

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness claude --write --model opus --prompt "implement feature" --cwd .
```

---

## Grok Build

### Help commands

```bash
grok --help
grok -h
grok models                    # list available models and exit
grok worktree --help
```

### CLI synopsis (`grok --help`)

```text
Usage: grok [OPTIONS] [PROMPT] [COMMAND]

Commands:
  models     List available models and exit
  worktree   Manage git worktrees

Key options:
  -p, --single <PROMPT>          Single-turn headless (prints stdout, exits)
  -c, --continue                 Continue most recent session for cwd
  -r, --resume [<SESSION_ID>]    Resume by id or most recent
  -m, --model <MODEL>            Model id
  --cwd <CWD>                    Working directory
  --effort <LEVEL>               low | medium | high | xhigh | max
  --best-of-n <N>                Parallel attempts, pick best (headless)
  --check                        Self-verification loop (headless)
  --output-format <FMT>          plain | json | streaming-json
  --permission-mode <MODE>       default | acceptEdits | auto | bypassPermissions | plan
  -w, --worktree [<NAME>]        New git worktree for session
```

### Models (`grok models`)

Run on your machine — list is account/config dependent. Example output:

```text
Default model: grok-composer-2.5-fast

Available models:
  - grok-build
  * grok-composer-2.5-fast (default)
```

Refresh: `grok models`

**Mirror:** `~/.grok/sessions/<url-encoded-cwd>/<sessionId>/chat_history.jsonl`  
Encoding: `encodeURIComponent('/absolute/cwd')` → `%2FUsers%2Fme%2Frepo`

### Examples

**Interactive (TUI):**

```bash
grok "fix the flaky test in pkg/auth"
grok --cwd /path/to/repo -m grok-composer-2.5-fast "review the diff"
grok -c "continue debugging"
grok --worktree=feat-oauth "implement OAuth callback"
```

**Headless (`-p`):**

```bash
grok -p "summarize git diff --stat" --output-format plain

grok -p "fix flaky test" --best-of-n 3 --output-format json

grok -p "implement fix" --check --output-format plain
```

**Native bridge:**

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" grok launch \
  --cwd . --model grok-composer-2.5-fast --prompt "review changes"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" grok inject \
  --id <bridge_id> --prompt "run tests"

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness grok --mode native --model grok-composer-2.5-fast --prompt "..." --cwd .
```

---

## Amp (`amp`, `ampcode`)

### Help commands

```bash
amp --help
amp -h
amp threads --help
amp threads new --help
amp threads continue --help
amp threads export --help
amp threads list --help
amp review --help
amp tools --help
```

### CLI synopsis (`amp --help`)

```text
Usage: amp [options] [command]

Commands:
  threads    new | continue | list | export | search | ...
  review     Code review agent mode
  tools      list | show | use
  last       Continue last thread [alias: l]
  login | logout | usage | update

Global options:
  -m, --mode <mode>        Agent mode: deep | rush | smart
  --effort <value>         Reasoning effort (when mode supports it)
  -x, --execute [message]  Headless: run prompt, print last assistant message, exit
  --stream-json            Claude Code-compatible stream JSON (with --execute)
  --settings-file <path>   Default: ~/.config/amp/settings.json
  --visibility <vis>       private | unlisted | workspace | group
```

### Modes (not model ids)

Amp uses **agent modes** via `-m` / `--mode`. Each mode picks model, system prompt, and tool set.

| Mode | Typical use |
|------|-------------|
| `smart` | Balanced default for most tasks |
| `deep` | Longer reasoning, heavier review/planning |
| `rush` | Faster, lighter passes |

Optional: `--effort <value>` on thread create/continue when the selected mode supports it.

**No `amp models` command** — model is determined by mode + Amp account settings.

**Config:** `~/.config/amp/settings.json`  
**Headless PID files:** `~/.cache/amp/pids/T-<threadId>.pid` (contains local executor PID)  
**Headless logs:** `~/.cache/amp/logs/headless.log` (includes `Thread URL: https://ampcode.com/threads/...`)  
**Mirror:** `amp threads export <threadId>` (polled JSON; no local JSONL)

`--headless` is supported by the binary but not listed in `amp --help` output.

### Examples

**Headless harness + web (preferred for native bridge):**

```bash
cd /path/to/repo
amp --headless              # creates thread, runs local executor
amp --headless -m smart     # mode: deep | rush | smart
# CLI prints: Harness running. Press Ctrl+C to exit.
# Log prints: Thread URL: https://ampcode.com/threads/T-...
# Open that URL in a browser to send messages; local process executes tools.
```

**Interactive (TUI):**

```bash
amp login
TID=$(amp threads new)
amp threads continue "$TID" -m smart
amp threads continue --last -m deep
amp last
```

**One-shot execute (`-x` / `--execute`):**

```bash
amp -x "what markdown files are in this folder?"
amp -m deep -x "review the auth module for security issues"
cat README.md | amp -x "summarize this readme"
amp threads continue T-abc123 -x "follow-up prompt on existing thread"

amp review --json -i "focus on error handling"
amp review -f src/foo.ts -f src/bar.ts --json -i "focus on error handling"
```

**Native bridge (headless in tmux):**

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" amp launch \
  --cwd . --mode smart --prompt "start implementing the feature"
# stdout: launched amp bridge <id> → https://ampcode.com/threads/T-...

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" amp inject \
  --id <bridge_id> --prompt "run the test suite"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" amp tail \
  --id <bridge_id> --follow --json

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness amp --mode native --prompt "review architecture" --cwd .

# Native bridge **plus** a per-harness mode (e.g. amp `deep`): call the bridge directly —
# the router's `--mode native` is mutually exclusive with other mode values.
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" amp launch \
  --cwd . --mode deep --prompt "review architecture"
```

---

## Agy (`agy`) — Google Antigravity CLI

**Not Ampcode.** `agy` is the Antigravity CLI (Homebrew cask `antigravity`). Uses Google/Gemini subscription auth — not `amp login`, not Amp threads.

### Help commands

```bash
agy --help
agy -h
agy help models
agy help plugin
agy help install
agy models
agy plugin list
```

### CLI synopsis (`agy --help`)

```text
Usage of agy:
  --add-dir                       Add a directory to the workspace (repeatable)
  -c, --continue                  Continue the most recent conversation
  --conversation <id>             Resume a previous conversation by ID
  --dangerously-skip-permissions  Auto-approve tool permission requests
  -i, --prompt-interactive        Run an initial prompt interactively, then continue
  --model <label>                 Model for the current session
  -p, --print                     Run one prompt non-interactively and print response
  --prompt                        Alias for --print
  --print-timeout <duration>      Timeout for print mode (default 5m)
  --sandbox                       Run with terminal sandbox restrictions

Subcommands: changelog, help, install, models, plugin, plugins, update
```

**Models:** `agy models` (labels like `Gemini 3.5 Flash (High)`, `Gemini 3.1 Pro (High)`, `Claude Sonnet 4.6 (Thinking)`).

**Config:** `~/.gemini/antigravity-cli/settings.json`  
**Conversations:** `~/.gemini/antigravity-cli/conversations/<uuid>.pb`  
**Per-workspace conversation map:** `~/.gemini/antigravity-cli/cache/last_conversations.json`  
**Mirror (native bridge):** `~/.gemini/antigravity-cli/brain/<uuid>/.system_generated/logs/transcript.jsonl`

### Examples

```bash
# One-shot (subscription billing via Antigravity — not API key)
agy -p "summarize CONTINUITY.md" --model "Gemini 3.5 Flash (High)"

# Interactive with initial prompt
agy -i "review the auth module" --model "Gemini 3.1 Pro (High)"

# Resume
agy -c
agy --conversation 28e21217-f4f0-482f-9dc7-9fd50d6798ea

# Plugins (Gemini/Claude skill import)
agy plugin install nanobanana@marketplace
agy plugin list

# Native bridge (tmux TUI + transcript mirror)
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" agy launch \
  --cwd . --model "Gemini 3.5 Flash (High)" --prompt "start task"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" agy inject \
  --id <bridge_id> --prompt "next step"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" agy models --json

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness agy --mode native --prompt "orchestrate from grok" --cwd .

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness agy -p "quick one-shot" --model "Gemini 3.1 Pro (High)" --cwd .
```

---

## Droid (Factory)

Factory setup and zen/go constraints: `droid-native-bridge.md`.

### Help commands

```bash
droid --help
droid -h
droid exec --help
droid help exec
```

### CLI synopsis (`droid --help`)

```text
Usage: droid [options] [command] [prompt...]

Options:
  --settings <path>       Runtime settings merge (model, autonomy)
  --cwd <path>          Working directory
  -r, --resume [id]     Resume session (default: last modified)
  --fork <sessionId>    Fork and resume
  -w, --worktree [name] Git worktree isolation

Commands:
  exec      Non-interactive (scripts, automation)
  search    Search local sessions
  mcp | plugin | update | daemon
```

Droid `--mode low|medium|high` maps to Droid autonomy for both `droid exec` and Droid native bridge. Explicit `--mode low|medium|high` wins over `--write`; otherwise `--write` uses `auto-high`.

**`droid exec` key flags:**

```text
  -m, --model <id>              Model (default: claude-opus-4-8)
  -o, --output-format <fmt>     text | json
  --auto <level>                low | medium | high (autonomy for writes)
  --skip-permissions-unsafe     YOLO
  --use-spec                    Spec mode
  --mission                     Multi-agent mission mode
  -r, --reasoning-effort <lvl>  Per-model reasoning
  -s, --session-id <id>         Continue session
  --list-tools                  List tools for selected model
```

### Models

**List zen/go models** (native bridge allowlist):

```bash
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" models
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" models --json
```

Example zen/go ids (from `~/.factory/config.json` + resolver):

| opencode-go id | Droid custom id | Display name |
|----------------|-----------------|--------------|
| `opencode-go/kimi-k2.6` | `custom:OpenCode-Kimi-2.6-0` | OpenCode Kimi-2.6 |
| `opencode-go/kimi-k2.7-code` | `custom:OpenCode-Kimi-2.7-Code-0` | OpenCode Kimi-2.7 Code |
| `opencode-go/minimax-m2.5` | `custom:OpenCode-MiniMax-2.5-0` | OpenCode MiniMax-2.5 |
| `opencode-go/glm-5.2` | `custom:OpenCode-GLM-5.2-0` | OpenCode GLM-5.2 |
| `opencode-go/qwen3.7-plus` | `custom:OpenCode-Qwen-3.7-Plus-0` | OpenCode Qwen-3.7 Plus |
| … | … | run `models` for full list |

**Built-in models** (exec tier; probe with invalid `-m`):

```bash
droid exec -m __invalid__ -o text "x" 2>&1 | head -5
```

Includes e.g. `claude-opus-4-8`, `claude-sonnet-4-6`, `gpt-5.5`, `gpt-5.3-codex`, `gemini-3.1-pro-preview`, … plus `custom:*` from `~/.factory/settings.json`.

**Native bridge:** only `opencode-go/*` models with `base_url` `https://opencode.ai/zen/go/v1` in `~/.factory/config.json`.

**Config:** `~/.factory/config.json`, `~/.factory/settings.json`  
**Mirror:** `~/.factory/sessions/<encoded-cwd>/<uuid>.jsonl`

### Examples

**Interactive (TUI):**

```bash
droid "review app.tsx"
droid --settings /tmp/settings.json --cwd . "start mission"
droid -r "continue last session"
```

**Headless (`droid exec`):**

```bash
droid exec -o text "analyze src/auth.ts"
droid exec -m custom:OpenCode-Kimi-2.6-0 -o text "implement fix"
droid exec -m claude-opus-4-8 --reasoning-effort high --auto high -o text "apply patch"
droid exec --use-spec -o text "write spec for auth refactor"
```

**Native bridge:**

```bash
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" models

node "$SKILL_DIR/scripts/droid-native-bridge.mjs" launch \
  --cwd . --model opencode-go/kimi-k2.6 --prompt "start task"

node "$SKILL_DIR/scripts/harness-native-bridge.mjs" droid launch \
  --cwd . --model opencode-go/kimi-k2.6 --prompt "start task"

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness droid --mode native --model opencode-go/kimi-k2.6 --prompt "..." --cwd .
```

---

## Native vs exec

| Tier | Use when | Requires |
|------|----------|----------|
| **native** | Long-lived session, orchestrator inject/tail, human web or `attach` | `tmux` + harness CLI (Amp: `amp --headless` + web) |
| **exec / -p / -x** | CI, single-shot, no tmux | harness CLI only |

When `--mode native` is not set, `run-harness.mjs` uses exec/headless recipes from `SKILL.md`.