#!/bin/bash
# Git 自动同步脚本（macOS版）
# 由 LaunchAgent 每天 23:50 调用
# 功能：stash本地变更 → pull --rebase → pop恢复 → 有变更就commit → push，失败重试3次
# 与 Windows 版 sync.bat 逻辑对齐
#
# 使用前：把 PROJECT_NAME 改成你的项目名（用于日志文件名区分）

PROJECT_NAME="PROJECT_NAME"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

LOG="/tmp/${PROJECT_NAME}_sync.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === start ===" >> "$LOG"

# 先暂存本地未提交变更，pull 要求干净工作区
STASHED=0
if [ -n "$(git status --porcelain)" ]; then
    git stash push -u -m "sync-autostash" >> "$LOG" 2>&1
    if [ $? -eq 0 ]; then
        STASHED=1
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] stashed local changes" >> "$LOG"
    fi
fi

# 拉远程更新（rebase 保持线性历史，冲突不自动解决）
git pull --rebase >> "$LOG" 2>&1
if [ $? -ne 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] pull rebase conflict, abort" >> "$LOG"
    if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
        git rebase --abort >> "$LOG" 2>&1
    fi
    [ "$STASHED" = "1" ] && git stash pop >> "$LOG" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] pull failed, give up (manual resolve needed)" >> "$LOG"
    exit 1
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] pull ok" >> "$LOG"

# 恢复之前暂存的本地变更
if [ "$STASHED" = "1" ]; then
    git stash pop >> "$LOG" 2>&1
    if [ $? -ne 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] stash pop conflict, keep in stash, give up" >> "$LOG"
        exit 1
    fi
fi

# 检测工作区是否有变更
if [ -z "$(git status --porcelain)" ]; then
    AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
    if [ "$AHEAD" = "0" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] no change, no ahead" >> "$LOG"
        exit 0
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] no change but ahead $AHEAD commits, push only" >> "$LOG"
    PUSH_ONLY=1
else
    git add -A >> "$LOG" 2>&1
    if git diff --cached --quiet; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] no diff, skip" >> "$LOG"
        exit 0
    fi
    git commit -m "sync: $(date '+%Y-%m-%d')" >> "$LOG" 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] commit done" >> "$LOG"
    PUSH_ONLY=0
fi

# 推送（失败重试3次，每次间隔5分钟）
RETRY=0
while [ $RETRY -lt 3 ]; do
    if git push >> "$LOG" 2>&1; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] push ok" >> "$LOG"
        exit 0
    fi
    RETRY=$((RETRY + 1))
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] push fail (retry $RETRY/3)" >> "$LOG"
    [ $RETRY -lt 3 ] && sleep 300
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] push failed after 3 retries, give up" >> "$LOG"
exit 1
