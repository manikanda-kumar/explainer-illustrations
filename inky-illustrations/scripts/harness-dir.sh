#!/usr/bin/env bash
# Resolve use-harness from repo clone, npx skills install, or known agent paths.
set -euo pipefail

if [ -n "${USE_HARNESS_SKILL_DIR:-}" ] && [ -d "$USE_HARNESS_SKILL_DIR" ]; then
  printf '%s\n' "$USE_HARNESS_SKILL_DIR"
  exit 0
fi

has_router() {
  [ -f "$1/scripts/run-harness.mjs" ]
}

INKY_SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Full repo clone: explainer-illustrations/use-harness
REPO_ROOT="$(cd "$INKY_SKILL_ROOT/.." && pwd)"
if has_router "$REPO_ROOT/use-harness"; then
  printf '%s\n' "$REPO_ROOT/use-harness"
  exit 0
fi

# npx skills install: sibling under same agent skills directory
SKILLS_PARENT="$(dirname "$INKY_SKILL_ROOT")"
if has_router "$SKILLS_PARENT/use-harness"; then
  printf '%s\n' "$SKILLS_PARENT/use-harness"
  exit 0
fi

# Known global / project agent skill paths
for candidate in \
  "${CODEX_HOME:-$HOME/.codex}/skills/use-harness" \
  "$HOME/.claude/skills/use-harness" \
  "$HOME/.agents/skills/use-harness" \
  "$HOME/.cursor/skills/use-harness" \
  "$HOME/.config/opencode/skills/use-harness" \
  "$HOME/.copilot/skills/use-harness" \
  "$HOME/.factory/skills/use-harness" \
  "$HOME/.gemini/antigravity/skills/use-harness"; do
  if has_router "$candidate"; then
    printf '%s\n' "$candidate"
    exit 0
  fi
done

echo "use-harness not found. Install with: npx skills add manikanda-kumar/explainer-illustrations --skill use-harness -g -y" >&2
echo "Or set USE_HARNESS_SKILL_DIR to your use-harness skill directory." >&2
exit 1