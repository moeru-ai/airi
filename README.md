<h1 align="center">🏗️airiOS🚧</h1>

<p align="center">
  <a href="https://bafybeigwwctpv37xdcwacqxvekr6e4kaemqsrv34em6glkbiceo3fcy4si.ipfs.inbrowser.link/"><img src="https://api.visitorbadge.io/api/visitors?path=https%3A%2F%2Fgithub.com%2Fvi70x3%2Fairi&label=%F0%9F%92%93%20awesome%20people%20counter&countColor=%23263759&style=flat" /></a>
  <a href="https://discord.gg/TgQ3Cu2F7A"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdiscord.com%2Fapi%2Finvites%2FTgQ3Cu2F7A%3Fwith_counts%3Dtrue&query=%24.approximate_member_count&suffix=%20members&logo=discord&logoColor=white&label=%20&color=7389D8&labelColor=6A7EC2"></a>
  <a href="https://app.deepsource.com/gh/vi70x3/airiOS/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/vi70x3/airiOS.svg/?label=code+coverage&show_trend=true&token=KdX5anL-Ef3VD1ZhVGuhkZDp"/></a>
  <br>
  <a href="https://app.deepsource.com/gh/vi70x3/airiOS/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/vi70x3/airiOS.svg/?label=active+issues&show_trend=true&token=KdX5anL-Ef3VD1ZhVGuhkZDp"/></a>
  <a href="https://app.deepsource.com/gh/vi70x3/airiOS/" target="_blank"><img alt="DeepSource" title="DeepSource" src="https://app.deepsource.com/gh/vi70x3/airiOS.svg/?label=resolved+issues&show_trend=true&token=KdX5anL-Ef3VD1ZhVGuhkZDp"/></a>
</p>

<p align="center">A container of souls - cyber livings, waifu, digital humans - brought into your Linux machine.</p>

> [!TIP]
> This fork's focus is turning the Project AIRI vision into **the ultimate dream of creating baremetal desktop agentic OS centered around your AI companion**.

The original AIRI project provides a feature-rich foundation. This fork adopts a strict **KISS philosophy** to keep the codebase clean and cloud linter-friendly, with plans to transition to TDD.

While multi-platform compatibility is maintained, our primary optimization target is a lightweight Linux build. If you require broader cross-platform stability, please refer to [`dasilva333/airi`](https://github.com/dasilva333/airi) or [`moeru-ai/airi`](https://github.com/moeru-ai/airi).

<sup>**Note:** We aim to render AIRI directly as a desktop wallpaper on supported Linux compositors. If you have experience implementing desktop wallpapers for Windows or macOS (e.g., via Wallpaper Engine), contributions or issues are highly welcome!</sup>

---

## 🌙 The Vision: airiOS

Our goal is a Linux desktop experience where your AI companion acts as the center of your desktop environment (aka wallpaper):

- **Always-Present Stage:** Your character lives on your desktop, not in a floating window or browser tab.
- **System Integration:** Hooks into notifications, screen capture, and global shortcuts.
- **Context Awareness:** Your companion observes desktop activity to respond and interact proactively.
- **Modular Stage Layouts:** GTK3/4 widgets, interactive backgrounds, and window layouts composed dynamically by the character.

---

## 🐧 Features & Architecture

We build directly upon the core strengths of the original project and selectively rebase `dasilva333/airi` changes on latest upstream:

- - [ ] **Native Wayland Support:** Out-of-the-box integration using Ozone platform flags, PipeWire screen capture, and window decorations.
- - [ ] **AIRI Card System:** High-fidelity character management. Import/export native JSON or SillyTavern-compatible `chara_card_v2` PNGs. Features per-card model configurations and stage preferences.
- [ ] **Multi-Tab Card Editor:**
  - _Acting:_ Manage model expressions, speech mannerisms, and ACT tokens.
  - _Modules:_ Set specific speech engines, avatars, and models per character.
  - _Artistry:_ Native image generation pipelines (Replicate, ComfyUI).
  - _Proactivity:_ Define triggers for autonomous companion interactions.
- [ ] **Dynamic Stage Widgets:** Spawns and controls floating desktop widgets (weather, maps, or generic JSON payloads).
- [ ] **Optimized Audio Pipeline:** Low-latency speech path supporting OpenAI-compatible voice discovery.

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

### ⌨️ Building for Linux

```shell
cd apps/stage-tamagotchi
./build.sh           # Builds the .deb package in dist/
```

_(An optional PKGBUILD is located in `apps/stage-tamagotchi` to repackage the `.deb` into `.zst` for Arch/Manjaro/CachyOS)._

### ❔ Troubleshooting

**Electron build approvals (pnpm 10+):**

```shell
pnpm approve-builds # Select 'electron' and confirm
```

---

## 🚙 Roadmap

- [x] **Brain**
  - [ ] Multi-tier memory based on [openvault](https://github.com/vadash/openvault) design
  - [ ] Per-character memory scoping that works for multiple-character being preset at the stage, not gated by character card
- [x] **Heart**
  - [ ] Heartbeat (proactivity)
- [x] **Ears**
  - [x] Client-side speech recognition & talking detection
- [x] **Mouth**
  - [x] OpenAI-compatible speech providers
    - [ ] with voice discovery
- [x] **Body**
  - [x] VRM support
    - [ ] with expression controls, auto-blink, and auto-look-at
  - [x] Live2D support
    - [ ] with expression-oriented tools
- [x] **Desktop Stage**
  - [ ] _Multiple characters sharing the stage_
  - [ ] Control Island with emotions, favorites, and idle-loop cycling
  - [ ] Widget system (weather, map, generic JSON) (to be converted to GTK)
  - [ ] Scene/background management per character
  - [ ] Window snapping and position persistence (this fork adapts single-window philosophy)
  - [ ] Native Wayland support
- [ ] **airiOS (WIP)**
  - [x] System tray & screen capture integration
  - [ ] Generate and open native GTK3/4 windows instead of web widgets
  - [ ] [computer-use-linux](https://github.com/vi70x3/computer-use-linux) integration
  - [ ] [AiRoo Code](https://github.com/vi70x3/airoo) integration
    - [ ] Send recent AiRoo context snapshot with each AIRI heartbeat
  - [ ] Render AIRI as wlroots wallpaper if compatible compositor detected
  - [ ] AIRI chatbox integration as a system terminal with natural language detection
- [ ] **Misc**
  - [ ] DeepSource pass with 0 issues
  - [ ] LCov > 90% -> switch to TDD
  - [ ] Natural terminal command detection (similar to Warp terminal)
  - [ ] Add more providers to xsai
  - [ ] Add providers/mcp/skills via natural language prompts

---

## 🤖 LLM API Providers

### Supported providers: everything [xsai](https://github.com/vi70x3/xsai) supports

---

## 🙏 Acknowledgements

- Original [moeru-ai/airi](https://github.com/moeru-ai/airi) project and [dasilva333/airi](https://github.com/dasilva333/airi) fork
- [Reka UI](https://github.com/unovue/reka-ui) - UI components
- [xsai](https://github.com/moeru-ai/xsai) - LLM interaction layer
