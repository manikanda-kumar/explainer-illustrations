# Prompt examples

Copy these prompts into your agent session. Image generation is delegated to Codex, Grok Build, or Agy harness workers — not called directly.

## Shot list only (no generation)

```text
Use $ian-xiaohei-illustrations — do not generate images yet.
Analyze where this article deserves illustrations and output a shot list of ~5 images.
For each image specify:
- which paragraph it follows
- image topic
- core meaning
- structure type
- what Inky is doing
- suggested elements
- suggested English label words

<paste article>
```

## Full article illustrations (Grok Imagine via harness)

```text
Use $ian-xiaohei-illustrations to generate 4 whimsical Inky body illustrations for this article.
Requirements: 16:9 landscape, pure white background, black hand-drawn line art,
sparse red/orange/blue English hand-written annotations.
Delegate to Grok Build harness via use-harness. Use grok imagine.

<paste article>
```

## Full article illustrations (Gemini via Agy harness)

```text
Use $ian-xiaohei-illustrations to generate 4 whimsical Inky body illustrations for this article.
English labels only. Delegate to Agy harness via use-harness with --write. Use gemini nano banana.

<paste article>
```

## Code imagegen (Codex harness)

```text
Use $ian-xiaohei-illustrations to generate 3 illustrations for this article.
Delegate to Codex harness via use-harness with --write.
Build HTML/SVG, render to PNG. Labels must be exact English.

<paste article>
```

## Long-article strategy

```text
Use $ian-xiaohei-illustrations to plan illustrations for this long article.
Don't illustrate evenly — pick cognitive anchors only: core judgment, input/output loop,
before/after, common pitfalls, handoff path.
Output 6-8 shot list items. Do not generate images yet.

<paste article>
```

## Single concept, one image

```text
Use $ian-xiaohei-illustrations to generate one 16:9 body illustration for:

Trust isn't shouted — it's laid down one piece of evidence at a time.

Whimsical but clean. Inky must carry the core action.
At most 5 English labels. Delegate to Grok harness via use-harness.
```

## Workflow theme

```text
Use $ian-xiaohei-illustrations to illustrate:
"Turn one raw asset into traffic, trust, and conversion content."
No formal flowchart. Don't copy the one-fish-many-uses old case.
Invent a new low-tech metaphor. Delegate to Agy harness via use-harness with --write.
```

## Edit: remove title

```text
Use $ian-xiaohei-illustrations to edit this image.
Remove the "Workflow / Flowchart" title and underline in the top-left corner.
Keep everything else unchanged. Delegate to Grok harness (image_edit).
```

## Edit: strengthen Inky

```text
Use $ian-xiaohei-illustrations — this image is close but Inky feels decorative.
Regenerate with the same core meaning: Inky should drive the structure.
Delegate to Agy harness via use-harness with --write.
```

## Set backend via environment

```bash
export EXPLAINER_IMAGE_BACKEND=code
SKILL_DIR="$(./scripts/harness-dir.sh)"
```

```text
Use $ian-xiaohei-illustrations to generate 3 illustrations for this article.
Backend is code — delegate to Codex harness with --write.
```

## Manual harness invocation (orchestrator pattern)

```bash
SKILL_DIR="${USE_HARNESS_SKILL_DIR:-$(./scripts/harness-dir.sh)}"

node "$SKILL_DIR/scripts/run-harness.mjs" \
  --harness grok --task implement \
  --prompt "Generate one 16:9 Inky illustration. Save to assets/my-article-illustrations/01-trust-bridge.png. <full spec>" \
  --cwd /path/to/article-workspace \
  --json
```