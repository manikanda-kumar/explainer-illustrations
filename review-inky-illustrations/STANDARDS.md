# Inky Illustration Standards Reference

The precise values, budgets, and rules behind the review. Cite these in findings instead of approximating. Distilled from `inky-illustrations` references: `style-dna.md`, `inky-ip.md`, `qa-checklist.md`, `composition-suggestions.md`, `composition-patterns.md`.

## Should this be an Inky image? (routing table)

| Article content | Prefer | Why |
| --- | --- | --- |
| Core judgment, metaphor, creator state | **Inky body illustration** | One cognitive action, memorable weird object |
| Input → process → output, handoffs | **Inky** (Workflow / Map route) | Physical flow reads better than formal diagram |
| Before/after mindset shift | **Inky** (Before/after / Role state) | Character state carries the turn |
| Methodology tiers, capability stacks | **Inky** (Method layers) | Stacked boxes + Inky building — not pyramid slide |
| Service topology, microservices map | **HTML architecture diagram** | Boxes-and-arrows density; not this skill |
| Database schema, table relationships | **HTML ERD** | PK/FK/cardinality needs precision |
| Tunable parameters, "find the right value" | **HTML interactive playground** | Sliders beat a static PNG |
| Logs, CSV, metrics tables | **HTML data explorer** | Filterable tables beat frozen chart |
| Long shareable explainer page | **HTML research report** + optional Inky inserts | Narrative spine in HTML; Inky at anchor paragraphs |
| Native slide deck deliverable | **hands-on-deck / HTML slideshow** | Swap generated PNGs into slides if needed |

**Rule:** Spatial truth (exact topology, schema, numbers) routes out. Cognitive truth (judgment, friction, metaphor, state change) stays Inky.

## Cognitive anchor → structure type

Match the paragraph's *shape*, not its section title.

| Cognitive anchor | Structure type | Composition hint |
| --- | --- | --- |
| Core thesis / "the real point" | Concept metaphor | One large weird machine; 1–2 inputs, 1 output; Inky inside mechanism |
| Two breakpoints / phase change | Workflow or Before/after | Left = before; middle = lever; right = after; orange on main path only |
| Input → output loop | Workflow | Left pile → middle processor (Inky operating) → right outcome; max 3 zones |
| One source, many uses | Concept metaphor | One raw object pressed/split into 2–3 outputs — not a tree diagram |
| Handoff between roles or tools | Map route or Workflow | Winding path or pipe; 3–4 nodes max; Inky carrying baton |
| Common pitfall / warning | Role state or Mini-comic | 2 panels: temptation vs consequence; red on mistake only |
| Tool sprawl / anxiety | Role state | 2–4 small Inky states; no app icons |
| Trust, evidence, reputation | Concept metaphor | Slow physical stacking (bridge planks, ledger, scale) — not megaphone cliché |
| Sorting / prioritization | Workflow | Inky at funnel, mailbox, or scale; 2–3 sorted piles |
| Layered methodology | Method layers | 3–4 offset boxes; Inky placing one brick |
| Failure → recovery story | Mini-comic panels | 2–3 panels; one action per panel |
| System slice (agents, filters, render) | System slice | 3–5 modules only; Inky performs **one** action on **one** module |

If two anchors map to the same structure type in one article, change the **metaphor object**, not the layout family.

## Complexity budget (per image)

| Element | Limit |
| --- | --- |
| Handwritten English labels | ≤ 5 (≤ 8 only if `code` backend and short words) |
| Words per label | ≤ 3 preferred; never a sentence |
| Main metaphor objects | 1–2 |
| Modules / nodes / panels | ≤ 5 total |
| Arrows | Main path only; no spaghetti |
| Subject footprint | ~40–60% of frame |
| Whitespace | ≥ 35% blank; ideally one quiet zone |
| Images per article | Default 4–8; short 1–3; long ≤ 9 |

When the article needs more detail, **split into two images** or route to HTML — do not cram.

## Inky IP

**Appearance:** Solid black creature; white dot eyes; thin legs/arms; slightly irregular hand-drawn outline; blank deadpan expression. Body may be cylinder, bean, box, funnel, shadow, hole, or machine interior.

**Personality:** Very serious task, slightly absurd execution. Dry humor — not cute. Low-key system operator.

**Acting-subject test:** If removing Inky leaves the core metaphor fully intact, Inky is too decorative — rewrite so Inky performs the core action.

**Forbidden:** Cute mascot, emoji face, shiny eyes, children's cartoon, complex outfits, corner-watcher pose, overpowering the structure, commercial polished roundness.

**Common duties (verb + object):** hauling raw material, pulling lines, stuck at breakpoint, operating judgment lever, becoming sorting funnel, stamping handoff copy, leading handoff path, holding warning sign, bricklaying, bridging, opening doors, sorting.

## Style DNA

**Required:**
- 16:9 landscape body illustration
- Pure white background — no beige, warm gray, paper texture, gradients, shadows, noise
- Black hand-drawn line art — thin, slight wobble; not mechanical or vector-clean
- Sparse English hand-written annotations
- One core action, structure, state, or metaphor per image
- Structure expressed naturally — do not write structure-type names on the image

**Colors:**
- **Black** — line art, Inky, frames, structure, primary text, main objects
- **Red** — emphasis, problems, emotional beats, key reminders, results
- **Orange** — main flow, paths, arrows, automation direction, A→B movement
- **Blue** — secondary notes, mental/system state, second-layer explanation (optional; use sparingly)

**Never:** Commercial illustration, PPT infographics, formal flowcharts, course slides, cute cartoon posters, children's illustration, complex architecture diagrams, polished flat illustration, techy UI chrome, real app screenshots, top-left category titles.

## Series pacing

- Vary structure types across a 4–8 image set.
- Repeating the same layout family is OK only if the **metaphor object** and **Inky action** change materially.
- Do not illustrate evenly — prioritize cognitive anchors only.
- Caption and alt text live in publishing metadata; not burned into PNG.

## Shot list required fields

Each planned shot should include:

```text
placement, cognitive anchor, image topic, core meaning, structure type,
composition suggestion, Inky action, suggested elements, label budget (≤ 5 words listed),
optional caption, alt text, avoid (one anti-pattern)
```

Missing `cognitive anchor`, `Inky action`, or `avoid` is a planning finding.

## Failure signals (instant review flags)

- Top-left title ("Common Pitfalls", "Workflow", "System Architecture", "Roadmap")
- Inky as mascot/emoji/cute cartoon
- PPT, course slide, or formal flowchart look
- Too many elements, arrows, or nodes
- Long explanatory paragraphs as labels
- Background: paper texture, shadows, gradients, beige, noise
- Real UI screenshots or techy interfaces
- Serious misspellings or unreadable labels
- Too stiff — no absurd metaphor
- Composition too similar to `assets/examples/` old cases
- Non-English text inside image

## Iteration recipes

| Symptom | Fix |
| --- | --- |
| Too plain | Make Inky the acting subject; add one weird-but-coherent metaphor |
| Too complex | Delete nodes; one action + 3–5 short labels |
| Too cute | Deadpan blank expression; not mascot |
| Too PPT | Remove title, frames, grid, excess arrows; hand-drawn scene |
| Too similar to old case | Keep meaning; change main object and Inky action |
| Bad text | Local edit first; else regenerate with fewer labels or `code` backend |
| Wrong anchor | Skip image or route to HTML diagram skill |
| Two meanings in one frame | Split into two images |

## Delivery bar

A strong image makes the reader think "that's a bit weird" and then understand the structure within one second.

If the first impression is a tutorial page rather than a whimsical product sketch on white paper, it fails.

## Backend note (for prompt review only)

Orchestrator must delegate via `use-harness` — never direct `image_gen` from the planning agent. `code` backend is preferred when label precision matters. One image per harness invocation by default.