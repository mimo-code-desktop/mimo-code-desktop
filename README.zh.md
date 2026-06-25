# Mimo Code Desktop

**一个桌面端 AI 编程工作台，用来调用多种编程工具，并集成多种 AI Provider。**

中文 | [English](./README.md)

## 项目简介

Mimo Code Desktop 是一个全新的 AI 编程工作台，面向希望在同一个入口中启动、对比和协调不同编程工具的开发者。AI 辅助开发并不总是由某一个模型、某一个 CLI 或某一个 Agent 稳定解决。一个任务可能在当前工具里卡住很久，但换成另一个工具、模型或 Provider 后很快推进。

这个项目就是围绕这种真实开发场景设计的。它提供桌面端优先的工作环境，让 Coding Agent、终端工具、本地命令、MCP 集成以及不同模型供应商可以进入同一个开发流程。

你可以把它用作：

- AI 辅助编程的桌面入口
- 多种编程工具和 Coding Agent 的统一控制台
- 主流 LLM Provider 与 OpenAI 兼容 API 的集成层
- 保存项目上下文、任务进展、检查点和可复用工作流的本地工作区

## 核心能力

### 多编程工具调用

在同一个工作台中连接并调用不同的编程工具。目标是在当前路径卡住，或某个任务更适合另一个工具时，可以更快地切换到不同 Agent、CLI、本地命令或外部工具集成。

### 多 AI Provider 集成

在同一个项目中配置和使用不同 AI Provider。Mimo Code Desktop 面向 Provider 灵活性设计，支持接入 OpenAI 兼容端点，也可以扩展到其他模型后端。

### 桌面端工作流

Electron 桌面应用让 AI 编程能力贴近编辑器和项目文件。它面向日常开发，而不是一次性演示：查看上下文、运行工具、管理会话，并让任务进展保持可见。

### 项目上下文

工作台会围绕项目保存跨会话有用信息，包括记忆、任务进展、检查点和临时笔记。这样 Agent 恢复工作时，不需要反复重新理解同一个仓库。

### Agent 驱动开发

底层系统支持 Agent 模式、子 Agent、工具权限、MCP Server 和自主开发循环。这些能力可以帮助拆解更大的任务，同时让工作始终落在本地代码库里。

### 可扩展配置

项目配置和用户配置可以控制 Provider 选择、模型、Agent 行为、权限、MCP 连接、快捷键以及其他工作流细节。

## 快速开始

安装依赖：

```bash
bun install
```

以开发模式运行桌面端：

```bash
bun run dev:desktop
```

运行终端编程体验：

```bash
bun run dev
```

构建桌面端：

```bash
bun --cwd packages/desktop build
bun --cwd packages/desktop package:mac
```

本地 macOS 构建产物会输出到 `packages/desktop/dist/`。

## 配置

项目配置位于仓库配置目录中，并可按本地工作流扩展。常见配置包括：

- AI Provider 和模型选择
- OpenAI 兼容自定义端点
- 编程工具和 Agent 权限
- MCP Server 连接
- 检查点、记忆和上下文行为
- 快捷键和主题设置

## 开发

常用命令：

```bash
bun install
bun run dev:desktop
bun run dev
bun --cwd packages/desktop typecheck
```

类型检查和测试应从对应 package 目录运行，不要从仓库根目录直接运行。

## 与 OpenCode 的关系

Mimo Code Desktop 基于 [OpenCode](https://github.com/anomalyco/opencode) 构建，并在 [NOTICE](./NOTICE) 中保留上游许可证声明。本项目在此基础上扩展桌面端工作流、多工具协调、Provider 集成、持久项目上下文以及 Agent 驱动开发能力。

## 许可证

Copyright (c) 2026 Carp Choi.

本项目基于 [PolyForm Noncommercial License 1.0.0](./LICENSE) 提供非商业使用授权。未经 Carp Choi 另行书面许可，不允许商业使用。
