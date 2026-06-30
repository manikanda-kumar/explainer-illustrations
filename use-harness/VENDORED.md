# Vendored use-harness

This copy of `use-harness` is bundled inside [explainer-illustrations](https://github.com/manikanda-kumar/explainer-illustrations) so image generation works without an external skill install.

Upstream: `tools/skills/use-harness` (Middleman-style harness router for Codex, Grok, Agy, etc.)

Resolve path:

```bash
SKILL_DIR="$(./scripts/harness-dir.sh)"   # from repo root
# or
export USE_HARNESS_SKILL_DIR="/path/to/explainer-illustrations/use-harness"
```

Update from upstream when the router contract changes:

```bash
rsync -a --exclude='docs' --exclude='CONTINUITY.md' \
  /path/to/upstream/use-harness/ ./use-harness/
```