@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0\.."

REM 每日对话自动归档包装器（Windows版）
REM 由任务计划程序每天定时触发
REM
REM 用法：
REM   auto-summary.bat              # 工作电脑（无后缀）
REM   auto-summary.bat home         # 家用电脑（文件加 -HOME 后缀）
REM   auto-summary.bat --machine=home  # 同上，完整参数写法
REM   auto-summary.bat --date=2026-08-12  # 补跑指定日期

set "ARGS=%*"
if "%~1"=="" goto run
echo %~1 | findstr /b "\--" >nul
if errorlevel 1 (
  set "ARGS=--machine=%~1 %~2 %~3 %~4 %~5"
)

:run
node scripts\auto-summary.js %ARGS%
set "EXITCODE=!errorlevel!"
if !EXITCODE! geq 1 (
    echo [%date% %time%] auto-summary failed, exit code !EXITCODE! >> "%TEMP%\PROJECT_NAME_auto_summary.log"
) else (
    echo [%date% %time%] auto-summary success >> "%TEMP%\PROJECT_NAME_auto_summary.log"
)
endlocal
