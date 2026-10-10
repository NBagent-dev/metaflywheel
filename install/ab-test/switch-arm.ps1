# MPM A/B 测试 · 臂别切换（A＝有引擎 / B＝无引擎）
#
# 用法：
#   pwsh -File switch-arm.ps1 -Arm B            # 切到无引擎臂
#   pwsh -File switch-arm.ps1 -Arm A            # 切回有引擎臂
#   pwsh -File switch-arm.ps1 -Arm status       # 只看当前在哪一臂（不改动）
#   测试用：-PatchPath <文件>  -DryRun
#
# ★为什么重写（2026-10-10 实测）：
#   旧版（switch-a/b-arm.ps1）写死 `~/.dsh/mpm/cordis.patch.user.yml`，**那个路径已经死了**——
#   引擎真正生效的补丁在 `~/.dsh/profiles/<profile>/cordis.patch.yml`（挂载点会漂移：P483-M402）。
#   而旧版守卫只检查"文件在不在"，两个都在 ⇒ 它会**"成功"执行、提示你重启、然后什么都不切**。
#   拿它做 A/B，会把"其实还在 A 臂"的结果记成"B 臂无引擎"，**直接污染 P025 的结论**。
#
# ★三条设计判据（都是今晚一路在踩的坑）：
#   ① **不猜路径，按事实找**：哪一份补丁里真的含 `mpm-flywheel`，哪一份就是活动补丁；
#      一份都没有 ⇒ 报错（说明引擎当前没挂）；多份都有 ⇒ 报错（多挂危险），要求 -PatchPath 显式指定。
#   ② **只摘自己那一条，不整文件替换**：旧模板只保留 agent-loop，会把 profile 的其它条目
#      （sandbox-policy / agent-default-model / ui-* …）一起清掉——B 臂不该以毁配置为代价。
#   ③ **切换后自证 + 失败回滚**：切完必须能证明"活动补丁里已无 mpm-flywheel"且"其它顶层条目一个没少"；
#      证不出来就恢复原文件并非零退出——**不许留下半切状态**。
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('A', 'B', 'status')][string]$Arm,
  [string]$PatchPath,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$MARK = 'mpm-flywheel'
$DshHome = Join-Path $env:USERPROFILE '.dsh'

function Get-TopLevelCount([string[]]$Lines) {
  return @($Lines | Where-Object { $_ -match '^-\s' }).Count
}

function Write-PatchFile {
  # 按原文件的换行与「无 BOM」写回——配置文件除被摘掉的那一块外应当逐字节不变。
  # -Reference：从哪份文件读换行特征（A 臂恢复时用备份，因为目标此刻是 B 臂版本）
  param([string]$Path, [string[]]$Lines, [string]$Reference)
  $src = if ($Reference -and (Test-Path $Reference)) { $Reference } elseif (Test-Path $Path) { $Path } else { '' }
  $raw = if ($src) { [System.IO.File]::ReadAllText($src) } else { '' }
  $nl = if ($raw -match "`r`n") { "`r`n" } else { "`n" }
  $text = ($Lines -join $nl)
  if (-not $text.EndsWith($nl)) { $text += $nl }
  [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Find-ActivePatch {
  param([string]$Explicit)
  if ($Explicit) {
    if (-not (Test-Path $Explicit)) { throw "指定的补丁不存在：$Explicit" }
    return (Resolve-Path $Explicit).Path
  }
  # 判据：**哪一份真的挂着引擎**（含 mpm-flywheel），而不是"路径看起来对不对"。
  # ★坑（2026-10-10 实测）：历史路径 ~/.dsh/mpm/cordis.patch.user.yml 里**仍然留着**一段
  #   mpm-flywheel insert（旧挂载点的残骸），它不生效却"含引擎" ⇒ 只按内容判断会误报"多挂"。
  #   故分级：profiles/*/cordis.patch.yml 优先；只有它们都没有引擎时才回退历史路径。
  $profiles = Join-Path $DshHome 'profiles'
  $underProfiles = @()
  if (Test-Path $profiles) {
    $underProfiles = @(Get-ChildItem $profiles -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName 'cordis.patch.yml' } | Where-Object { Test-Path $_ })
  }
  $legacy = Join-Path $DshHome 'mpm\cordis.patch.user.yml'
  $hasEngine = { param($p) (Get-Content $p -Raw -Encoding UTF8) -match [regex]::Escape($MARK) }
  $profHit = @($underProfiles | Where-Object { & $hasEngine $_ })
  $legacyHit = (Test-Path $legacy) -and (& $hasEngine $legacy)

  if ($profHit.Count -eq 1) {
    Write-Host "[发现] 活动补丁 = $($profHit[0])（profiles 下唯一含 $MARK 的一份）"
    if ($legacyHit) { Write-Host "[注意] 历史遗留文件也含 $MARK 但不生效，已忽略：$legacy" }
    return (Resolve-Path $profHit[0]).Path
  }
  if ($profHit.Count -gt 1) {
    throw ("profiles 下有 $($profHit.Count) 份补丁都含「$MARK」（多挂危险）：`n  " + ($profHit -join "`n  ") + "`n请用 -PatchPath 显式指定要切的那一份。")
  }
  if ($legacyHit) {
    Write-Host "[发现] profiles 下没有含 $MARK 的补丁，回退历史路径：$legacy"
    return (Resolve-Path $legacy).Path
  }
  throw ("没有任何补丁含「$MARK」——引擎当前没挂。先修挂载，再谈 A/B 切换。`n候选：" + (($underProfiles + $legacy) -join ' ; '))
}

function Remove-InsertBlock([string[]]$Lines) {
  # 只删「顶层 - insert: 块」中**含 mpm-flywheel** 的那一块；其余原样保留（含注释）
  $out = New-Object System.Collections.Generic.List[string]
  $i = 0
  $removed = 0
  while ($i -lt $Lines.Count) {
    if ($Lines[$i] -match '^-\s*insert:\s*$') {
      $block = @($Lines[$i]); $j = $i + 1
      while ($j -lt $Lines.Count -and -not ($Lines[$j] -match '^-\s')) { $block += $Lines[$j]; $j++ }
      if (($block -join "`n") -match [regex]::Escape($MARK)) { $removed += 1; $i = $j; continue }
      foreach ($b in $block) { $out.Add($b) }
      $i = $j; continue
    }
    $out.Add($Lines[$i]); $i++
  }
  return @{ Lines = $out.ToArray(); Removed = $removed }
}

# ── 主流程 ─────────────────────────────────────────────────────────
$patch = Find-ActivePatch -Explicit $PatchPath
$orig = Get-Content $patch -Encoding UTF8
$hasEngine = (($orig -join "`n") -match [regex]::Escape($MARK))
$backup = "$patch.AB-backup"
$topBefore = Get-TopLevelCount $orig
$where = if ($hasEngine) { 'A 臂（有引擎）' } else { 'B 臂（无引擎）' }
Write-Host "[现状] 活动补丁：$patch"
Write-Host "[现状] 顶层条目 $topBefore 个 · 当前 = $where"

if ($Arm -eq 'status') { exit 0 }

if ($Arm -eq 'B') {
  if (-not $hasEngine) { Write-Host "[跳过] 已经是 B 臂，未改动。"; exit 0 }
  $res = Remove-InsertBlock -Lines $orig
  if ($res.Removed -ne 1) { throw "期望恰好摘掉 1 个含 $MARK 的 insert 块，实得 $($res.Removed) —— 拒绝半切" }
  $new = $res.Lines
  $topAfter = Get-TopLevelCount $new
  # 自证
  if (($new -join "`n") -match [regex]::Escape($MARK)) { throw "自证失败：结果里仍含 $MARK" }
  if ($topAfter -ne ($topBefore - 1)) { throw "自证失败：顶层条目 $topBefore → $topAfter（应恰好少 1）" }
  if ($DryRun) {
    Write-Host "[DryRun] 将写入 $patch（$topBefore → $topAfter 个顶层条目）"
    ($orig | Where-Object { $_ -match [regex]::Escape($MARK) }) | ForEach-Object { Write-Host "   - $_" }
    exit 0
  }
  Copy-Item $patch $backup -Force
  Write-PatchFile -Path $patch -Lines $new
  Write-Host "[OK] 已切到 B 臂：$patch"
  Write-Host "[自证] 活动补丁已无 $MARK · 顶层条目 $topBefore → $topAfter（其它条目一个没动）"
  Write-Host "[备份] $backup"
  Write-Host ""
  Write-Host "下一步：1) 重启 DSH  2) 开新会话  3) 自查：新会话里**没有** mpm_* 工具与快照 = B 臂成立"
  Write-Host "        4) 逐条执行 tasks.md / execute-b-arm.md；完成后用 switch-arm.ps1 -Arm A 切回"
  exit 0
}

# Arm = A
if ($hasEngine) { Write-Host "[跳过] 已经是 A 臂，未改动。"; exit 0 }
if (-not (Test-Path $backup)) { throw "找不到备份：$backup —— 没有可恢复的原补丁（B 臂不是本脚本切的？）" }
$restore = Get-Content $backup -Encoding UTF8
if (-not (($restore -join "`n") -match [regex]::Escape($MARK))) { throw "自证失败：备份里也没有 $MARK，拒绝用它当 A 臂" }
if ($DryRun) { Write-Host "[DryRun] 将从 $backup 恢复"; exit 0 }
Write-PatchFile -Path $patch -Lines $restore -Reference $backup
$topAfter = Get-TopLevelCount (Get-Content $patch -Encoding UTF8)
Write-Host "[OK] 已切回 A 臂：$patch"
Write-Host "[自证] 活动补丁含 $MARK · 顶层条目 $topBefore → $topAfter"
Write-Host ""
Write-Host "下一步：重启 DSH → 开新会话（有 mpm_* 工具与快照 = A 臂成立）"
exit 0
