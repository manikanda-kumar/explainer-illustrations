# Composition suggestions

Use this when planning a shot list or choosing how to frame a single image. Pair with `composition-patterns.md` for structure types and metaphor rules.

## Quick routing: is this an Inky image?

| Article content | Prefer | Why |
|-----------------|--------|-----|
| Core judgment, metaphor, creator state | **Inky body illustration** | One cognitive action, memorable weird object |
| Input → process → output, handoffs | **Inky** (Workflow / Map route) | Physical flow reads better than a formal diagram |
| Before/after mindset shift | **Inky** (Before/after / Role state) | Character state carries the turn |
| Methodology tiers, capability stacks | **Inky** (Method layers) | Stacked boxes + Inky building — not a pyramid slide |
| Service topology, microservices map | **HTML architecture diagram** | Boxes-and-arrows density; not this skill |
| Database schema, table relationships | **HTML ERD** | PK/FK/cardinality needs precision |
| Tunable parameters, “find the right value” | **HTML interactive playground** | Sliders beat a static PNG |
| Logs, CSV, metrics tables | **HTML data explorer** | Filterable tables beat one frozen chart |
| Long shareable explainer page | **HTML research report** + optional Inky inserts | Narrative spine in HTML; Inky at anchor paragraphs |
| Native slide deck deliverable | **hands-on-deck / HTML slideshow** | Swap generated PNGs into slides if needed |

When the paragraph is **spatial truth** (exact topology, schema, numbers), route out. When it is **cognitive truth** (judgment, friction, metaphor, state change), stay Inky.

## Cognitive anchor → structure type

Match the paragraph’s *shape*, not its section title.

| Cognitive anchor | Structure type | Composition hint |
|------------------|----------------|------------------|
| Core thesis / “the real point” | Concept metaphor | One large weird machine or object; 1–2 inputs, 1 output; Inky inside the mechanism |
| Two breakpoints / phase change | Workflow or Before/after | Left = before state; middle = lever/break; right = after; orange arrow on main path only |
| Input → output loop | Workflow | Left pile → middle processor (Inky operating) → right outcome; max 3 zones |
| One source, many uses | Concept metaphor | One raw object pressed/split/fanned into 2–3 outputs — not a tree diagram |
| Handoff between roles or tools | Map route or Workflow | Winding path or pipe; 3–4 nodes max; Inky carrying the baton |
| Common pitfall / warning | Role state or Mini-comic | 2 panels: temptation vs consequence; red label on the mistake only |
| Tool sprawl / anxiety | Role state | 2–4 small Inky states (frozen, buried, juggling); no app icons |
| Trust, evidence, reputation | Concept metaphor | Slow physical stacking (bridge planks, ledger, scale) — not a megaphone cliché |
| Sorting / prioritization | Workflow | Inky at a funnel, mailbox, or scale; 2–3 sorted piles |
| Layered methodology | Method layers | 3–4 offset boxes; Inky placing one brick — informal, not corporate pyramid |
| Failure → recovery story | Mini-comic panels | 2–3 panels; one action per panel; same Inky, different state |
| System slice (agents, filters, render) | System slice | 3–5 modules only; Inky performs **one** action on **one** module |

If two anchors map to the same structure type in one article, change the **metaphor object**, not the layout family.

## Complexity budget (per image)

Hard limits that keep images readable and model-stable:

| Element | Limit |
|---------|-------|
| Handwritten English labels | ≤ 5 (≤ 8 only if `code` backend and short words) |
| Words per label | ≤ 3 preferred; never a sentence |
| Main metaphor objects | 1–2 (from object pool in `composition-patterns.md`) |
| Modules / nodes / panels | ≤ 5 total |
| Color roles | Black lines + Inky; orange = main path; red = problem/emphasis; blue = secondary note |
| Subject footprint | ~40–60% of frame; ≥ 35% whitespace |
| Arrows | Main path only; no spaghetti |

When the article needs more detail, **split into two images** or route to HTML — do not cram.

## Shot list fields (use all of these)

Beyond the minimum in `SKILL.md`, add composition fields so each shot is generatable without re-reading the article:

```text
- placement: which paragraph or § heading this follows
- cognitive anchor: why this paragraph earns an image (one phrase)
- structure type: from composition-patterns.md
- core meaning: one sentence the reader should get in 1 second
- composition suggestion: layout zones, object placement, flow direction (L→R or top→bottom)
- Inky action: verb + object (e.g. "presses one ball into three molds")
- suggested elements: 3–4 concrete props (low-tech, physical)
- label budget: 3–5 English words total, listed
- optional caption: one line for CMS/Notion (not burned into image)
- alt text: plain description for accessibility (not burned into image)
- avoid: one anti-pattern for this shot (e.g. "no top-left title", "no fish metaphor")
```

## Composition recipes by structure type

### Workflow

- **Zones:** input (left 25%) → process (center 40%) → output (right 25%); whitespace gutters between.
- **Inky:** inside the process zone, hands on the weird machine.
- **Flow:** one orange arrow for the happy path; no branch tree.
- **Labels:** name the three zones only — not every step.

### System slice

- **Zones:** 3–5 equal-ish blocks in a loose row or arc; not a grid slide.
- **Inky:** touching exactly one block (plugging, filtering, stirring).
- **Labels:** block names only; no API paths or file paths.

### Before / after

- **Zones:** chaos left, order right; optional orange bridge arrow.
- **Inky:** different posture each side (slumped → upright, buried → holding one thing).
- **Labels:** two state words + optional one-word bridge.

### Role state

- **Zones:** 2–4 small vignettes in a row; equal spacing.
- **Inky:** same character, different action per vignette.
- **Labels:** one word per vignette; red on the painful state only.

### Concept metaphor

- **Zones:** one dominant central object (50% height max); tiny inputs/outputs at edges.
- **Inky:** physically inside or fused with the metaphor (stuck in press, walking the well rim).
- **Labels:** name the metaphor object + one outcome word.

### Method layers

- **Zones:** 3–4 stacked or staggered rectangles; hand-drawn wobble, not aligned PPT stack.
- **Inky:** beside the stack, placing or carrying one layer.
- **Labels:** tier names only; no bullet paragraphs.

### Map route

- **Zones:** one curved path with 3–4 nodes; plenty of empty path whitespace.
- **Inky:** walking the path or pulling a string tied to the next node.
- **Labels:** node names short; direction implied by path, not numbered lists.

### Mini-comic panels

- **Zones:** 2–4 equal panels with thin dividers; one action per panel.
- **Inky:** story protagonist; expression stays deadpan, not cute.
- **Labels:** max one per panel; prefer none if action reads clearly.

## Series composition (multi-image articles)

When planning 4–8 images for one article:

1. **Open with thesis** — Concept metaphor or core Workflow (sets the weird tone).
2. **Middle = turns** — breakpoints, pitfalls, handoffs (vary structure types; don’t repeat Workflow three times).
3. **Close with state or outcome** — Before/after, Role state, or Method layers (where the reader should land).
4. **Rhythm:** alternate **dense metaphor** shots with **sparse state** shots so the article doesn’t feel like one repeated layout.
5. **Metaphor diversity:** if image 2 uses a machine, image 4 should not use another machine unless the article demands it — switch to path, layers, or panels.

| Article length | Suggested count | Pacing |
|----------------|-----------------|--------|
| Short post (≤ 1500 words) | 1–3 | One thesis image + optional pitfall or outcome |
| Standard essay | 4–6 | Thesis → process → pitfall → handoff → outcome |
| Long methodology | 6–8 | Above + layers + trust/evidence; never exceed 9 |

## Example shot list entry

```text
Image 03 — Handoff gap
- placement: after § "Why drafts die in Slack"
- cognitive anchor: work evaporates between author and publisher
- structure type: Map route
- core meaning: the handoff is a physical gap, not a calendar problem
- composition suggestion: curved clothesline left-to-right; three clothespins as nodes; gap between pin 2 and 3 is visibly empty; whitespace below the line
- Inky action: stretches on tiptoes trying to peg a note on the empty gap
- suggested elements: clothesline / wooden clothespins / single paper note / empty gap
- label budget: "draft" / "review" / "??? " / "live" (4 labels)
- optional caption: The missing peg is the handoff, not the tool.
- alt text: Hand-drawn clothesline with a gap between clothespins; black creature reaching for the empty spot.
- avoid: no "Handoff Path" top-left title; no copy of examples/05-handoff-path layout
```

## When to suggest shot list only

Suggest **planning without generation** when:

- The user pasted a long article and didn’t ask for images yet.
- More than one structure type could fit — offer 2 composition options in the shot list, pick one default.
- The article mixes architecture and metaphor — flag which paragraphs should **not** be Inky.

Default reply shape: numbered shot list with full fields above, then ask whether to generate all or a subset.