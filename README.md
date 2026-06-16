<img width="1337" height="1337" alt="AnimAIOS" src="https://github.com/user-attachments/assets/af5d86f7-c826-4d16-9497-1f1b2d9016cb" />

<!--
<p align="center">
  <br>
  <a href="https://app.deepsource.com/gh/airi-os/core/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/airi-os/core.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <a href="https://app.deepsource.com/gh/airi-os/core/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/airi-os/core.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <br>
  <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20awesome%20people%20counter&countColor=%23263759&style=flat" /></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
  <a href="https://app.deepsource.com/gh/airi-os/core/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/airi-os/core.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <br>
</p>
-->


<div align="center">
<h4>

A container of souls — cyber beings, waifus, and digital humans living 24/7 on your Linux machine.

AnimAIOS is focused on creating a desktop-native, agentic AI OS centered around your companion: a zero-config experience where you paste a free API key and 🚀

</h4>
</div>


---

## 🌙 The Vision: AnimAIOS

Our goal is a Linux desktop experience where your AI companion acts as the center of your desktop environment:

- **Always-Present Stage:** Your character lives on your desktop so she is always in control! She can open, close and switch between windows and most importantly read text in those windows through accessibility tools, not just rely on screenshotting everything~
- **System Integration:** Hooks fully into the system, from basic stuff like notifications and global shortcuts to fully managing your terminal!
- **Context Awareness:** Your companion observes desktop activity to respond and interact proactively and she might even take control if you let her (agentic mode)
- **Modular Stage Layouts:** GTK3/4 widgets, interactively generated backgrounds through artistry module, and window layouts composed dynamically by the character (she will always be on screen most of the time)

## 🧩 [AnimAIOS Code Module](https://github.com/animaios/code)

<details>
<summary><strong>Expand to learn about the Code module (formerly Roo Code fork)</strong></summary>

### What It Is

The **AnimAIOS Code module** (`modules/code`) is a fork of [Roo Code](https://roocode.com) re-architected into a **standalone VS Code / Codium / Code-server extension** — a complete, independent product. All five modes (Spec, Vibe, Boss, Ask, Debug) are fully functional in the extension today.

### Relationship to AIRI

AIRI does not control Roo. The interaction model is:

- **Normal mode**: User chats with AIRI directly. No Roo visible.
- **Hacking Mode**: Roo activates **inside** the AIRI interface. The AIRI chatbox becomes the Roo interface. User messages go to Roo (processed as if typed in VS Code). Roo's periodic summaries flow back to AIRI for TTS narration.
- AIRI is the host. Roo is the coding brain that AIRI activates on demand.

The Code module also works **standalone** in VS Code / Codium / Code-server — no AIRI needed. Hacking Mode is an optional integration on top.

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

### What's Implemented in the Extension

The VS Code extension (parent repo + submodule) provides the full experience:

| Feature | Status |
|---------|--------|
| **Spec mode** (Kiro-style planning) | ✅ Fully functional in extension |
| **Vibe mode** (flow-state implementation) | ✅ Fully functional in extension |
| **Boss mode** (read-only coordinator) | ✅ Fully functional in extension |
| **Ask mode** (technical Q&A) | ✅ Fully functional in extension |
| **Debug mode** (systematic debugging) | ✅ Fully functional in extension |
| **Built-in tools** (read, list, search, diff) | ✅ Implemented in submodule |
| **Workspace/session management** | ✅ Implemented in submodule |
| **Streaming events** | ✅ Implemented in submodule |
| **Patch generation** | ✅ Implemented in submodule |
| **Repository indexing** | ✅ Implemented in submodule |

### Future Direction

These are planned enhancements on top of the existing extension:

| Feature | Status |
|---------|--------|
| **Multi-agent swarms** | Interface stubs (`IDaemon`, `IAgent`, `ICoordinator`) |
| **Semantic memory integration** | Planned, not started |
| **Autonomous background workers** | Planned, not started |
| **Filesystem/Git/Terminal capabilities** | Path-validation helpers exist, but no `ToolCapability` implementations registered |
| **Hacking Mode** (integrated terminal-native coding) | Planned, not started |

### The Five Modes

All five modes are **fully functional in the VS Code extension**:

| Mode | Slug | Role |
|------|------|------|
| 🧠 **Spec** | `spec` | Kiro-style spec-driven planning. Converts vague intent into structured requirements, design docs, and actionable task lists. Asks clarifying questions before any code is written. |
| ✨ **Vibe** | `vibe` | Flow-state implementation mode. Less formal, rapid iteration, code-focused. Gets your spec'd work done. Has full read/write/terminal access. |
| 🕴️ **Boss** | `orchestrator` | Read-only coordinator. Explores the codebase (files, search, MCP), decomposes complex tasks, and delegates all implementation to Vibe. **No terminal. No write access.** |
| ❓ **Ask** | `ask` | Technical Q&A and explanations without making changes. |
| 🪲 **Debug** | `debug` | Systematic debugging — diagnoses root causes before applying fixes. |

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

### Hosting Model: VS Code Extension (First-Class ✅)

The Code module is a **full standalone VS Code / Codium / Code-server extension** — not a temporary constraint, but a first-class, permanently supported hosting experience.

Every push to `main` triggers a **nightly build** of the extension:

> 🌙 **Nightly Extension** — [Download the latest build](https://github.com/animaios/code/releases) | [Build badge](https://github.com/animaios/code/actions)

The extension gives you the complete Roo Code experience — all five modes (Spec, Vibe, Boss, Ask, Debug), the full tool suite, and the complete orchestration pipeline — inside your IDE of choice.

### Hacking Mode: Roo Inside AIRI

On top of the standalone extension, AnimAIOS is building a **hybrid interaction model**:

1. **Normal mode**: User chats with AIRI directly. No Roo visible. AIRI is the companion.
2. **Hacking Mode**: Roo activates **inside** the AIRI interface. The AIRI chatbox becomes the Roo interface — user sees Roo exactly as it appears in VS Code.
3. User messages go to Roo, which processes them as if typed in VS Code. Roo's periodic summaries flow back to AIRI for TTS narration.
4. AIRI is the host. Roo is the coding brain that AIRI activates on demand.

> In short: AIRI is your companion. When you need to code, Hacking Mode brings Roo inside AIRI's interface — same Roo, same interface, now hosted in AIRI.

The standalone extension remains the primary, fully supported way to use the Code module. Hacking Mode is an optional integration on top.

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
  <a href="https://github.com/animaios/airi/actions/workflows/ci.yml">
    <img src="https://github.com/animaios/airi/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://app.deepsource.com/gh/animaios/airi/" target="_blank">
    <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/airi.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <a href="https://app.deepsource.com/gh/animaios/airi/" target="_blank">
    <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/airi.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
  </a>
  <a href="https://app.deepsource.com/gh/animaios/airi/" target="_blank">
    <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/airi.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
  </a>

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

---

## 🙏 Acknowledgements

- [`moeru-ai/airi`](https://github.com/moeru-ai/airi) project and [`dasilva333/airi`](https://github.com/dasilva333/airi) fork

  <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" /></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
