#!/usr/bin/env bash
# MetaFlywheel one-click installer (macOS / Linux / Git Bash)
# Usage: bash install/install.sh [profile]   (default profile: web)
set -euo pipefail

PROFILE="${1:-web}"
REPO="github:NBagent-dev/metaflywheel"

command -v npx >/dev/null 2>&1 || {
    echo "Error: npx not found. Please install Node.js (>=20) first." >&2
    exit 1
}

echo "==> Installing MetaFlywheel (MPM cognitive flywheel) -> profile '$PROFILE'"
echo "==> Source: $REPO (official bundle contract, zero core changes)"
npx --yes -p @deepseek-ai/dsh dsh plugin --profile "$PROFILE" add "$REPO"

echo ""
echo "==> Verifying registration (expect an 'mpm-flywheel' line):"
npx --yes -p @deepseek-ai/dsh dsh --profile "$PROFILE" --dump-config 2>&1 |
    grep -E 'mpm-flywheel|metaflywheel' || true

echo ""
echo "==> Done. Restart DSH to bring the flywheel online (composition row mpm-flywheel loads with the profile)."
echo "    Verify at runtime: call mpm_flywheel_state in a session to see the ledger snapshot."
