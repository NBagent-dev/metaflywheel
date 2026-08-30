#!/usr/bin/env bash
# MetaFlywheel one-click installer (macOS / Linux / Git Bash)
# Usage: bash install/install.sh [profile]   (default profile: web)
set -euo pipefail

PROFILE="${1:-web}"
REPO="github:NBagent-dev/metaflywheel"

command -v npx >/dev/null 2>&1 || {
    echo "错误: 找不到 npx。请先安装 Node.js (>=20)。" >&2
    exit 1
}

echo "==> 安装 MetaFlywheel (MPM cognitive flywheel) -> profile '$PROFILE'"
echo "==> 源: $REPO (官方 bundle 契约，零核心改动)"
npx --yes -p @deepseek-ai/dsh dsh plugin --profile "$PROFILE" add "$REPO"

echo ""
echo "==> 验证注册（应看到 mpm-flywheel 行）:"
npx --yes -p @deepseek-ai/dsh dsh --profile "$PROFILE" --dump-config 2>&1 |
    grep -E 'mpm-flywheel|metaflywheel' || true

echo ""
echo "==> 完成。重启 DSH 后飞轮上线（宿主组合行 mpm-flywheel 随 profile 加载）。"
echo "    验证运转: 会话中调用 mpm_flywheel_state 查看账本快照。"
