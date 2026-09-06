# MetaFlywheel 引擎运行副本一键同步（防「重启后不生效/模块缺失」事故）
# 用法：powershell -ExecutionPolicy Bypass -File install\sync-engine.ps1
# 行为：备份现有运行副本 -> 复制仓库 engine/host.js 与 engine/modules/*.mjs 到 ~/.dsh/mpm/engine/
#       -> 校验 host.js 与全部模块逐字节一致 -> 提示重启生效（本脚本不影响已在运行的进程）
# P079 修订：同步范围覆盖整个引擎目录（P079 后引擎为 host.js + modules/ 多文件，单文件同步会漏模块）
$ErrorActionPreference = 'Stop'
$repoEngine = Join-Path $PSScriptRoot '..\engine'
$homeDir = Join-Path $env:USERPROFILE '.dsh\mpm\engine'
$hostRepo = Join-Path $repoEngine 'host.js'
$hostTarget = Join-Path $homeDir 'host.js'
$modSrc = Join-Path $repoEngine 'modules'
$modDst = Join-Path $homeDir 'modules'
if (-not (Test-Path $hostRepo)) { Write-Error "未找到仓库引擎: $hostRepo"; exit 1 }
New-Item -ItemType Directory -Force -Path $homeDir | Out-Null
New-Item -ItemType Directory -Force -Path $modDst | Out-Null
if (Test-Path $hostTarget) {
  $bak = Join-Path $homeDir ("host.js.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Copy-Item $hostTarget $bak -Force
  Write-Host "已备份旧副本 -> $bak"
}
Copy-Item $hostRepo $hostTarget -Force
Get-ChildItem $modSrc -Filter *.mjs | ForEach-Object { Copy-Item $_.FullName (Join-Path $modDst $_.Name) -Force }
function Test-Same([string]$a, [string]$b) {
  $x = (Get-Content $a -Raw) -replace "`r`n", "`n"
  $y = (Get-Content $b -Raw) -replace "`r`n", "`n"
  return $x -ceq $y
}
$ok = Test-Same $hostRepo $hostTarget
$missing = @()
Get-ChildItem $modSrc -Filter *.mjs | ForEach-Object {
  $target = Join-Path $modDst $_.Name
  if (-not (Test-Path $target) -or -not (Test-Same $_.FullName $target)) { $missing += $_.Name }
}
if ($ok -and $missing.Count -eq 0) { Write-Host "同步完成：host.js + modules 全部一致。重启 DSH 宿主后生效。" }
else { Write-Warning "同步后仍有差异/缺失：$($missing -join ', ')"; exit 2 }
