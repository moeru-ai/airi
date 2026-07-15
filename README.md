<img width="1314" height="1197" alt="anima-banner-v2" src="https://github.com/user-attachments/assets/58182d60-ecb8-4e12-86e5-e5bff72071cc" />

<div align="center">
<h3>Anima is an agentic AI desktop OS built around your digital companion</h3>
<sub>

💙🐧 AnimAIOS distro based on [EndeavourOS](https://endeavouros.com/) coming this fall! with all packages auto-optimized for your CPU using [CachyOS](https://packages.cachyos.org/) repos

</sub>
</div>

---

## 🌙 The Vision

- **Always-Present Stage:** Your character lives on your desktop! She can open, close and switch between windows and most importantly read text in those windows through accessibility integration~
- **System Integration:** Hooks fully into the system, from basic stuff like notifications to fully managing your Linux via terminal in Agentic Mode
- **Context Awareness:** Your companion observes desktop activity to respond and interact proactively and she can also assume full desktop control in Agentic Mode
- **Modular Stage Layouts:** GTK3/4 widgets, interactively generated backgrounds through artistry module, and window layouts composed dynamically by characters

## 🖥️ Development
  <a href="https://github.com/animaios/Anima/actions/workflows/ci.yml">
    <img src="https://github.com/animaios/Anima/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://animaios.github.io/anima">
    <img src="https://img.shields.io/badge/docs-animaios.github.io/anima-blue" alt="Docs">
  </a>
  <br>
  <a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
    <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
    <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
  </a>
  <a href="https://app.deepsource.com/gh/animaios/Anima/" target="_blank">
    <img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/animaios/Anima.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/>
  </a>
  <img width="1444" height="1089" alt="anima-banner" src="https://github.com/user-attachments/assets/575a8549-d5a5-4b98-af05-0c8be745c611" />

### ☕ Prerequisites

- pnpm
- Node.js (Electron app)
- Rust (Tauri app)

### 🖱️ Quick Start

The current recommended desktop app is still the Electron version in `apps/stage-tamagotchi/`, while the Tauri port is actively being built in `apps/stage-tauri/`.

🍎🐧🪟 Electron desktop app:

```shell
pnpm i
pnpm dev:tamagotchi
```

🍎🐧 Tauri desktop app:

```shell
pnpm i
cd apps/stage-tauri
./init.sh
cargo tauri dev
```

`./init.sh` checks the local Tauri scaffold, Rust toolchain, `cargo-tauri` CLI, and runs `cargo check`. Install the Tauri CLI first if needed:

```shell
cargo install tauri-cli --version '^2.0'
```

### ❔ Why Tauri

Tauri lets us keep the Vue 3 renderer and AIRI companion experience while replacing the Electron main process with a smaller Rust backend. That means lower idle memory use, smaller native bundles, better Linux desktop integration, and a cleaner path to shipping AIRI as a native mobile app.

The same migration is also our path to native Android and iOS AIRI builds over the next few months.

<!--
### ⌨️ Building for Linux (under construction)

```shell
cd apps/stage-tamagotchi
./build.sh           # Builds the .deb package in dist/
```

_(An optional PKGBUILD is located in `apps/stage-tamagotchi` to repackage the `.deb` into `.zst` for Arch/Manjaro/CachyOS)._
-->

## 🌸 Project activity

[![Organization Heatmap](https://raw.githubusercontent.com/animaios/anima/refs/heads/main/docs/content/public/assets/org-heatmap.svg)](https://github.com/orgs/animaios/repositories)

## 🚙 Roadmap

- [x] **Brain**
  - [x] _Artistry:_ Native image generation pipelines (Replicate, ComfyUI)
  - [ ] _Proactivity:_ Define triggers for autonomous companion interactions (heartbeats)
  - [ ] _Multi-tier memory:_ [AnimaVault](https://github.com/animaios/animavault)
    - [ ] _Per-character memory scoping_ that works with witnesses (multiple-character sharing the screen)
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
  - [ ] Multiple characters sharing the screen (KISS 1 window per character)
  - [ ] Scene/background management per character
- [ ] **AnimAIOS (WIP)**
  - [x] System tray & screen capture integration
  - [ ] Generate native GTK3/4 windows instead of web widgets
  - [ ] [AnimAIOS Linux MCP](https://github.com/animaios/linux-mcp) deep integration
    - [ ] Send recent context snapshot with each AIRI heartbeat
  - [ ] AIRI chatbox doubles as a system terminal with natural language detection (similar to Warp terminal)
- [ ] **Misc**
  - [ ] DeepSource pass with 0 issues
  - [ ] LCov > 90% -> switch to TDD
  - [ ] Add mcp/skills via natural language prompts
  - [ ] Native Wayland Support using Ozone platform flags

## 🤖 LLM API Providers

- [x] Supported providers: everything [xsai](https://github.com/moeru-ai/xsai) supports
- [ ] Planned [AnimaRouter](https://github.com/animaios/animarouter)-based gamified energy system integration that will replace official AIRI provider, a limitless source of free yummy tokens for your cyber waifus~ Or just clone AnimaRouter and host it yourself with BYOK! UI will allow easy switch between hosted/localhost AnimaRouter providers!

---

## 🙏 Acknowledgements

- [`moeru-ai/airi`](https://github.com/moeru-ai/airi) project and [`dasilva333/airi`](https://github.com/dasilva333/airi) fork

  <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20my%20little%20clicks%20counter&countColor=%23263759&style=flat" alt="Visitor counter" /></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2" alt="Discord member count"></a>
