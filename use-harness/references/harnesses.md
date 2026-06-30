# Harness registry

Reference for `use-harness` routing. AI SDK docs: https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/overview

> **Path note:** Commands in this file use `$SKILL_DIR/scripts/...`. Set `SKILL_DIR` to the absolute path of the `use-harness` skill directory (e.g. `~/.agents/skills/use-harness`) — see SKILL.md "How to invoke".

## Capability matrix

| Harness | CLI | Native bridge (tmux) | AI SDK adapter | Sandbox | Custom tools | Custom skills | Best for |
|---------|-----|----------------------|----------------|---------|--------------|---------------|----------|
| Claude Code | `claude` | **yes** (required — never `claude -p`; `harness-native-bridge.mjs`, `~/.claude/projects`) | `@ai-sdk/harness-claude-code` | Vercel (bridge) | yes | yes | Skills, subagents, long sessions |
| Codex | `codex` | **yes** (`harness-native-bridge.mjs`, `~/.codex/sessions`) | `@ai-sdk/harness-codex` | Vercel (bridge) | yes | yes | Review, GPT-5.x, Spark |
| Pi | `pi` | — | `@ai-sdk/harness-pi` | just-bash or host | yes | yes | Minimal, extensions |
| Amp | `amp` | **yes** (`harness-native-bridge.mjs amp`, export poll; alias ampcode) | `@ai-sdk/harness-amp` (soon) | TBD | via plugins | yes | Review mode, threads |
| Agy | `agy` | **yes** (`harness-native-bridge.mjs agy`, transcript.jsonl mirror) | — | TBD | `agy plugin` | yes | Google Antigravity CLI; Gemini/Claude via subscription; not Ampcode |
| Droid | `droid` / `droid exec` | **yes** (`droid-native-bridge.mjs`, zen/go models) | — | native | yes | plugins | Spec mode, worktrees, zen/go via custom:OpenCode-* |
| Grok Build | `grok` | **yes** (`harness-native-bridge.mjs`, `~/.grok/sessions`) | — | native | yes | yes | best-of-n, worktrees |

## AI SDK install (canary)

```bash
pnpm add @ai-sdk/harness@canary @ai-sdk/harness-claude-code@canary @ai-sdk/sandbox-vercel@canary
# Codex:
pnpm add @ai-sdk/harness-codex@canary
# Pi (lighter sandbox):
pnpm add @ai-sdk/harness-pi@canary @ai-sdk/sandbox-just-bash@canary
```

## Adapter factories

```typescript
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { codex, createCodex } from '@ai-sdk/harness-codex';
import { pi } from '@ai-sdk/harness-pi';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

// Codex with options
const harness = createCodex({
  model: 'gpt-5.5',
  reasoningEffort: 'high',
  webSearch: true,
});

const agent = new HarnessAgent({
  harness: codex, // or claudeCode, pi
  sandbox: createVercelSandbox({ runtime: 'node24', ports: [4000] }),
  instructions: '...',
  skills: [],
  tools: {},
});
```

## Default models

When `--model` / `--mode` are omitted, `run-harness.mjs` and native bridge `launch` apply:

| Harness | Default |
|---------|---------|
| Claude | `sonnet` |
| Codex | `gpt-5.3-codex` |
| Grok | `grok-composer-2.5-fast` |
| Amp | mode `smart` (`review` task → `deep`) |
| Agy | `Gemini 3.5 Flash (High)` (`review`/`research` → `Gemini 3.1 Pro (High)`) |
| Droid | `opencode-go/kimi-k2.6` |

Source: `scripts/harness-defaults.mjs`. Override per harness via `*_NATIVE_DEFAULT_MODEL` or `AMP_NATIVE_DEFAULT_MODE` env vars.

## Environment variables

| Harness | Variables |
|---------|-----------|
| Claude Code | `ANTHROPIC_API_KEY` |
| Codex | `OPENAI_API_KEY`, `CODEX_API_KEY`, or `AI_GATEWAY_API_KEY` |
| Vercel Sandbox | `VERCEL_OIDC_TOKEN` |
| Amp | Amp login (`amp login`) |
| Agy | Antigravity login (via `agy` / IDE; config `~/.gemini/antigravity-cli/`) |
| Grok | `XAI_API_KEY` or OpenRouter via grok-cli config |
| Droid | `FACTORY_API_KEY` or Factory login; models in `~/.factory/config.json` + `~/.factory/settings.json` |
| Native bridges | `tmux` + harness CLI; roots under `~/.grok/{codex,claude,grok,amp,agy,droid}-native/`; spec: `native-bridges.md` |
| Droid-native | `OPENCODE_API_KEY` (zen/go); setup: `droid-native-bridge.md` |

## Task → harness quick pick

- **Second opinion on diff** → Codex or **Amp** `amp review` (not agy)
- **Gemini / Antigravity subscription work** → **Agy** `agy -p` or `--harness agy --mode native`
- **Gemini image generation via local CLI** → **Agy** + plugins (not Amp)
- **Implement with skills/hooks** → Claude Code (tmux native bridge only — not `claude -p`)
- **Fast patch** → Codex Spark
- **Formal spec before code** → Droid `--use-spec`
- **Try 3 approaches, pick best** → Grok `--best-of-n`
- **Image / media** → not a harness; use image-gen skills
- **Web research brief** → `grok-research` skill

## Native bridges (Tier A)

Unified tmux + inject + mirror for **codex, claude, grok, amp, agy, droid**. Per-harness CLI `--help`, models/modes, and examples: **`native-bridges.md`**. Droid zen/go setup: `droid-native-bridge.md`.

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" codex launch --cwd . --prompt "..."
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" claude launch --cwd . --write --prompt "..."
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" grok launch --cwd . --prompt "..."
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" amp launch --cwd . --mode smart --prompt "..."
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" agy launch --cwd . --model "Gemini 3.5 Flash (High)" --prompt "..."
node "$SKILL_DIR/scripts/droid-native-bridge.mjs" launch --model opencode-go/kimi-k2.6 --prompt "..."

node "$SKILL_DIR/scripts/run-harness.mjs" --harness codex --mode native --prompt "..."
```

| Harness | Mirror source |
|---------|---------------|
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` |
| Claude | `~/.claude/projects/<encoded-cwd>/*.jsonl` |
| Grok | `~/.grok/sessions/<encoded-cwd>/<id>/chat_history.jsonl` |
| Amp | `amp threads export <threadId>` (polled) |
| Agy | `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl` |
| Droid | `~/.factory/sessions/<encoded-cwd>/*.jsonl` (zen/go only) |

## Experimental note

AI SDK harness packages are **experimental** (AI SDK 7 canary). Expect breaking changes. Prefer CLI delegation for day-to-day Grok sessions unless you are building on `HarnessAgent` APIs.