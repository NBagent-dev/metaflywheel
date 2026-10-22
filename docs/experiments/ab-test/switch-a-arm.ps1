# 兼容旧命令名（保留）：转发到 switch-arm.ps1 -Arm A
# 旧版写死了已失效的路径；现在只做转发，逻辑只有一份。
& (Join-Path $PSScriptRoot 'switch-arm.ps1') -Arm A @args
