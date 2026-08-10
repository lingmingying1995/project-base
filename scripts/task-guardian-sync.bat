@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
opencode run --agent "task-guardian" --auto -m "miao/glm-5.1" --dir "PROJECT_PATH" "Execute git-sync task"
