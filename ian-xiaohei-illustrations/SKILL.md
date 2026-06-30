---
name: ian-xiaohei-illustrations
description: Generate Ian-style body illustrations for articles. Use when the user asks for "Inky", "Xiaohei" (legacy alias), "hand-drawn", "weird/whimsical", "body illustration", "article illustration", "illustration advice", "shot list", "explainer illustration", or "remove-title / edit image" tasks for an article, post, blog, Notion doc, workflow doc, methodology, process, structure, state, metaphor, or argument. Default visual IP is Inky — pure-white hand-drawn line art, sparse red/orange/blue English annotations, clean but imaginative. Delegates image generation to Codex, Grok Build, or Agy harness workers via use-harness (never direct image_gen/CLI from the orchestrator).
---

# Explainer Illustrations (Inky)

## Hard rules (always)

1. **English only.** Every response, shot list, and embedded label inside images is English. The source article may be any language; illustrations and your prose are English.
2. **Delegate all image generation via bundled `use-harness`.** Load `<repo>/use-harness/SKILL.md` (shipped in this repository). The orchestrator plans and assigns; harness workers generate. **Never** call `image_gen`, `agy`, or `codex` directly from this agent.
3. **Backend → harness:** `grok-imagine` → `--harness grok`; `gemini-nano-banana` → `--harness agy --write`; `code` → `--harness codex --write`. Use `--task implement` (not `--task image`). See `references/harness-delegation.md`.
4. **One image per harness invocation** (default). Do not stitch multiple illustrations into a single image.

## Core positioning

Design and generate 16:9 landscape body illustrations for articles. The goal is not commercial illustration, PPT infographics, or cute cartoons — it is to turn the article's key judgments, processes, structures, states, or metaphors into a clean, whimsical, creative, readable (but not manual-like) hand-drawn explanation image.

The default visual IP is **Inky**: solid black body, white dot eyes, thin legs, blank expression, earnestly doing one absurd-but-coherent thing. Inky must take part in the core action of the frame, never just stand beside it as decoration.

## Read these references first

Read as the task needs; do not load all at once:

- `references/harness-delegation.md`: use-harness router commands, worker assignments, orchestrator workflow.
- `references/image-gen-backends.md`: backend → harness mapping and preference resolution.
- `references/style-dna.md`: style DNA, color, text, taboos.
- `references/inky-ip.md`: Inky's form, personality, action library, taboos.
- `references/composition-patterns.md`: structure types, original-metaphor method, anti-cliché rules.
- `references/prompt-template.md`: single-image prompt template.
- `references/qa-checklist.md`: post-generation checks and iteration rules.
- `assets/examples/`: low-frequency visual calibration only. Do not copy these examples' composition, props, or annotations.

## Workflow

### 1. Digest the article

Read the user's article, link, Notion page, Markdown file, or screenshot. Extract:

- the core argument
- which paragraphs carry a cognitive turn
- which content is suited to an image
- which spots only need words, no image

Do not illustrate evenly. Prioritize cognitive anchors: core judgment, two breakpoints, input/output loop, branching, before/after, one-source-many-uses, handoff path, common pitfalls, role/state change.

### 2. Lead with an illustration strategy

If the user only asks to analyze where images are needed, give a shot list first. For each image, state (in English):

- which paragraph it follows
- the image topic
- the core meaning
- the structure type
- what Inky is doing
- suggested elements
- suggested English annotation words

Default 4–8 images. Short article: 1–3. Long article: don't casually exceed 9.

### 3. Resolve image backend

Before generating, pick a backend per `references/image-gen-backends.md`:

| User says | Backend |
|-----------|---------|
| "code imagegen", "generate with code", "HTML/SVG" | `code` |
| "grok imagine", "use image_gen", "imagine" | `grok-imagine` |
| "nano banana", "gemini", "agy" | `gemini-nano-banana` |

If unspecified, check `EXPLAINER_IMAGE_BACKEND`, then auto-detect, then fall back.

Tell the user which backend and harness you chose (one line).

### 4. Delegate single-image generation

If the user clearly asks to generate, do not stop to confirm. For each image:

1. Fill `references/prompt-template.md` for that shot.
2. Build a worker assignment per `references/harness-delegation.md`.
3. Run `run-harness.mjs` with the mapped harness (`grok`, `agy`, or `codex`).
4. Verify the PNG exists at the declared path; check `.harness/runs/<run_id>/` on failure.

```bash
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$(./scripts/harness-dir.sh)}"
node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness <grok|agy|codex> \
  --task implement \
  --prompt "<worker assignment>" \
  --cwd "<workspace>" \
  [--model "Gemini 3.1 Pro (High)"] \
  [--write] \
  --json
# --write required for agy and codex when saving PNGs
```

Each worker assignment must include the image spec:

- 16:9 landscape body illustration
- pure white background
- black hand-drawn line art
- sparse red/orange/blue **English** hand-written annotations
- lots of whitespace
- Inky as the core acting subject
- forbid PPT, commercial illustration, childish-cute, complex architecture, top-left category title

Do not reproduce past examples. Each time, reinvent a strange-but-coherent metaphor from the current article.

### 5. Check and iterate

After generating, check `references/qa-checklist.md`. Regenerate or edit if:

- Inky is only decoration
- the frame is too full
- it looks too much like a flowchart/PPT
- too much text or serious misspellings
- a top-left category title appears
- the style is too cute, childish, or stiff
- the background is not clean white

### 6. Save and deliver

Copy final images into:

```text
assets/<article-slug>-illustrations/
```

Name in order:

```text
01-topic-name.png
02-topic-name.png
```

Keep originals; do not overwrite existing assets unless the user explicitly asks.

## Output format

Pre-generation strategy: short and precise. Post-generation delivery (in English):

- which backend and harness were used
- how many images were generated
- what each image is for
- save path
- which images are strongest, which are optional

Don't over-explain style theory; let the images speak.