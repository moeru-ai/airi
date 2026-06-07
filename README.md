<h1 align="center">airiOS - Core</h1>


<p align="center">
  <img width="256" height="384" alt="airiOS mascot" src="https://github.com/user-attachments/assets/cc79352b-4700-4866-bb19-e55e7d9f9010" />
  <br>
  <a href="https://app.deepsource.com/gh/airi-os/core/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/airi-os/core.svg/?label=active+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <a href="https://app.deepsource.com/gh/airi-os/core/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/airi-os/core.svg/?label=resolved+issues&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <br>
  <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20awesome%20people%20counter&countColor=%23263759&style=flat" /></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
  <a href="https://app.deepsource.com/gh/airi-os/core/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/airi-os/core.svg/?label=code+coverage&show_trend=true&token=yTvvPDBOWhW0W3B7NowDRXo2"/></a>
  <br>

</p>

<div align="center">

A container of souls - cyber livings, waifu, digital humans - brought into your Linux machine.

This fork's focus is **creating desktop-native agentic OS centered around your AI companion**.

</div>

---

## 🌙 The Vision: airiOS

Our goal is a Linux desktop experience where your AI companion acts as the center of your desktop environment:

- **Always-Present Stage:** Your character lives on your desktop so she is always in control! She can open, close and switch between windows and most importantly read text in those windows through accessibility tools, not just rely on screenshotting everything~
- **System Integration:** Hooks into system fully, from basic stuff like notifications and global shortcuts to fully managing your terminal!
- **Context Awareness:** Your companion observes desktop activity to respond and interact proactively and she might even take control if you let her (agentic mode)
- **Modular Stage Layouts:** GTK3/4 widgets, interactively generated backgrounds through artistry module, and window layouts composed dynamically by the character (she will always be on screen most of time)

---

## 🖥️ Development

### ☕ Prerequisites

- Node.js >= 20.14.0
- pnpm >= 10.0.0

### 🖱️ Quick Start

```shell
pnpm i
pnpm dev:tamagotchi
```
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

---

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
- [ ] **airiOS (WIP)**
  - [x] System tray & screen capture integration
  - [ ] Generate and open native GTK3/4 windows instead of web widgets
  - [ ] [airiOS Linux API](https://github.com/airi-os/api-linux) integration
  - [ ] [airiOS Code](https://github.com/airi-os/code) integration
    - [ ] Send recent airiOS Code context snapshot with each AIRI heartbeat
  - [ ] AIRI chatbox doubles as a system terminal with natural language detection
- [ ] **Misc**
  - [ ] DeepSource pass with 0 issues
  - [ ] LCov > 90% -> switch to TDD
  - [ ] Natural terminal command detection (similar to Warp terminal)
  - [ ] Add providers/mcp/skills via natural language prompts
  - [ ] Native Wayland Support using Ozone platform flags

---

## 🤖 LLM API Providers

- [x] Supported providers: everything [xsai](https://github.com/moeru-ai/xsai) supports
- [ ] Planned airiOS [localhost](https://github.com/airi-os/api-llm-localhost) and [cloud](https://github.com/airi-os/api-llm-cloud) LLM API layers integration to replace default AIRI provider, good source of almost limitless free yummy tokens for your cyber waifus~

---

## 🙏 Acknowledgements

- [`moeru-ai/airi`](https://github.com/moeru-ai/airi) project and [`dasilva333/airi`](https://github.com/dasilva333/airi) fork

