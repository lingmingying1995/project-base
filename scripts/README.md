# scripts/ · 自动化任务脚本模板

> 这些脚本是模板，clone 项目后需要改占位符才能用。
> 占位符统一用 `PROJECT_NAME`（英文），搜索替换即可。

## 文件清单

### 传统脚本（直接执行）

| 文件 | 作用 | 平台 |
|------|------|------|
| `sync.bat` | Git 自动同步（stash→pull --rebase→pop→commit→push，失败重试3次，自带任务日志写入） | Windows |
| `sync.sh` | Git 自动同步（逻辑同上，Mac 版暂无任务日志写入） | Mac |
| `write-task-log.ps1` | 通用任务执行日志写入器（sync.bat 等脚本调用，结果写到 `产出/任务日志/`） | Windows |
| `auto-summary.bat` | 每日总结包装器（调用 auto-summary.js） | Windows |
| `auto-summary.js` | 每日对话归档核心逻辑（读 opencode.db → 调 GLM 分析 → 写总结文件） | 跨平台 |
| `com.PROJECT_NAME.auto-summary.plist` | Mac 定时任务配置（每日总结） | Mac |
| `com.PROJECT_NAME.sync.plist` | Mac 定时任务配置（Git同步） | Mac |

### 工具脚本（按需调用，非定时任务）

| 文件 | 作用 | 平台 | 依赖 |
|------|------|------|------|
| `ocr-image.py` | OCR 图片文字提取（模型不支持识图时的降级方案，用 Windows 自带 OCR 引擎） | Windows | Python 3.10+、Pillow、winrt 包（见下方说明） |

### Task Guardian 模式（opencode Agent 自动诊断修复）

| 文件 | 作用 | 平台 |
|------|------|------|
| `task-guardian-summary.bat` | 调用 opencode run --agent task-guardian 执行每日总结 | Windows |
| `task-guardian-sync.bat` | 调用 opencode run --agent task-guardian 执行 Git 同步 | Windows |
| `schtasks-xml/PROJECT_NAME_AutoSummary.xml` | Windows 计划任务 XML（每日总结） | Windows |
| `schtasks-xml/PROJECT_NAME_Sync.xml` | Windows 计划任务 XML（Git 同步） | Windows |

> **两种模式区别**：传统脚本直接跑 Node.js，失败就失败了；Task Guardian 模式由 opencode Agent 执行，失败时自动诊断原因并尝试修复（建目录、换模型、装依赖等），修复后重试。

## 前置条件

### 传统模式
- Node.js 18+
- 项目 server 目录下装了 sql.js

### Task Guardian 模式
- opencode CLI（`npm install -g opencode-ai`）
- opencode 已配置 API Key（`opencode auth login`）
- 项目 `.opencode/agents/task-guardian.md` 已放好

## 使用前必改

搜索所有文件里的 `PROJECT_NAME`，替换成你的项目英文名；搜索 `PROJECT_PATH`，替换成项目绝对路径：

| 文件 | 改什么 |
|------|--------|
| `sync.bat` | 第11行 `set PROJECT_NAME=PROJECT_NAME` → 改成项目名（日志文件名用） |
| `sync.sh` | 第9行 `PROJECT_NAME="PROJECT_NAME"` → 同上 |
| `write-task-log.ps1` | 第18行 `$workMachines` 数组 → 改成你的工作电脑机器名（`echo %COMPUTERNAME%` 查看），用于区分 WORK/HOME 日志标识。不改也能跑，只是机器标识都算 HOME |
| `auto-summary.bat` | 日志文件名里的 `PROJECT_NAME` |
| `auto-summary.js` | `CONFIG.projectKeyword`（匹配 opencode.db 的 session directory）、`CONFIG.logFile`、prompt 里的项目名 |
| 两个 plist 文件 | `Label`、`StandardOutPath`、`StandardErrorPath` 里的 `PROJECT_NAME`，以及 `WorkingDirectory` 改成 Mac 上的项目绝对路径 |
| `task-guardian-summary.bat` | `PROJECT_PATH` → 项目绝对路径 |
| `task-guardian-sync.bat` | `PROJECT_PATH` → 项目绝对路径 |
| `schtasks-xml/*.xml` | `PROJECT_NAME` → 项目英文名，`PROJECT_PATH` → 项目绝对路径 |

## 还要装依赖

auto-summary.js 需要 `sql.js` 来读 opencode.db：

```bash
cd server
npm install sql.js
```

如果项目没有 server 目录，建一个再装，或改 auto-summary.js 里的 `serverDir` 指向有 sql.js 的目录。

ocr-image.py 需要 Python 3.10+ 和 winrt 包：

```bash
pip install pillow winrt-Windows.Media.Ocr winrt-Windows.Graphics.Imaging winrt-Windows.Storage.Streams winrt-Windows.Foundation winrt-Windows.Foundation.Collections
```

> 仅 Windows 可用（依赖 Windows.Media.Ocr）。macOS/Linux 用 tesseract 替代：`brew install tesseract tesseract-lang`。
> 运行时需设 `$env:PYTHONIOENCODING="utf-8"` 修复中文编码。
> 用法：`python scripts/ocr-image.py "图片路径.jpg"`

## 配置定时任务

### 方式一：Task Guardian 模式

> Agent 自动诊断修复，失败时能自动处理常见问题（目录缺失、模型不可用、依赖缺失等）。需要 opencode CLI 环境。

**前置**：装 opencode CLI + 配 API Key + 放 task-guardian.md 到 `.opencode/agents/`

```cmd
REM 替换 PROJECT_NAME 和 PROJECT_PATH 后注册
schtasks /create /xml "PROJECT_PATH\scripts\schtasks-xml\PROJECT_NAME_AutoSummary.xml" /tn "\PROJECT_NAME_AutoSummary" /f
schtasks /create /xml "PROJECT_PATH\scripts\schtasks-xml\PROJECT_NAME_Sync.xml" /tn "\PROJECT_NAME_Sync" /f
```

验证：
```cmd
schtasks /run /tn "\PROJECT_NAME_AutoSummary"
schtasks /query /tn "\PROJECT_NAME_AutoSummary" /v /fo LIST
```

### 方式二：传统脚本模式

> 脚本直接执行，失败不自动修复，适合调试或简单场景。

#### Windows（任务计划程序）

> 把 `PROJECT_NAME` 和 `PROJECT_PATH` 都替换成你的项目英文名和项目绝对路径。

```cmd
schtasks /create /tn "PROJECT_NAME_Sync" /tr "PROJECT_PATH\scripts\sync.bat" /sc daily /st 18:50 /f
schtasks /create /tn "PROJECT_NAME_AutoSummary" /tr "PROJECT_PATH\scripts\auto-summary.bat" /sc daily /st 18:40 /f
```

验证：
```cmd
schtasks /query /tn PROJECT_NAME_Sync
```

#### Mac（launchd）

```bash
# 改完 plist 里的 WorkingDirectory 后
cp scripts/com.PROJECT_NAME.*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.PROJECT_NAME.auto-summary.plist
launchctl load ~/Library/LaunchAgents/com.PROJECT_NAME.sync.plist
```

验证：
```bash
launchctl list | grep PROJECT_NAME
```

## 时间建议

| 电脑角色 | 每日总结 | Git 同步 | 说明 |
|---------|---------|---------|------|
| 工作电脑 | 18:40 | 18:50 | 下班前跑完 |
| 家用电脑 | 23:30 | 23:50 | 睡前跑完 |

家用电脑的每日总结用 `--machine=home` 参数，文件加 `-HOME` 后缀，避免和工作电脑的总结 git 冲突。
