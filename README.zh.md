<h1 align="center">MiMoCode</h1>

<p align="center">
  <img src="assets/readme/mimocode-banner.png" alt="MiMoCode" width="700">
</p>

<p align="center"><strong>一个入口，连接 MiMoCode、AI Code Agent 与多 AI Provider。</strong></p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://mimo.xiaomi.com/zh/mimocode">官网</a> | <a href="https://mimo.xiaomi.com/zh/blog/mimo-code-long-horizon">博客</a>
</p>

---

## MiMo Code Desktop

本仓库将 MiMoCode 打包成可安装的 Electron 桌面端应用，并提供一个面向 AI 辅助开发的统一工作台。

AI 编程并不总是靠某一个模型或某一个 Agent 就能稳定解决所有问题。有时开发一个功能、修一个 bug 或做一次重构，当前 Agent 反复尝试都卡住了；但换一个大模型，甚至换一个 Code Agent，比如从 Codex 切到 Claude Code，问题突然就被解决了。真正让用户疲惫的是这些切换成本：不同 CLI、不同账号、不同模型配置，以及每次尝试新路径时重复搭环境。

MiMo Code Desktop 正是围绕这个痛点设计的。它让 MiMoCode 在日常开发中更方便地使用，同时把 Codex、Claude Code 等不同 AI 编程工具，以及多家 AI Provider 的入口收拢到一个工作台里。你可以从内置的 MiMo Auto 快速开始，也可以登录小米 MiMo 平台、导入已有 Claude Code 认证，或接入任意 OpenAI 兼容 Provider，按任务选择合适的模型能力。

通过一个桌面入口，你可以：

- 更顺手地使用 MiMoCode 完成本地开发任务
- 当当前模型或 Agent 卡住时，快速尝试另一条路径
- 在同一工作流中对比和接入 Codex、Claude Code 等 AI 编程工具
- 连接主流 AI Provider 与 OpenAI 兼容 API
- 将项目记忆、上下文重建、Agent 和任务进展贴近你的代码环境

```bash
bun install
bun run dev:desktop
bun --cwd packages/desktop build
bun --cwd packages/desktop package:mac
```

本地 macOS 构建产物会输出到 `packages/desktop/dist/`。V1 桌面端需求与实现说明见 `docs/desktop-spec.md` 和 `docs/implementation-plan.md`。

---

MiMoCode 是一个终端原生的 AI 编程助手。它能读写代码、执行命令、管理 Git，通过持久化记忆系统，在多次会话间保持对你项目的深度理解，并自我进化。

内置 MiMo Auto 限时免费通道，零配置即可开始使用。也支持接入各家主流 LLM Provider API 和 OpenAI 兼容自定义 Provider。

---

## 快速开始

```bash
# 一键安装
curl -fsSL https://mimo.xiaomi.com/install | bash

# 或通过 npm 安装
npm install -g @mimo-ai/cli
```

首次启动自动引导配置。支持：
- **MiMo Auto（限时免费）** — 匿名通道，零配置
- **小米 MiMo 平台** — OAuth 登录
- **从 Claude Code 导入** — 一键迁移已有认证
- **自定义 Provider** — TUI 内添加任意 OpenAI 兼容 API

---

## 核心特性

### 桌面 AI 编程工作台

MiMo Code Desktop 将 MiMoCode、外部编程助手和 AI Provider 放在同一个入口中。它适合不想在多个工具之间反复横跳、只想找到最适合当前问题的模型或 Agent 的开发者。你可以先用 MiMoCode 开始，需要时再对比 Codex、Claude Code 等工具，并把任务交给更合适的 Provider 或模型。

### 多智能体

| 智能体 | 说明 |
|--------|------|
| **build** | 默认。完整工具权限，用于开发 |
| **plan** | 只读分析模式，适合代码探索和方案设计 |
| **compose** | 编排模式，适合 specs-driven 开发和 Skill 驱动流程 |

按 `Tab` 在主智能体间切换。子智能体由系统按需生成。

### 持久化记忆

基于 SQLite FTS5 全文搜索的跨会话记忆：

- **项目记忆** (`MEMORY.md`) — 跨会话持久的项目知识、规则、架构决策
- **会话检查点** (`checkpoint.md`) — 结构化状态快照，由 checkpoint-writer 子智能体自动维护
- **笔记暂存** (`notes.md`) — Agent 临时记录区
- **任务进展** (`tasks/<id>/progress.md`) — 逐任务日志

记忆自动在会话恢复时注入上下文，agent 无需重新理解项目背景。

### 智能上下文管理

- **自动检查点** — 根据模型上下文窗口自动决定什么时候保存会话状态
- **上下文重建** — 当上下文接近上限时，从最新 checkpoint、项目记忆、任务进展和保留的近期消息重建上下文，让 agent 继续当前任务
- **预算化注入** — 用 token budget 控制 checkpoint / memory / notes 注入上下文的大小，按重要性排序

### 任务追踪

树状任务系统（T1, T1.1, T1.2…），自动与检查点系统联动，恢复会话时任务进度不丢失。

### 子智能体系统

主智能体可按需生成子智能体，共享当前会话上下文并行工作，支持生命周期追踪、取消机制和后台执行。

### Goal / 停止条件

`/goal` 命令为会话设置停止条件。当 agent 想停下来时，由独立裁判模型评估对话内容，判断条件是否真正满足——防止自主工作中的"乐观停止"。

### Compose 编排模式

Compose 模式提供结构化的 specs-driven 开发流程，内置规划、执行、代码审查、TDD、调试、验证、合并等技能——编排从 spec 到交付的完整开发生命周期。

### 语音输入

基于 TenVAD 和 MiMo ASR 的实时流式语音输入。通过 `/voice` 激活，按停顿分片转写，文本逐段追加到输入框。仅对 MiMo 登录用户可用。

### Dream & Distill

- **`/dream`** — 扫描近期会话轨迹，提取持久知识到项目记忆，清理过时条目
- **`/distill`** — 发现近期工作中重复的手动工作流，将高置信度候选打包成可复用的 skill、subagent 或 command

---

## 配置

通过项目目录下的 `.mimocode/mimocode.json`（或全局 `~/.config/mimocode/mimocode.json`）配置。主要选项包括：

- Provider 和模型选择
- Agent 权限和自定义 Agent
- 检查点和记忆行为
- MCP 服务器连接
- 快捷键和主题

Max Mode（并行 best-of-N 推理 + 裁判选优）可通过配置中的 `experimental.maxMode` 开启。

---

## 开发

```bash
bun install              # 安装依赖
bun run dev              # 开发模式运行
bun turbo typecheck      # 类型检查
```

---

## 与 OpenCode 的关系

MiMoCode 基于 [OpenCode](https://github.com/anomalyco/opencode) fork 构建，保留其全部核心能力（多 Provider、TUI、LSP、MCP、插件），并在此基础上构建了持久化记忆、智能上下文管理、子智能体编排、目标驱动的自主循环、Compose 工作流，以及通过 dream/distill 实现的自我进化。

---

## 社区

扫描二维码加入社区群聊：

<p align="center">
  <img src="assets/readme/community-qrcode.jpg" alt="社区群聊二维码" width="240">
</p>

---

## 许可证

MiMoCode 源代码可基于 [PolyForm Noncommercial License 1.0.0](./LICENSE)
进行非商业使用、修改和再分发。商业用途需要获得版权方另行出具的书面商业授权；
在将 MiMoCode 用于商业目的之前，请先联系项目维护者。

MiMoCode 基于 OpenCode 构建。上游 MIT 许可证声明已保留在 [NOTICE](./NOTICE)。

使用 MiMoCode 还需遵守[使用限制](./USE_RESTRICTIONS.md)。
使用小米 MiMo 托管服务须遵守 [MiMo 服务条款](https://platform.xiaomimimo.com/docs/terms/user-agreement)。
使用 MiMo 名称、标志和商标须遵守 MiMo 商标政策。
