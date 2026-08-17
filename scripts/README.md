# scripts/ · Git 同步脚本模板

> 这些脚本是模板，clone 项目后需要改占位符才能用。
> 占位符统一用 `PROJECT_NAME`（英文），搜索替换即可。

## 文件清单

| 文件 | 作用 | 平台 |
|------|------|------|
| `sync.bat` | Git 自动同步（stash→pull --rebase→pop→commit→push，失败重试3次，自带任务日志写入） | Windows |
| `sync.sh` | Git 自动同步（逻辑同上，Mac 版暂无任务日志写入） | Mac |
| `write-task-log.ps1` | 通用任务执行日志写入器（sync.bat 调用，结果写到 `产出/任务日志/`） | Windows |

> 每日对话归档、Task Guardian 模式、OCR 等进阶脚本属于**完整版（付费版）**，见仓库根目录 README。

## 使用前必改

搜索所有文件里的 `PROJECT_NAME`，替换成你的项目英文名：

| 文件 | 改什么 |
|------|--------|
| `sync.bat` | 第11行 `set PROJECT_NAME=PROJECT_NAME` → 改成项目名（日志文件名用） |
| `sync.sh` | 第9行 `PROJECT_NAME="PROJECT_NAME"` → 同上 |
| `write-task-log.ps1` | 第18行 `$workMachines` 数组 → 改成你的工作电脑机器名（`echo %COMPUTERNAME%` 查看），用于区分 WORK/HOME 日志标识。不改也能跑，只是机器标识都算 HOME |

## 配置定时任务

### Windows（任务计划程序）

```cmd
schtasks /create /tn "PROJECT_NAME_Sync" /tr "PROJECT_PATH\scripts\sync.bat" /sc daily /st 18:50 /f
```

验证：
```cmd
schtasks /query /tn PROJECT_NAME_Sync
```

### Mac（launchd）

```bash
# 写一个 com.PROJECT_NAME.sync.plist 指向 sync.sh，然后：
launchctl load ~/Library/LaunchAgents/com.PROJECT_NAME.sync.plist
```

验证：
```bash
launchctl list | grep PROJECT_NAME
```

## 时间建议

| 电脑角色 | Git 同步 | 说明 |
|---------|---------|------|
| 工作电脑 | 18:50 | 下班前跑完 |
| 家用电脑 | 23:50 | 睡前跑完 |
