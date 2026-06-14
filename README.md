<img width="1337" height="1337" alt="AnimAIOS" src="https://github.com/user-attachments/assets/af5d86f7-c826-4d16-9497-1f1b2d9016cb" />

<div align="center">
<h4>

A container of souls — cyber beings, waifus, and digital humans living 24/7 on your Linux machine.

AnimAIOS is focused on creating a desktop-native, agentic AI OS centered around your companion: a zero-config experience where you paste a free API key and 🚀

</h4>
</div>

## 🌙 The Vision: AnimAIOS

Our goal is a Linux desktop experience where your AI companion acts as the center of your desktop environment:

- **Always-Present Stage:** Your character lives on your desktop so she is always in control! She can open, close and switch between windows and most importantly read text in those windows through accessibility tools, not just rely on screenshotting everything~
- **System Integration:** Hooks fully into the system, from basic stuff like notifications and global shortcuts to fully managing your terminal!
- **Context Awareness:** Your companion observes desktop activity to respond and interact proactively and she might even take control if you let her (agentic mode)
- **Modular Stage Layouts:** GTK3/4 widgets, interactively generated backgrounds through artistry module, and window layouts composed dynamically by the character (she will always be on screen most of the time)

## 🧩 AnimAIOS Code Module

<details>
<summary><strong>Expand to learn about the Code module (formerly Roo Code fork)</strong></summary>

### What It Is

The **AnimAIOS Code module** (`modules/code`) is a fork of [Roo Code](https://roocode.com) being re-architected from a standalone AI coding assistant into the **spec-driven, async-orchestrated coding brain** of the AnimAIOS companion OS.

### Current Status: Alpha ⚠️

The module is in **alpha**: the foundational tooling and infrastructure are implemented and functional, but the higher-level orchestration modes (Spec, Boss, Vibe) and AI integration are **not yet runnable features**. What exists today is a solid library of low-level building blocks — think of it as an operating system for coding agents that hasn't yet booted its first process.

### What's Implemented

These components have real, working logic and can be used right now:

| Component | What It Does |
|-----------|-------------|
| **🔧 Built-in Tools** | `read_file` (slice + indentation modes, binary detection), `list_files` (recursive, skip dirs), `search_files` (regex across workspace), `apply_diff` (unified diff + SEARCH/REPLACE) |
| **📁 Workspace Management** | Per-task workspace sessions with temp-dir sandboxing, deterministic cleanup, git worktree creation |
| **📡 Streaming** | Bounded per-task event buffers, subscribe/unsubscribe, reconnect-safe replay |
| **🩹 Patch Generation** | LCS-based unified diff generation, patch proposal creation, patch application |
| **🔍 Repository Indexing** | Content-hashed incremental re-indexing, structural map building (file graph, import edges) |
| **🧠 Capability System** | Generic `CapabilityRegistry<T>`, typed `ToolCapability` interface, `CodeToolExecutor` with validation + timeout + cancellation |
| **📋 Mode Definitions** | Full role definitions and custom instructions for all 5 modes (`spec`, `vibe`, `orchestrator`, `ask`, `debug`) |

### What's Stubbed / Not Yet Implemented

These are architectural directions with interfaces defined but no runnable logic:

| Feature | Status |
|---------|--------|
| **Spec mode** (Kiro-style planning) | Mode definition only — no spec workflow executor |
| **Vibe mode** (flow-state implementation) | Mode definition only — no implementation engine |
| **Boss mode** (read-only coordinator) | Mode definition only — no delegation/orchestration logic |
| **Multi-agent swarms** | Interface stubs (`IDaemon`, `IAgent`, `ICoordinator`) |
| **Semantic memory integration** | Planned, not started |
| **Autonomous background workers** | Planned, not started |
| **Filesystem/Git/Terminal capabilities** | Path-validation helpers exist, but no `ToolCapability` implementations registered |

### The Five Modes

| Mode | Slug | Role | Status |
|------|------|------|--------|
| 🧠 **Spec** | `spec` | Kiro-style spec-driven planning. Converts vague intent into structured requirements, design docs, and actionable task lists. | 📝 Definition only |
| ✨ **Vibe** | `vibe` | Flow-state implementation mode. Rapid iteration, code-focused. Full read/write/terminal access. | 📝 Definition only |
| 🕴️ **Boss** | `orchestrator` | Read-only coordinator. Explores codebase, decomposes tasks, delegates to Vibe. **No terminal. No write access.** | 📝 Definition only |
| ❓ **Ask** | `ask` | Technical Q&A without making changes. | 📝 Definition only |
| 🪲 **Debug** | `debug` | Systematic debugging and root-cause analysis. | 📝 Definition only |

Philosophy: **"Spec before vibe."**

### How Boss Differs from Upstream Roo

In stock Roo Code, the orchestrator has broad access — it can read, write, run terminal commands, and execute tools directly. AnimAIOS has **restored the original Boomerang form**:

| | Upstream Roo Orchestrator | AnimAIOS Boss |
|---|---|---|
| **File reads** | ✅ | ✅ |
| **Search / MCP** | ✅ | ✅ |
| **Terminal** | ✅ | ❌ |
| **File writes** | ✅ | ❌ |
| **Tool execution** | ✅ | ❌ |
| **Delegates to Vibe** | Optional | **Always** |

Boss is a **pure coordinator** — it explores, understands, plans, and then hands off every implementation action to Vibe. This enforces a clean separation of concerns: Boss never touches code directly.

### Architecture Direction

The module is being re-architected from stock Roo Code toward:

- **Backend-first orchestration** — decoupled frontend, async pipelines, resumable sessions
- **Multi-agent swarms** — specialized modes with clear delegation, not monolithic prompts
- **Worktree/task isolation** — parallel subtasks run in isolated git worktrees
- **Semantic memory integration** — persistent context across sessions (planned)
- **Autonomous background workers** — tasks continue even when you step away

### Current Hosting Model (Transitional ⚠️)

The Code module **currently requires a VS Codium / VS Code / Code-server host extension** to run. This is a temporary constraint.

### The Target Model: Integrated Hacking Mode

The long-term direction is a **fully integrated experience** where:

1. The former Roo Code logic **dynamically replaces stock AIRI logic** when the user enables **Hacking Mode**
2. The AIRI chatbox **doubles as a system terminal** — similar to [Warp](https://www.warp.dev/) with natural language command detection
3. When the system detects coding-related activity (file edits, git operations, project context), it **dynamically involves the ex-Roo subsystem** (Spec → Boss → Vibe)
4. No separate IDE needed — the terminal *is* the coding environment

> In short: your AI companion reads your screen, detects when you're coding, and seamlessly spins up the spec-driven workflow without you ever opening an external editor.

### Key Files

- `packages/types/src/mode.ts` — mode definitions, role definitions, and custom instructions
- `tools/builtins/` — fully implemented tool capabilities (read_file, list_files, search_files, apply_diff)
- `workspace/` — workspace session management and handle
- `capabilities/` — capability types, adapter, and path-validation helpers
- `streaming/` — event streaming infrastructure
- `patches/` — diff generation and patch proposals
- `indexing/` — repository scanner with content hashing
- `src/core/` — core type stubs (module, capabilities, tasks, events, workspace, memory)

### Relationship to AnimAIOS Core

The Code module is a **git submodule** (`modules/code`) pointing to [`animaios/code`](https://github.com/animaios/code). The parent repo tracks a specific commit and bumps it as the module evolves.

</details>

## 🖥️ Development

  <a href="https://app.deepsource.com/gh/animaios/airi/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/airi.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <a href="https://app.deepsource.com/gh/animaios/airi/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/airi.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <a href="https://app.deepsource.com/gh/animaios/airi/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/airi.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>

### ☕ Prerequisites

- Node.js >= 20.14.0
- pnpm >= 10.0.0

### 🖱️ Quick Start

```shell
pnpm i
pnpm dev:tamagotchi
```
<img width="256" height="384" alt="AnimAIOS mascot" src="https://github.com/user-attachments/assets/0d048b16-c5f2-4d9a-8735-ce1417256b22" />

<!--
### ⌨️ Building for Linux (under construction)

```shell
cd apps/stage-tamagotchi
./build.sh           # Builds the .deb package in dist/
```

_(An optional PKGBUILD is located in `apps/stage-tamagotchi` to repackage the `.deb` into `.zst` for Arch/Manjaro/CachyOS)._
-->
### ❔ Troubleshooting

**Electron build approvals (pnpm 10+):**

```shell
pnpm approve-builds # Select 'electron' and confirm
```

## 🚙 Roadmap

- [x] **Brain**
  - [x] _Artistry:_ Native image generation pipelines (Replicate, ComfyUI)
  - [ ] _Proactivity:_ Define triggers for autonomous companion interactions (heartbeat)
  - [ ] _Multi-tier memory_ based on [openvault](https://github.com/vadash/openvault) design
  - [ ] _Per-character memory scoping_ that works with multiple-character being preset at the stage (witnesses)
- [x] **Ears**
  - [x] Client-side speech recognition & talking detection
- [x] **Mouth**
  - [x] OpenAI-compatible speech providers with voice discovery
- [x] **Body**
  - [x] VRM support
    - [ ] LLM-driven expression controls, auto-blink and auto-look-at
    - [ ] LLM-driven emotions and idle-loops
  - [x] Live2D support
    - [ ] LLM-driven expression controls
- [x] **Desktop Stage**
  - [ ] Multiple characters sharing the stage (one window per character)
  - [ ] Widget system (to be converted to GTK)
  - [ ] Scene/background management per character
- [ ] **AnimAIOS (WIP)**
  - [x] System tray & screen capture integration
  - [ ] Generate and open native GTK3/4 windows instead of web widgets
  - [ ] [AnimAIOS Linux API](https://github.com/animaios/api-linux) integration
  - [ ] [AnimAIOS Code](https://github.com/animaios/code) integration
    - [ ] Send recent AnimAIOS Code context snapshot with each AIRI heartbeat
    - [ ] **Hacking Mode:** dynamically involve Code module (Spec → Boss → Vibe) when coding activity is detected
    - [ ] Remove the VS Codium / Code-server host requirement — terminal-native operation
  - [ ] AIRI chatbox doubles as a system terminal with natural language detection
- [ ] **Misc**
  - [ ] DeepSource pass with 0 issues
  - [ ] LCov > 90% -> switch to TDD
  - [ ] Natural terminal command detection (similar to Warp terminal)
  - [ ] Add providers/mcp/skills via natural language prompts
  - [ ] Native Wayland Support using Ozone platform flags

## 🤖 LLM API Providers

- [x] Supported providers: everything [xsai](https://github.com/moeru-ai/xsai) supports
- [ ] Planned AnimAIOS [localhost](https://github.com/animaios/api-llm-localhost) and (optional) [cloud](https://github.com/animaios/api-llm-cloud) LLM API routers integration to replace default AIRI provider, good source of almost limitless free yummy tokens for your cyber waifus~

## 🙏 Acknowledgements

- [`moeru-ai/airi`](https://github.com/moeru-ai/airi) project and [`dasilva333/airi`](https://github.com/dasilva333/airi) fork

  <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" /></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
