[CmdletBinding()]
param(
    [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$repo = 'github:NBagent-dev/metaflywheel'

$npx = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npx) {
    throw '找不到 npx。请先安装 Node.js (>=20)。'
}

Write-Host "==> 安装 MetaFlywheel (MPM cognitive flywheel) -> profile '$Profile'"
Write-Host "==> 源: $repo (官方 bundle 契约，零核心改动)"
& npx --yes -p @deepseek-ai/dsh dsh plugin --profile $Profile add $repo
if ($LASTEXITCODE -ne 0) {
    throw "安装失败 (exit $LASTEXITCODE)。可改用方式 A 手动挂载：见 README 'Install' 一节。"
}

Write-Host "`n==> 验证注册（应看到 mpm-flywheel 行）:"
& npx --yes -p @deepseek-ai/dsh dsh --profile $Profile --dump-config 2>&1 |
    Select-String -Pattern 'mpm-flywheel|metaflywheel'

Write-Host "`n==> 完成。重启 DSH 后飞轮上线（宿主组合行 mpm-flywheel 随 profile 加载）。"
Write-Host "    验证运转: 会话中调用 mpm_flywheel_state 查看账本快照。"
