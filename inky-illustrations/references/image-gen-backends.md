# Image generation backends

Three backends, each executed by a **harness worker** via `use-harness` — not by the orchestrator directly. See `references/harness-delegation.md` for router commands and worker assignments.

## Quick reference

| Backend ID | Aliases users may say | Harness worker | Worker's tool |
|------------|----------------------|----------------|---------------|
| `grok-imagine` | grok imagine, image_gen, imagine | `grok` | `image_gen` / `image_edit` |
| `gemini-nano-banana` | nano banana, gemini, agy, antigravity | `agy` | `agy -p` + Gemini image model |
| `codex-imagine` | codex imagegen, codex imagine, gpt image | `codex` | built-in `image_gen` (imagegen skill) |
| `code` | code imagegen, HTML, SVG, programmatic, claude code | `claude` (or `codex` for SVG only) | SVG/HTML → PNG (no image model) |

## Preference resolution (in order)

1. **Explicit user request** — see aliases in the table above. **Do not conflate** `codex imagine` (raster `image_gen`) with `code imagegen` / `SVG` (programmatic).
2. **`EXPLAINER_IMAGE_BACKEND`** env var: `grok-imagine` | `gemini-nano-banana` | `codex-imagine` | `code`.
3. **Auto-detect** harness availability (`run-harness.mjs doctor --json`):
   - `grok` available → `grok-imagine`
   - `agy` available → `gemini-nano-banana`
   - `codex` available → `codex-imagine`
   - `claude` available → `code`
4. **Default**: `grok-imagine` → `gemini-nano-banana` → `codex-imagine` → `code`.

For the `code` backend only, resolve the **harness worker** separately (see below). Codex on `codex-imagine` always uses native `image_gen`, not SVG.

Announce the chosen backend and harness in one line before delegating.

---

## Backend: `grok-imagine`

**Harness:** `grok` (Grok Build)

The Grok worker loads the `imagine` skill and calls:

```
image_gen({ prompt: "<from prompt-template.md>", aspect_ratio: "16:9" })
image_edit({ prompt: "<edit instructions>", image: "<path>", aspect_ratio: "16:9" })
```

Delegate via:

```bash
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$(./scripts/harness-dir.sh)}"
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness grok --task implement \
  --prompt "<worker assignment>" --cwd "<workspace>" --json
```

Guidelines for the worker prompt:

- One `image_gen` per illustration.
- Keep English labels to 1–3 words each.
- Prefer `image_edit` for title removal or small fixes.

---

## Backend: `gemini-nano-banana`

**Harness:** `agy` (Google Antigravity CLI)

The Agy worker runs agy print mode — subscription auth, no API key:

```bash
agy -p "Generate an image (16:9 wide landscape) and save it as a PNG named <NN-name>.png. <full prompt>" \
    --model "Gemini 3.1 Pro (High)" \
    --dangerously-skip-permissions
```

| Use case | `--model` |
|----------|-----------|
| Default / text-heavy / complex composition | `Gemini 3.1 Pro (High)` |
| Faster, simpler images | `Gemini 3.5 Flash (High)` |

Delegate via:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness agy --task implement --write \
  --model "Gemini 3.1 Pro (High)" \
  --prompt "<worker assignment>" --cwd "<workspace>" --json
```

**Scratch collection:**

```text
~/.gemini/antigravity-cli/scratch/<NN-name>.png
```

```bash
SCRATCH="$HOME/.gemini/antigravity-cli/scratch"
src="$(find "$SCRATCH" -type f -name '<NN-name>.png' -print | head -1)"
cp "$src" "assets/<article-slug>-illustrations/<NN-name>.png"
```

---

## Backend: `codex-imagine`

**Harness:** `codex`

Codex ships a built-in **`image_gen`** tool (GPT Image 2) via the system `imagegen` skill — same class of backend as `grok-imagine`, not the programmatic `code` path.

The Codex worker:

1. Loads the `imagegen` skill (or follows its rules).
2. Calls built-in `image_gen` with the filled `prompt-template.md` spec (16:9 landscape).
3. Copies from `$CODEX_HOME/generated_images/...` to the output path.
4. Uses `image_gen` edit mode for title removal or small fixes.

Delegate via:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex --task implement --write \
  --prompt "<worker assignment>" --cwd "<workspace>" --json
```

Worker guidelines:

- One `image_gen` call per illustration.
- Prefer built-in `image_gen` — do not fall back to CLI/API unless the user asks.
- English labels: keep short (1–3 words); raster models may garble long text — switch to `code` backend if labels must be exact.

---

## Backend: `code`

**Harness:** `claude` (default) — programmatic SVG/HTML only

Neither Claude nor the `code` backend uses an image model. The worker builds illustrations as **SVG/HTML with exact English labels**, then renders to PNG.

Use when:

- The user asks for "code imagegen", "SVG", or "claude code"
- Many exact English labels are required
- Raster backends (`grok-imagine`, `codex-imagine`, `gemini-nano-banana`) garble text

### Code harness resolution (in order)

1. **Explicit user request** — "claude code", "via claude" → `claude`; "codex svg", "codex code" → `codex` (SVG path only, not `image_gen`).
2. **`EXPLAINER_CODE_HARNESS`** env var: `claude` | `codex`.
3. **Auto-detect** (`doctor --json`): `claude` available → `claude`; else `codex` for SVG fallback.
4. **Default**: `claude`.

**Claude routing rule:** always native prompting via `run-harness.mjs` (tmux bridge). **Never** `claude -p` / `--print`.

**Codex on `code`:** only when the user wants programmatic output via Codex — same SVG/HTML workflow as Claude, **not** `image_gen`. For raster generation via Codex, use `codex-imagine` instead.

### Worker approach

1. Self-contained HTML at 1920×1080 with hand-drawn SVG/CSS aesthetic.
2. English labels as real HTML/SVG text — not baked into raster art.
3. Render to PNG (Playwright screenshot or headless Chrome).
4. Save to `assets/<article-slug>-illustrations/`.

### Delegate via Claude Code (default)

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness claude --task implement --write \
  --prompt "<worker assignment>" --cwd "<workspace>" --json
```

### Delegate via Codex (SVG only — explicit)

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex --task implement --write \
  --prompt "<worker assignment — SVG/HTML, do not use image_gen>" \
  --cwd "<workspace>" --json
```

---

## Cross-backend rules

- **Orchestrator never generates images directly** — always delegate through `use-harness`.
- **`--task implement`** only — never `--task image` (rejected by router).
- **One image per harness invocation** (default).
- **Same prompt template** (`references/prompt-template.md`) in every worker assignment.
- **Do not mix backends** in one batch unless one fails and you tell the user.
- **Provenance**: report backend + harness in the delivery summary.