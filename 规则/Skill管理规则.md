# Skill 管理规则

> 本规则规范本项目下 opencode skill 的创建、存放和管理。AI 创建或修改 skill 时必须遵守。
> 不使用 opencode 的项目跳过本文件。

---

<!-- source: project-base -->
## 一、存放位置：统一放全局

所有 skill 统一放全局目录 `~/.config/opencode/skills/[skill名]/SKILL.md`，不区分项目级和全局级。

**为什么不分项目级：**
- 不用纠结"这个 skill 该放哪"，所有 skill 一处管理
- 换电脑同步一次全局目录即可，不用逐项目检查
- 通过 description 的触发关键词区分该不该触发，不靠目录位置区分

**全局目录的同步方案见第五节。**

---

## 二、创建 skill 前的防重复检查

创建新 skill 前，扫全局目录 `~/.config/opencode/skills/` 下有没有同名 skill：
- 没有 → 创建
- 有 → 不要重建，改现有的

同时检查有没有**触发关键词撞车**的 skill（见第三节"撞车消歧"）。

---

## 三、SKILL.md 写作规范

### 文件结构

```
~/.config/opencode/skills/[skill名]/
└── SKILL.md
```

skill 目录名用英文（如 `weekly-report`），SKILL.md 是唯一文件。

### frontmatter（必须）

```yaml
---
name: skill名（英文，跟目录名一致）
description: 中文描述，必须包含触发关键词
---
```

**description 的写法**：
- 用中文（用户会用中文触发）
- 必须包含用户会说的触发关键词（如"写周报""出周报""生成本周周报"）
- 说明触发场景（"用户说XX时触发"）
- 不加作用域限定（不写"仅在XX项目使用"），靠关键词区分

### 撞车消歧（重要）

所有 skill 都在全局，触发关键词可能撞车。撞车时必须在 description 里手动消歧——明确说"用户说XX时走另一个 skill，不要触发本 skill"。

**例子**：
- `zentao-story-import`（禅道录需求）和 `backlog-import`（工作台需求池）都会被"录入需求"触发
- `zentao-story-import` 的 description 里加："注意：用户说'录入需求池''需求池加一条'（明确带'需求池'字样）时走工作台需求池 skill（backlog-import），不要触发本 skill"

**判断要不要消歧**：创建新 skill 时，扫一遍现有 skill 的 description，看有没有触发关键词重叠的。有重叠就加消歧说明。

### 正文结构

```
# [skill 中文名]

## 适用场景
什么时候用这个 skill。

## 触发条件
用户说什么话时触发。

## 前置条件
执行前需要什么（读哪些文件、装什么依赖、拿到什么输入）。

## 输入格式
用户要提供什么（参数、文件、口述内容）。

## 执行流程
具体步骤，每步可执行，不写空话。
"第一步读取X文件，第二步调Y接口，第三步逐行创建" ✅
"分析数据并给出建议" ❌

## 输出格式
产出长什么样（文件路径、文件结构、内容模板）。

## 注意事项
容易踩的坑、边界情况、特殊处理。
```

### 语言

- 全部用中文编写：description、正文、注释
- skill 目录名用英文（兼容性好，路径不易出错）
- 已有的英文 skill 不强制改中文，能正常工作即可；新建或大改时统一用中文

---

## 四、修改和删除 skill

### 修改

- 直接改 `~/.config/opencode/skills/[skill名]/SKILL.md`
- 如果全局目录是软链（指向某个项目的镜像目录），实际改的是镜像目录里的文件
- 改完后不需要重启 opencode，下次触发自动加载新版

### 删除

- 确认这个 skill 真的没用了再删
- 删全局目录下的 skill 目录。如果是软链，去镜像源删
- 删完后扫一遍 AGENTS.md、操作手册等文档，看有没有引用这个 skill 的地方，一并清理

---

## 五、跨电脑同步

所有 skill 都在全局目录，换电脑时要同步全局目录。有两种方案：

### 方案A：独立 git 仓库（通用）

把全局 skill 目录放进一个独立 git 仓库，换电脑 clone。

- 优点：全局 skill 跟项目解耦，独立演进
- 缺点：多一个仓库要维护，容易忘了提交
- 适合：全局 skill 多、跟任何项目都不强绑定的场景

### 方案B：软链绑定主项目（推荐）

让全局目录软链指向某个"主项目"的镜像目录，全局 skill 跟着主项目的 git 走，换电脑 git pull 即同步。

**怎么做：**
```bash
# 删掉全局目录（先备份）
rm -rf ~/.config/opencode/skills
# 创建软链，指向主项目的镜像目录
ln -s /path/to/主项目/.skills-mirror/skills ~/.config/opencode/skills
```

**机制：**
- 全局目录 = 主项目的镜像目录（同一份文件，两个路径）
- 写全局 skill = 写主项目的镜像目录 → 跟着主项目 git 提交 → 换电脑 git pull 即同步
- 全局 skill 和主项目专属 skill 可以放同一个镜像目录，统一管理

**适用条件：**
- 有一个"主项目"愿意承载全局 skill（通常是你的核心工作项目）
- 全局 skill 跟主项目关联度较高（即使主项目不用，放这里也无害）

**限制：**
- 全局目录只能指向一个地方，所以**只有主项目能用软链机制**
- 其他项目想创建 skill，直接写到主项目的镜像目录（通过全局软链访问），不需要在自己项目下建 `.opencode/skills/`

**为什么推荐软链：**
- 不用多维护一个仓库（借用主项目的 git）
- 全局 skill 跟主项目一起换电脑同步，不会漏
- 主项目可以通过页面/索引展示这些 skill（如 workbench 的"个人 Skills"页面）

> 软链是"借用一个项目的 git 来管理全局 skill"的思路。本质是把"全局 skill 的同步问题"转化为"主项目的 git 同步问题"，借力已有机制，不新建机制。

---

## 六、常见问题

### Q：skill 和 agent 有什么区别？

- **skill** 是"流程脚本"——用户说一句话触发，按固定流程执行，产出固定结果。像"周报生成""版本更新记录"。
- **agent** 是"协作者"——在特定阶段介入，有判断能力，能跟主 agent 协作。像"需求拆解员""测试员"。

简单判断：流程固定、不需要交互 → skill；需要判断、跟主 agent 配合 → agent。

### Q：一个流程不确定做成 skill 还是 agent，怎么办？

先不做。等这个流程跑了 2-3 次、套路稳定了，再固化。固化时按上面的标准判断。
<!-- /source: project-base -->

---

## 七、workbench 特有：软链机制的具体实现

> workbench 是主项目，全局目录软链指向 workbench 的镜像目录。本节讲 workbench 怎么落地的。

### 软链结构

```
~/.config/opencode/skills/  →  D:\AI programs\workbench\.skills-mirror\skills\
~/.config/opencode/agents/  →  D:\AI programs\workbench\.skills-mirror\agents\
```

全局目录指向 workbench 的镜像目录，所以：
- **写全局 skill = 写 workbench 的 `.skills-mirror/skills/`**
- 全局 skill 跟 workbench 的 git 走，换电脑 git pull 即同步
- workbench.html 的"个人 Skills"页面展示的也是 `.skills-mirror/skills/` 下的内容

### 修改和删除（workbench 特有路径）

- 改 skill：直接改 `.skills-mirror/skills/[skill名]/SKILL.md`（全局软链指向这里）
- 删 skill：删 `.skills-mirror/skills/[skill名]/` 目录
- 删完后扫一遍 AGENTS.md、workbench.html 等，看有没有引用这个 skill 的地方，一并清理

### workbench 的 skill 构成

workbench 的 `.skills-mirror/skills/` 里既有 workbench 专属的 skill（如 douyin-script、douyin-script-review），也有其他项目用的 skill（如 zentao-story-import、weekly-report）。统一放这里，通过 description 关键词区分触发，不靠目录位置区分。

---

*规则目录 · 通用部分基于 project-base 地基包（第一至六节），workbench 特有实现见第七节*
