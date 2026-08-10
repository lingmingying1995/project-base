param(
    [Parameter(Mandatory=$true)][string]$Task,
    [Parameter(Mandatory=$true)][string]$Result,
    [string]$Summary
)

# 通用任务执行日志写入器（模板版）
# 用法：powershell -ExecutionPolicy Bypass -File write-task-log.ps1 -Task ProjectBaseSync -Result success -Summary "xxx"
# Task: 任意任务名（如 ProjectBaseSync / ProjectBaseAutoSummary / ProjectBaseFullTest）
# Result: success / fail
#
# 日志写到项目根的 产出/任务日志/<Task>.md
# 模板使用前无需改动，路径自动按相对位置推算。

$root = Split-Path $PSScriptRoot -Parent

# 目录名用 char 拼接避免编码问题
# 注意：不同项目的产出目录名可能不同
# workbench 是"工作台产出"，project-base 是"产出"
# 如果你的项目用了别的名字，改下面这行
$产出 = [char]0x4EA7 + [char]0x51FA
$任务日志 = [char]0x4EFB + [char]0x52A1 + [char]0x65E5 + [char]0x5FD7
$logDir = Join-Path (Join-Path $root $产出) $任务日志
$logFile = Join-Path $logDir "$Task.md"

# 机器标识：工作电脑=WORK，其他=HOME
# 把你的工作电脑机器名加到下面的数组里
$workMachines = @('CHINAMI-NJDMT06')
$machine = if ($workMachines -contains $env:COMPUTERNAME) { 'WORK' } else { 'HOME' }

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$labelResult = [char]0x7ED3 + [char]0x679C + [char]0xFF1A
$labelSummary = [char]0x6458 + [char]0x8981 + [char]0xFF1A
$resultSuccess = [char]0x6210 + [char]0x529F
$resultFail = [char]0x5931 + [char]0x8D25

if ($Result -eq 'success') {
    $resultText = $resultSuccess
} elseif ($Result -eq 'fail') {
    $resultText = $resultFail
} else {
    $resultText = $Result
}

if (-not (Test-Path $logFile)) {
    $header = "# $Task`n`n---`n"
    Add-Content -Path $logFile -Value $header -Encoding UTF8
}

$entry = "`n## $now [$machine]`n- $labelResult$resultText`n"
if ($Summary) {
    $entry += "- $labelSummary$Summary`n"
}
$entry += "---`n"
Add-Content -Path $logFile -Value $entry -Encoding UTF8
