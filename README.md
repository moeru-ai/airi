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

The **AnimAIOS Code module** (`modules/code`) is a fork of [Roo Code](https://roocode.com) re-architected into a **standalone browser-based AI coding assistant** — no IDE, no extension host, no VS Code dependency. The UI is a React SPA backed by a lightweight Fastify server that handles WebSocket streaming and LLM API calls.

### Relationship to AIRI

The Code module is a **standalone product** — it does not require AIRI. You can use it by itself in any browser.

Optionally, AIRI can embed the Code UI as a panel inside its Electron app ("Hacking Mode"):

- **Normal mode**: User chats with AIRI directly. No Code UI visible.
- **Hacking Mode**: The AIRI chatbox becomes the Code interface. User messages go to Code; Code's summaries flow back to AIRI for TTS narration.
- AIRI embeds Code via a BrowserView loading from `localhost:3210`.

### What's Implemented

The standalone app is fully functional today:

| Component | What It Does |
|-----------|-------------|
| **🌐 React SPA** | Chat UI, settings, history, 27+ provider configurations |
| **⚡ Fastify Backend** | WebSocket server, task lifecycle, state sync |
| **🤖 Task Runner** | Single-turn LLM calls via raw HTTP + SSE (no SDK deps) |
| **📋 Mode Definitions** | Full role definitions for all 5 modes (`spec`, `vibe`, `orchestrator`, `ask`, `debug`) |
| **🔄 WebSocket Bridge** | Protocol-compatible with ExtensionMessage / WebviewMessage |

### Running

```bash
cd apps/roo-code-standalone
npm install
npm run dev
```

Opens the UI at `http://127.0.0.1:3210`. Configure your provider in the Settings UI and start chatting.

### The Five Modes

| Mode | Slug | Role |
|------|------|------|
| 🧠 **Spec** | `spec` | Kiro-style spec-driven planning. Converts vague intent into structured requirements, design docs, and actionable task lists. |
| ✨ **Vibe** | `vibe` | Flow-state implementation mode. Rapid iteration, code-focused. |
| 🕴️ **Boss** | `orchestrator` | Read-only coordinator. Explores the codebase, decomposes tasks, delegates all implementation to Vibe. |
| ❓ **Ask** | `ask` | Technical Q&A and explanations without making changes. |
| 🪲 **Debug** | `debug` | Systematic debugging — diagnoses root causes before applying fixes. |

Philosophy: **"Spec before vibe."**

### How Boss Differs from Upstream Roo

In stock Roo Code, the orchestrator has broad access. AnimAIOS Boss is a **pure coordinator** — it explores, understands, plans, and then hands off every implementation action to Vibe. Boss never touches code directly.

### Architecture

```
Browser (React SPA)
  │  vscode.ts → window.__roo_bridge__ → WebSocket
  ↓
Backend (Fastify, port 3210)
  ├─ WebSocket handler (task lifecycle, state sync)
  ├─ Task runner (raw HTTP + SSE to LLM providers)
  ├─ State management (tasks Map + taskHistory with O(1) upsert)
  └─ Static file serving (built SPA)
```

### Roadmap

### Phase 1 (Current) — Standalone Q&A ✅
- Browser SPA with chat UI
- 27+ LLM providers via raw HTTP + SSE
- WebSocket bridge replacing vscode.postMessage
- Task history with token tracking

### Phase 2 — Tool Use
- Filesystem operations (read, write, search)
- Terminal (node-pty)
- Git operations
- Multi-turn conversations with tool calls

### Phase 3 — AIRI Integration
- BrowserView embedding in AIRI Electron
- IPC bridge (Code ↔ AIRI main process)
- Hacking Mode controller
- TTS narration of Code summaries

### Phase 4 — Polish
- API proxy (hide LLM keys from browser)
- SQLite persistence
- Theme system
- Auto-update mechanism

### Hacking Mode: Code Inside AIRI

On top of the standalone app, AnimAIOS is building a **hybrid interaction model**:

1. **Normal mode**: User chats with AIRI directly. No Code UI visible.
2. **Hacking Mode**: Code activates **inside** the AIRI interface via BrowserView. The AIRI chatbox becomes the Code interface.
3. User messages go to Code; Code's summaries flow back to AIRI for TTS narration.
4. AIRI is the host. Code is the coding brain that AIRI activates on demand.

> In short: AIRI is your companion. When you need to code, Hacking Mode brings Code inside AIRI's interface — same Code, same interface, now hosted in AIRI.

The standalone browser app remains the primary, fully supported way to use the Code module. Hacking Mode is an optional integration on top.

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
