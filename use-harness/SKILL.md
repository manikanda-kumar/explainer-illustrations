---
name: use-harness
description: Use when the user explicitly asks to route or delegate work through a named coding-agent harness such as Codex, Claude Code, Droid, Grok, Amp/Ampcode, Agy/Antigravity, Pi, droid-native, opencode-go, or a tmux harness. Do not use for ordinary coding, review, research, or image tasks unless external delegation is requested.
---

# use-harness

`use-harness` is a local router for named coding-agent harnesses. The current agent remains the only user-facing manager; Claude Code, Codex, Droid, Grok, Amp, Agy, and Pi are internal workers.

> **Amp (Ampcode) ≠ Agy (Google Antigravity).** Different binaries (`amp` vs `agy`), products, auth, and capabilities.

## When to use

Use this skill only when the user explicitly asks to use/delegate/route through a named harness, `droid-native`, `opencode-go`, or a tmux harness.

Do not use this skill for ordinary coding, review, research, or image generation unless the user requests external delegation or a harness-specific capability.

## Default command

```bash
# Bundled in explainer-illustrations — from repo root:
#   SKILL_DIR="$(./scripts/harness-dir.sh)"
# Standalone install or override:
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$HOME/.codex/skills/use-harness}"
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness <claude|codex|droid|grok|amp|agy|pi> \
  --task <review|implement|research|spec|parallel> \
  --prompt "<scoped task>" \
  --cwd <repo> \
  --json
```

Add `--raw-prompt` when the backend needs the exact prompt (e.g. amp review focus text) without delegation wrapping.

Use `--dry-run` (or `USE_HARNESS_DRY_RUN=1`) to validate routing, prompt packets, and command construction without invoking a harness CLI. Every run writes artifacts under `.harness/runs/<run-id>/` (input, prompt, route, command, result, summary).

Use direct harness CLIs only when the router cannot express the needed feature, the user explicitly requested that CLI, or you need manual native bridge lifecycle control.

## Router workflow

1. Identify the explicitly requested harness. If the user names multiple harnesses, use all only when they ask for comparison/parallelism; otherwise ask one narrow clarification.
2. Build a structured assignment: objective, scope, context, constraints, expected deliverable, validation.
3. Run `run-harness.mjs --json` by default.
4. Treat backend output as an internal worker report.
5. For edit work, inspect `git diff --stat`, read the diff, and rerun relevant tests. Do not trust the worker's self-report.
6. Return one synthesized user-facing answer.
7. Stop native bridges when the user is done.

## Task routing

| Task | Preferred harness | Notes |
|------|-------------------|-------|
| review | Codex or Amp review | Amp review is structured; Codex is deeper |
| implement | Claude, Codex, Droid, or Grok | Claude is native bridge only |
| research | Agy or grok-research skill | Agy has Gemini/Google grounding |
| spec | Droid | Use Droid spec mode |
| parallel | Grok | Use best-of-n |
| image | Not this skill | Use image-generation skills |

## Critical rules

- Claude: always native bridge; never `claude -p`.
- Amp is not Agy.
- Droid native requires zen/go custom models.
- Native bridge runs leave tmux sessions running; stop them explicitly.
- The router owns final synthesis and verification.
- Workers must not speak directly to the user or write durable memory.

## Native bridge lifecycle

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" <harness> status
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" <harness> stop --id <bridge_id>
```

Amp native follow-ups go through the Amp thread URL while the headless executor is alive.

## Diagnostics

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" backends --json
node "$SKILL_DIR/scripts/run-harness.mjs" doctor --json
node "$SKILL_DIR/scripts/run-harness.mjs" summarize-run --run-dir .harness/runs/<run-id> [--json]
```

Dry-run (no harness required):

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex --task review --prompt "Review src/auth.ts" \
  --dry-run --json
```

## References

- `references/router-contract.md` — JSON envelopes, delegation contract, run receipts
- `references/harnesses.md` — install/auth/capability details
- `references/native-bridges.md` — native bridge recipes and lifecycle
- `references/droid-native-bridge.md` — Droid zen/go setup
- `references/middleman-notes.md` — design practices borrowed from Middleman