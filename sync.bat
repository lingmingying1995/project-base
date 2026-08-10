@echo off
chcp 65001 >nul
REM Git auto sync script (project-base instance, Windows)
REM Triggered by Task Scheduler ProjectBaseSync daily
REM Flow: stash -> pull --rebase -> pop -> commit -> push, retry 3 times on fail
REM Task log: written by scripts/write-task-log.ps1 (Chinese dir name auto-handled)

set PROJECT_NAME=ProjectBase
cd /d "%~dp0"

set LOG=%TEMP%\%PROJECT_NAME%_sync.log
echo [%date% %time%] === start === >> "%LOG%"

REM Stash local uncommitted changes first (pull --rebase requires clean worktree)
set STASHED=0
git status --porcelain > "%TEMP%\%PROJECT_NAME%_chg.txt"
for /f %%A in ("%TEMP%\%PROJECT_NAME%_chg.txt") do set SZ=%%~zA
if "%SZ%"=="0" goto :dopull
git stash push -u -m "sync-autostash" >> "%LOG%" 2>&1
if errorlevel 1 goto :dopull
set STASHED=1
echo [%date% %time%] stashed local changes >> "%LOG%"

:dopull
REM Pull remote updates (rebase keeps linear history, conflicts not auto-resolved)
git pull --rebase >> "%LOG%" 2>&1
if errorlevel 1 goto :pullfail
echo [%date% %time%] pull ok >> "%LOG%"

REM Restore previously stashed local changes
if not "%STASHED%"=="1" goto :afterpop
git stash pop >> "%LOG%" 2>&1
if not errorlevel 1 goto :afterpop
echo [%date% %time%] stash pop conflict, keep in stash, give up >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result fail -Summary "stash pop conflict"
exit /b 1
:afterpop

REM Re-check worktree changes (after stash pop)
git status --porcelain > "%TEMP%\%PROJECT_NAME%_chg.txt"
for /f %%A in ("%TEMP%\%PROJECT_NAME%_chg.txt") do set SZ=%%~zA
echo [%date% %time%] size=%SZ% >> "%LOG%"

if "%SZ%"=="0" goto :nochange

del "%TEMP%\%PROJECT_NAME%_chg.txt" >nul 2>&1
echo [%date% %time%] has change, commit... >> "%LOG%"
git add . >> "%LOG%" 2>&1
git diff --cached --quiet
if errorlevel 1 goto :dopush
echo [%date% %time%] no diff, skip >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "no diff"
exit /b 0

:nochange
del "%TEMP%\%PROJECT_NAME%_chg.txt" >nul 2>&1
for /f %%B in ('git rev-list --count @ ^@{u} 2^>nul') do set AHEAD=%%B
if "%AHEAD%"=="" set AHEAD=0
if "%AHEAD%"=="0" goto :lognothing
echo [%date% %time%] no change but ahead %AHEAD% commits, push only >> "%LOG%"
set CHANGES=push %AHEAD% commits
goto :dopush_nocommit

:lognothing
echo [%date% %time%] no change, no ahead >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "no change"
exit /b 0

:dopush
git diff --cached --stat > "%TEMP%\%PROJECT_NAME%_stat.txt"
set CHANGES=
for /f "delims=" %%L in (%TEMP%\%PROJECT_NAME%_stat.txt) do set CHANGES=%%L
del "%TEMP%\%PROJECT_NAME%_stat.txt" >nul 2>&1
git commit -m "sync: %date:~0,10%" >> "%LOG%" 2>&1
echo [%date% %time%] commit rc=%errorlevel% >> "%LOG%"

:dopush_nocommit
set RETRY=0

:pushloop
git push >> "%LOG%" 2>&1
if errorlevel 1 goto :pushfail
echo [%date% %time%] push ok >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result success -Summary "%CHANGES%"
goto :done

:pushfail
set /a RETRY+=1
echo [%date% %time%] push fail (retry %RETRY%/3) >> "%LOG%"
if not %RETRY% lss 3 goto :pushgiveup
echo [%date% %time%] wait 5 min before retry... >> "%LOG%"
ping 127.0.0.1 -n 300 >nul
goto :pushloop

:pushgiveup
echo [%date% %time%] push failed after 3 retries, give up >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result fail -Summary "push failed after 3 retries"
exit /b 1

:pullfail
echo [%date% %time%] pull rebase conflict, abort >> "%LOG%"
REM Only abort if actually in a rebase (pull fail may not be a conflict)
if exist ".git\rebase-merge\" git rebase --abort >> "%LOG%" 2>&1
if exist ".git\rebase-apply\" git rebase --abort >> "%LOG%" 2>&1
if "%STASHED%"=="1" git stash pop >> "%LOG%" 2>&1
echo [%date% %time%] pull failed, give up (manual resolve needed) >> "%LOG%"
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\write-task-log.ps1" -Task %PROJECT_NAME%Sync -Result fail -Summary "pull conflict"
exit /b 1

:done
exit /b 0
