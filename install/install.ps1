[CmdletBinding()]
param(
    [string]$Profile = 'web'
)

$ErrorActionPreference = 'Stop'
$repo = 'github:NBagent-dev/metaflywheel'

$npx = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npx) {
    throw 'npx not found. Please install Node.js (>=20) first.'
}

Write-Host "==> Installing MetaFlywheel (MPM cognitive flywheel) -> profile '$Profile'"
Write-Host "==> Source: $repo (official bundle contract, zero core changes)"
& npx --yes -p @deepseek-ai/dsh dsh plugin --profile $Profile add $repo
if ($LASTEXITCODE -ne 0) {
    throw "Install failed (exit $LASTEXITCODE). Fallback: manual mount, see README 'Install' section A."
}

Write-Host ""
Write-Host "==> Verifying registration (expect an 'mpm-flywheel' line):"
& npx --yes -p @deepseek-ai/dsh dsh --profile $Profile --dump-config 2>&1 |
    Select-String -Pattern 'mpm-flywheel|metaflywheel'

Write-Host ""
Write-Host "==> Done. Restart DSH to bring the flywheel online (composition row mpm-flywheel loads with the profile)."
Write-Host "    Verify at runtime: call mpm_flywheel_state in a session to see the ledger snapshot."
