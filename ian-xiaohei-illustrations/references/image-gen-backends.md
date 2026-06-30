# Image generation backends

Three backends, each executed by a **harness worker** via `use-harness` — not by the orchestrator directly. See `references/harness-delegation.md` for router commands and worker assignments.

## Quick reference

| Backend ID | Aliases users may say | Harness worker | Worker's tool |
|------------|----------------------|----------------|---------------|
| `grok-imagine` | grok imagine, image_gen, imagine | `grok` | `image_gen` / `image_edit` |
| `gemini-nano-banana` | nano banana, gemini, agy, antigravity | `agy` | `agy -p` + Gemini image model |
| `code` | code imagegen, HTML, SVG, programmatic | `codex` | HTML/CSS/SVG → PNG |

## Preference resolution (in order)

1. **Explicit user request** ("use grok imagine", "nano banana", "code imagegen", "via codex").
2. **`EXPLAINER_IMAGE_BACKEND`** env var: `grok-imagine` | `gemini-nano-banana` | `code`.
3. **Auto-detect** harness availability (`run-harness.mjs doctor --json`):
   - `grok` available → `grok-imagine`
   - `agy` available → `gemini-nano-banana`
   - `codex` available → `code`
4. **Default**: `grok-imagine` → `gemini-nano-banana` → `code`.

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

## Backend: `code`

**Harness:** `codex`

The Codex worker builds programmatic illustrations when:

- The user asks for "code imagegen"
- Many exact English labels are required
- Image model output has unfixable label garbling

Approach (worker-side):

1. Self-contained HTML at 1920×1080 with hand-drawn SVG/CSS aesthetic.
2. English labels as real HTML text.
3. Render to PNG (Playwright or headless Chrome).
4. Save to `assets/<article-slug>-illustrations/`.

Delegate via:

```bash
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness codex --task implement --write \
  --prompt "<worker assignment>" --cwd "<workspace>" --json
```

---

## Cross-backend rules

- **Orchestrator never generates images directly** — always delegate through `use-harness`.
- **`--task implement`** only — never `--task image` (rejected by router).
- **One image per harness invocation** (default).
- **Same prompt template** (`references/prompt-template.md`) in every worker assignment.
- **Do not mix backends** in one batch unless one fails and you tell the user.
- **Provenance**: report backend + harness in the delivery summary.