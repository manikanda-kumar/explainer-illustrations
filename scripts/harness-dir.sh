#!/usr/bin/env bash
# Repo-root resolver: bundled use-harness, or delegate to inky-illustrations/scripts/harness-dir.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -n "${USE_HARNESS_SKILL_DIR:-}" ] && [ -d "$USE_HARNESS_SKILL_DIR" ]; then
  printf '%s\n' "$USE_HARNESS_SKILL_DIR"
  exit 0
fi

if [ -f "$REPO_ROOT/use-harness/scripts/run-harness.mjs" ]; then
  printf '%s\n' "$REPO_ROOT/use-harness"
  exit 0
fi

if [ -x "$REPO_ROOT/inky-illustrations/scripts/harness-dir.sh" ]; then
  exec "$REPO_ROOT/inky-illustrations/scripts/harness-dir.sh"
fi

echo "use-harness not found. Clone explainer-illustrations or run: npx skills add manikanda-kumar/explainer-illustrations --skill use-harness -g -y" >&2
exit 1