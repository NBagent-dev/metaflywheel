# MetaFlywheel 引擎运行副本一键同步（防「重启后不生效」事故）
# 用法：powershell -ExecutionPolicy Bypass -File install\sync-engine.ps1
# 行为：备份现有运行副本 -> 复制仓库 engine/host.js 到 ~/.dsh/mpm/engine/ -> 报告差异归零
# 之后需重启 DSH 宿主生效（本脚本不影响已在运行的进程）
$ErrorActionPreference = 'Stop'
$repo = Join-Path $PSScriptRoot '..\engine\host.js'
$homeDir = Join-Path $env:USERPROFILE '.dsh\mpm\engine'
$target = Join-Path $homeDir 'host.js'
if (-not (Test-Path $repo)) { Write-Error "未找到仓库引擎: $repo"; exit 1 }
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
if (Test-Path $target) {
  $bak = Join-Path $homeDir ("host.js.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Copy-Item $target $bak -Force
  Write-Host "已备份旧副本 -> $bak"
}
Copy-Item $repo $target -Force
$a = (Get-Content $repo -Raw) -replace "`r`n", "`n"
$b = (Get-Content $target -Raw) -replace "`r`n", "`n"
if ($a -ceq $b) { Write-Host "同步完成：运行副本与仓库一致。重启 DSH 宿主后生效。" }
else { Write-Warning "同步后仍有差异——请检查编码/换行。"; exit 2 }
