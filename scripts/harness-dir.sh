#!/usr/bin/env bash
# Prints the use-harness skill directory (bundled in this repo by default).
set -euo pipefail

if [ -n "${USE_HARNESS_SKILL_DIR:-}" ] && [ -d "$USE_HARNESS_SKILL_DIR" ]; then
  printf '%s\n' "$USE_HARNESS_SKILL_DIR"
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLED="$REPO_ROOT/use-harness"

if [ -f "$BUNDLED/scripts/run-harness.mjs" ]; then
  printf '%s\n' "$BUNDLED"
  exit 0
fi

# Installed as sibling in agent skills dir (e.g. ~/.codex/skills/use-harness)
for candidate in \
  "${CODEX_HOME:-$HOME/.codex}/skills/use-harness" \
  "$HOME/.claude/skills/use-harness" \
  "$HOME/.agents/skills/use-harness"; do
  if [ -f "$candidate/scripts/run-harness.mjs" ]; then
    printf '%s\n' "$candidate"
    exit 0
  fi
done

echo "use-harness not found. Set USE_HARNESS_SKILL_DIR or clone explainer-illustrations." >&2
exit 1