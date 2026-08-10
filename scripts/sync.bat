@echo off
chcp 65001 >nul
REM Git 自动同步脚本（Windows版）
REM 由任务计划程序每天定时触发
REM 功能：stash本地变更 → pull --rebase → pop恢复 → 有变更就commit → push，失败重试3次
REM
REM 使用前：把 PROJECT_NAME 改成你的项目名（用于日志文件名区分）
REM 配套：用 schtasks 创建计划任务指向本文件
REM 任务日志：写到 产出/任务日志/<PROJECT_NAME>Sync.md（由 write-task-log.ps1 写入）

set PROJECT_NAME=PROJECT_NAME
cd /d "%~dp0\.."

set LOG=%TEMP%\%PROJECT_NAME%_sync.log
echo [%date% %time%] === start === >> "%LOG%"

REM 先暂存本地未提交变更，pull --rebase 要求干净工作区
set STASHED=0
git status --porcelain > "%TEMP%\%PROJECT_NAME%_chg.txt"
for /f %%A in ("%TEMP%\%PROJECT_NAME%_chg.txt") do set SZ=%%~zA
if not "%SZ%"=="0" (
    git stash push -u -m "sync-autostash" >> "%LOG%" 2>&1
    if not errorlevel 1 (
        set STASHED=1
        echo [%date% %time%] stashed local changes >> "%LOG%"
    )
)

REM 拉远程更新（rebase 保持线性历史，冲突不自动解决）
git pull --rebase >> "%LOG%" 2>&1
if errorlevel 1 goto :pullfail
echo [%date% %time%] pull ok >> "%LOG%"

REM 恢复之前暂存的本地变更
if "%STASHED%"=="1" (
    git stash pop >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo [%date% %time%] stash pop conflict, keep in stash, give up >> "%LOG%"
        powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result fail -Summary "stash pop conflict"
        exit /b 1
    )
)

REM 重新检测工作区变更（stash pop 恢复后再判断）
git status --porcelain > "%TEMP%\%PROJECT_NAME%_chg.txt"
for /f %%A in ("%TEMP%\%PROJECT_NAME%_chg.txt") do set SZ=%%~zA
echo [%date% %time%] size=%SZ% >> "%LOG%"

if "%SZ%"=="0" (
    del "%TEMP%\%PROJECT_NAME%_chg.txt" >nul 2>&1
    for /f %%B in ('git rev-list --count @ ^@{u} 2^>nul') do set AHEAD=%%B
    if "%AHEAD%"=="" set AHEAD=0
    if "%AHEAD%"=="0" (
        echo [%date% %time%] no change, no ahead >> "%LOG%"
        powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "no change"
        exit /b 0
    )
    echo [%date% %time%] no change but ahead %AHEAD% commits, push only >> "%LOG%"
    goto :pushonly
)

del "%TEMP%\%PROJECT_NAME%_chg.txt" >nul 2>&1
echo [%date% %time%] has change, commit... >> "%LOG%"
git add . >> "%LOG%" 2>&1
git diff --cached --quiet
if errorlevel 1 goto :dopush
    echo [%date% %time%] no diff, skip >> "%LOG%"
    powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "no diff"
    exit /b 0

:pullfail
echo [%date% %time%] pull rebase conflict, abort >> "%LOG%"
REM 只在真的处于 rebase 中时才 abort（pull 失败原因可能不是冲突）
if exist ".git\rebase-merge\" git rebase --abort >> "%LOG%" 2>&1
if exist ".git\rebase-apply\" git rebase --abort >> "%LOG%" 2>&1
if "%STASHED%"=="1" git stash pop >> "%LOG%" 2>&1
echo [%date% %time%] pull failed, give up (manual resolve needed) >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result fail -Summary "pull conflict"
exit /b 1

:dopush
git diff --cached --stat > "%TEMP%\%PROJECT_NAME%_stat.txt"
set CHANGES=
for /f "delims=" %%L in (%TEMP%\%PROJECT_NAME%_stat.txt) do set CHANGES=%%L
del "%TEMP%\%PROJECT_NAME%_stat.txt" >nul 2>&1

git commit -m "sync: %date:~0,10%" >> "%LOG%" 2>&1
echo [%date% %time%] commit rc=%errorlevel% >> "%LOG%"

:pushonly
set RETRY=0

:pushloop
git push >> "%LOG%" 2>&1
if errorlevel 1 goto :pushfail
:pushok
echo [%date% %time%] push ok >> "%LOG%"
if "%SZ%"=="0" (
    powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "push %AHEAD% commits"
) else (
    powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "%CHANGES%"
)
goto :done

:pushfail
set /a RETRY+=1
echo [%date% %time%] push fail (retry %RETRY%/3) >> "%LOG%"
if %RETRY% lss 3 (
    echo [%date% %time%] wait 5 min before retry... >> "%LOG%"
    ping 127.0.0.1 -n 300 >nul
    goto :pushloop
)
echo [%date% %time%] push failed after 3 retries, give up >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result fail -Summary "push failed after 3 retries"
exit /b 1

:done
exit /b 0
