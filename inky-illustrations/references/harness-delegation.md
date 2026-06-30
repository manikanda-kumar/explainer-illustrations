# Harness delegation (use-harness)

The **orchestrator** (the agent running this skill) plans shot lists and delegates **every image generation** to a harness worker via the `use-harness` skill. Workers call `image_gen` (Grok/Codex), `agy`, or build SVG/HTML (Claude `code` path) — the orchestrator does not.

## Hard rules

1. **Never** call `image_gen`, `image_edit`, `agy`, `claude`, or `codex` directly from the orchestrator (including `claude -p`).
2. **Always** route through `use-harness` (sibling skill after `npx skills add`, or `<repo>/use-harness` in a clone). Override with `USE_HARNESS_SKILL_DIR` only when needed.
3. Use `--task implement` — **`--task image` is rejected** by the harness router.
4. **One harness invocation per illustration.** Run sequentially unless the user asks for parallel Grok runs.
5. The orchestrator remains the user-facing manager: synthesize worker output, verify files exist, run QA, report paths.

## Setup

Resolve the harness router:

```bash
# Repo clone (from repo root)
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$(./scripts/harness-dir.sh)}"

# npx skills install (from inky-illustrations skill directory)
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$(bash scripts/harness-dir.sh)}"

# Manual override
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-/path/to/use-harness}"
```

Load `use-harness/SKILL.md` before delegating. Preflight:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" doctor --json
node "$SKILL_DIR/scripts/run-harness.mjs" backends --json
```

## Backend → harness map

| Backend ID | Harness `--harness` | Worker does |
|------------|----------------------|-------------|
| `grok-imagine` | `grok` | `image_gen` / `image_edit` + `imagine` skill |
| `gemini-nano-banana` | `agy` | `agy -p` with Gemini image model |
| `codex-imagine` | `codex` | built-in `image_gen` (imagegen skill) |
| `code` | `claude` (or `codex` for SVG only) | SVG/HTML → PNG (no image model) |

Resolve backend per `image-gen-backends.md`, then pick the harness column.

## Router command

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness <grok|agy|claude|codex> \
  --task implement \
  --prompt "<worker assignment>" \
  --cwd "<article-workspace>" \
  [--model "<harness model>"] \
  [--write] \
  [--raw-prompt] \
  --json
```

| Flag | When |
|------|------|
| `--write` | **Required** for `agy`, `claude`, and `codex` when the worker must save PNGs (`--dangerously-skip-permissions` on agy/claude) |
| `--raw-prompt` | Optional for `agy` one-shot when the assignment is already self-contained |
| `--model "Gemini 3.1 Pro (High)"` | **Recommended** for `agy` image generation |
| `--mode native` | Long multi-image batches in one harness session |

## Worker assignment template

Build one assignment per image. Include:

```markdown
## Objective
Generate exactly one 16:9 Inky explainer illustration for an article.

## Output path
Save final PNG to: assets/<article-slug>-illustrations/<NN-topic-name>.png

## Image spec
<paste filled prompt from references/prompt-template.md>

## Backend instructions
<backend-specific section below>

## Deliverable
- Confirm the PNG path
- List any scratch/temp files used
- Note if QA checklist items failed
```

### grok-imagine worker instructions

```markdown
## Backend instructions (grok-imagine)
- Load the `imagine` skill for prompt craft.
- Call `image_gen` with aspect_ratio "16:9" and the full image spec above.
- For edits, use `image_edit` with the source path.
- Copy the result to the output path. Do not combine multiple images in one call.
```

Router invocation:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness grok \
  --task implement \
  --prompt "<worker assignment>" \
  --cwd "<workspace>" \
  --json
```

### gemini-nano-banana worker instructions

```markdown
## Backend instructions (gemini-nano-banana)
- Use agy print mode (Antigravity subscription — no API key):
  agy -p "Generate an image (16:9 wide landscape) and save it as a PNG named <NN-topic-name>.png. <full image spec>" \
      --model "Gemini 3.1 Pro (High)" \
      --dangerously-skip-permissions
- Collect from ~/.gemini/antigravity-cli/scratch/<NN-topic-name>.png
- Copy to the output path.
```

Router invocation:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness agy \
  --task implement \
  --write \
  --model "Gemini 3.1 Pro (High)" \
  --prompt "<worker assignment>" \
  --cwd "<workspace>" \
  --json
```

### code worker instructions (Claude Code — default)

Claude has no image model. The worker writes SVG/HTML and renders to PNG.

```markdown
## Backend instructions (code / claude)
- Build a self-contained HTML file at 1920×1080 with hand-drawn SVG/CSS aesthetic.
- Prefer inline SVG for Inky and props; use HTML text for English labels (exact spelling).
- Render to PNG (Playwright screenshot or headless Chrome).
- Save to the output path.
- Follow references/style-dna.md and references/inky-ip.md.
- Do not call image_gen or any image API — this is a code-only path.
```

Router invocation (native prompting — **never** `claude -p`):

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness claude \
  --task implement \
  --write \
  --prompt "<worker assignment>" \
  --cwd "<workspace>" \
  --json
```

`run-harness.mjs` launches Claude via the tmux native bridge with the prompt as a direct CLI argument.

### codex-imagine worker instructions

Codex has a **native raster** path — not SVG. Same class as Grok `image_gen`.

```markdown
## Backend instructions (codex-imagine)
- Load the Codex `imagegen` skill (system skill under $CODEX_HOME/skills/.system/imagegen).
- Call built-in `image_gen` with aspect_ratio 16:9 and the full image spec above.
- Copy from $CODEX_HOME/generated_images/... to the output path.
- For edits, use built-in `image_gen` edit mode with the source path.
- Do not build SVG/HTML for this backend — that is the separate `code` backend.
```

Router invocation:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex \
  --task implement \
  --write \
  --prompt "<worker assignment>" \
  --cwd "<workspace>" \
  --json
```

### code worker instructions (Codex — SVG only, explicit)

Same worker spec as Claude. Use only when backend is `code` and harness is `codex` (user asked for "codex svg" / "codex code"). **Do not use `image_gen`.**

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex \
  --task implement \
  --write \
  --prompt "<worker assignment — SVG/HTML only, no image_gen>" \
  --cwd "<workspace>" \
  --json
```

## Orchestrator workflow after delegation

1. Parse `--json` envelope: check `ok`, `status`, `paths`.
2. Verify PNG exists at the declared output path (don't trust worker self-report alone).
3. Run `references/qa-checklist.md` on each file.
4. On failure: redelegate with tightened prompt, or switch backend (tell the user).
5. Summarize for the user: backend, harness, count, paths, strongest images.

## Multi-image batches

Default: sequential one-shot invocations (simpler receipts, easier QA).

For 4+ images on the same backend, optional native bridge session:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness grok \
  --mode native \
  --task implement \
  --prompt "Generate illustrations 01 through 04 per the shot list. One image_gen per file." \
  --cwd "<workspace>" \
  --json
```

Stop the bridge when done:

```bash
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" grok status
node "$SKILL_DIR/scripts/harness-native-bridge.mjs" grok stop --id <bridge_id>
```

## Run artifacts

Each delegation writes receipts under `<workspace>/.harness/runs/<run_id>/`. Useful for debugging failed generations:

```text
receipt.json
stdout.log
stderr.log
summary.md
result.json
```

## Diagnostics

| Symptom | Action |
|---------|--------|
| `IMAGE_TASK_REJECTED` | You used `--task image` — use `--task implement` |
| `cli-missing` | Run `doctor --json`; install the harness CLI |
| Worker succeeded but no PNG | Check scratch dir (agy) or worker's stated path |
| Wrong style | Tighten prompt-template variables; redelegate same harness |