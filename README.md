# Mimo Code Desktop

**A desktop workspace for running multiple coding tools and connecting multiple AI providers.**

[中文](./README.zh.md) | English

## Overview

Mimo Code Desktop is a new AI coding workspace for developers who want one place to launch, compare, and coordinate different programming tools. Modern AI-assisted development is not solved by one model, one CLI, or one agent. A task that blocks one tool may be solved quickly by another, and provider choice often matters as much as prompt quality.

This project is designed around that reality. It provides a desktop-first environment where coding agents, terminal tools, local commands, MCP integrations, and model providers can work together in one development flow.

Use it as:

- A desktop entry point for AI-assisted coding
- A control surface for multiple programming tools and coding agents
- A provider integration layer for mainstream LLM vendors and OpenAI-compatible APIs
- A local workspace for project context, task progress, checkpoints, and repeatable workflows

## Core Features

### Multiple Coding Tools

Connect and call different coding tools from one workspace. The goal is to make it easy to switch between agents, CLIs, local commands, and external tool integrations when the current path gets stuck or a different tool is better suited to the task.

### Multiple AI Providers

Configure and use different AI providers from the same project. Mimo Code Desktop is built for provider flexibility, including OpenAI-compatible endpoints and other model backends that can be routed through the workspace.

### Desktop Workflow

The Electron desktop app keeps AI coding work close to your editor and project files. It is intended for everyday development rather than one-off demos: inspect context, run tools, manage sessions, and keep progress visible.

### Project Context

The workspace is built to preserve useful project knowledge across sessions, including memory, task progress, checkpoints, and notes. This helps agents resume work without repeatedly relearning the same repository.

### Agent-Oriented Development

The underlying system supports agent modes, subagents, tool permissions, MCP servers, and autonomous development loops. These pieces make it possible to break down larger tasks while keeping the work grounded in the local codebase.

### Extensible Configuration

Project and user configuration can control provider selection, models, agent behavior, permissions, MCP connections, keybindings, and other workflow details.

## Quick Start

Install dependencies:

```bash
bun install
```

Run the desktop app in development mode:

```bash
bun run dev:desktop
```

Run the terminal coding experience:

```bash
bun run dev
```

Build the desktop app:

```bash
bun --cwd packages/desktop build
bun --cwd packages/desktop package:mac
```

Local macOS builds are written to `packages/desktop/dist/`.

## Configuration

Project configuration lives under the repository configuration directory and can be extended for local workflows. Common configuration areas include:

- AI provider and model selection
- OpenAI-compatible custom endpoints
- Coding tool and agent permissions
- MCP server connections
- Checkpoint, memory, and context behavior
- Keybindings and theme settings

## Development

Useful commands:

```bash
bun install
bun run dev:desktop
bun run dev
bun --cwd packages/desktop typecheck
```

Type checks and tests should be run from the relevant package directory rather than the repository root.

## Relationship to OpenCode

Mimo Code Desktop builds on [OpenCode](https://github.com/anomalyco/opencode) and preserves upstream license notices in [NOTICE](./NOTICE). This project extends that foundation with a desktop-focused workflow, multi-tool coordination, provider integration, persistent project context, and agent-oriented development features.

## License

Copyright (c) 2026 Carp Choi.

This project is available for noncommercial use under the [PolyForm Noncommercial License 1.0.0](./LICENSE). Commercial use is not permitted without separate written permission from Carp Choi.
