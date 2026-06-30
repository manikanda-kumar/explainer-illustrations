# Harness delegation (use-harness)

The **orchestrator** (the agent running this skill) plans shot lists and delegates **every image generation** to a harness worker via the `use-harness` skill. Workers call `image_gen`, `agy`, or Codex — the orchestrator does not.

## Hard rules

1. **Never** call `image_gen`, `image_edit`, `agy`, or `codex` directly from the orchestrator.
2. **Always** route through the **bundled** `use-harness` skill in this repo (`<repo>/use-harness`). Override with `USE_HARNESS_SKILL_DIR` only when needed.
3. Use `--task implement` — **`--task image` is rejected** by the harness router.
4. **One harness invocation per illustration.** Run sequentially unless the user asks for parallel Grok runs.
5. The orchestrator remains the user-facing manager: synthesize worker output, verify files exist, run QA, report paths.

## Setup

Resolve the bundled harness router (from repo root):

```bash
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$(./scripts/harness-dir.sh)}"
# or, if cwd is not the repo root:
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-/path/to/explainer-illustrations/use-harness}"
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
| `code` | `codex` | HTML/CSS/SVG → PNG render |

Resolve backend per `image-gen-backends.md`, then pick the harness column.

## Router command

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness <grok|agy|codex> \
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
| `--write` | **Required** for `agy` and `codex` when the worker must save PNGs (passes `--dangerously-skip-permissions` to agy) |
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

### code worker instructions

```markdown
## Backend instructions (code)
- Build a self-contained HTML file at 1920×1080 with hand-drawn SVG/CSS aesthetic.
- English labels must be exact HTML text.
- Render to PNG (Playwright screenshot or headless Chrome).
- Save to the output path.
- Follow references/style-dna.md and references/inky-ip.md.
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