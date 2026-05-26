---
title: Project AIRI 是什么？
description: 了解 Project AIRI 的定位、能力与上手方式
---

### 太长不看

Project AIRI 是一个开源的 AI VTuber / 数字伙伴项目。你可以把它理解为：

- 受 [Neuro-sama](https://www.youtube.com/@Neurosama) 启发的开源复刻方向；
- [Grok Companion](https://news.ycombinator.com/item?id=44566355) 这类数字陪伴产品的开源替代方案；
- 一个不只聊天，还支持 Live2D、VRM、语音、角色卡、游戏智能体和应用上下文感知的 [SillyTavern](https://github.com/SillyTavern/SillyTavern)（酒馆）延伸。

如果你想要的只是一个聊天机器人，Character.ai、JanitorAI、SillyTavern 已经能覆盖很多场景。AIRI 想推进的是另一件事：让一个虚拟角色真正「住」进你的电脑、浏览器或移动设备里，能说话、能听见、能显示自己的身体，也能逐步接入游戏、直播、Discord、Telegram、MCP 工具和本地模型。

换句话说，AIRI 不只是一个聊天界面，而是在尝试把大模型、语音、视觉、角色表现和外部工具连接成一个可扩展的数字生命容器。

## 可以做什么

今天你可以先把 AIRI 当作一个可配置的数字伙伴来使用：

- 通过 OpenAI 兼容接口、OpenRouter、DeepSeek、Ollama、Qwen、Gemini、Claude 等服务为她配置「大脑」；
- 使用角色卡定义名字、性格、说话方式和不同模块使用的模型；
- 在网页端直接开始聊天，也可以在桌面端让她以 Live2D 或 VRM 模型常驻屏幕；
- 配置语音合成、语音识别和说话检测，让交互从文字扩展到语音；
- 在桌面端使用系统托盘、窗口穿透、悬停淡化、移动和缩放等桌宠式交互；
- 通过源码运行或开发中的模块接入 Discord、Telegram、Minecraft、Factorio、MCP Server 等实验能力。

项目仍在快速演进中，稳定版本优先提供聊天、角色、模型显示和基础设置；更深入的游戏智能体、机器人、插件与本地运行能力正在持续开发。

## 为什么是 AIRI

很多 AI 角色项目把重点放在「更像角色地聊天」。AIRI 更关注角色如何进入真实环境：

- **身体**：支持 Live2D 和 VRM，目标是让角色拥有可互动的 2D / 3D 表现；
- **声音**：整合 TTS、STT、VAD 等能力，让角色可以开口、听见你说话，并判断你是否正在说话；
- **上下文**：桌面端和插件系统正在把应用状态、开发环境、游戏状态等上下文接入对话流程；
- **行动能力**：Minecraft、Factorio、Discord、Telegram 等服务侧模块展示了 AIRI 作为智能体参与外部世界的方向；
- **可移植性**：项目从一开始就大量使用 Web 技术，结合 WebGPU、WebAudio、Web Worker、WebAssembly、WebSocket 等能力，让网页、桌面和移动端可以共用很多基础设施。

这也是为什么仓库里同时有 `stage-web`、`stage-tamagotchi`、`stage-pocket`、`stage-ui`、`server-runtime`、`plugin-sdk` 等模块。AIRI 不是单一应用，而是一套围绕虚拟角色体验搭建的 monorepo：前端舞台、桌面运行时、移动端、共享 UI、服务通道、插件协议和智能体服务都在同一个项目里逐步成形。

## 开始使用

目前最容易上手的是网页端和桌面端。

<div flex gap-2 w-full justify-center text-xl>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:app-window />
    </div>
    <span>网页端</span>
    <a href="https://airi.moeru.ai/" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      打开
    </a>
  </div>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:laptop />
      /
      <div i-lucide:computer />
    </div>
    <span>桌面端</span>
    <a href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      下载
    </a>
  </div>
</div>

**网页端** 适合快速体验。打开浏览器，配置模型提供商和 API Key，就可以开始和 AIRI 对话。它也适合在移动设备上访问，或者用来体验 PWA 与浏览器内能力。

**桌面端** 适合长期使用和更完整的桌宠体验。它基于 Electron，可以让 AIRI 以 Live2D / VRM 模型常驻桌面，并提供系统托盘、窗口穿透、悬停淡化、本地模型接入、插件调试和更多实验功能。

**移动端**（`stage-pocket`）正在开发中，基于 Capacitor 复用 Web 舞台能力。现阶段如果你只是想在手机上尝试，优先使用网页端。

<div flex gap-2 w-full flex-col justify-center text-base>
  <a href="../manual/tamagotchi/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:laptop />
      </div>
      <span>桌面端</span>
    </div>
    <div decoration-none class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      如何使用？
    </div>
  </a>
  <a href="../manual/web/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:app-window />
      </div>
      <span>网页端</span>
    </div>
    <div class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      如何使用？
    </div>
  </a>
</div>

## 给开发者

AIRI 的主技术栈是 Vue 3、TypeScript、Vite、Pinia、VueUse、UnoCSS 和 Vitest。桌面端使用 Electron，移动端使用 Capacitor；跨进程通信和服务事件使用 `@moeru/eventa`，服务组合大量使用 `injeca`；模型与 LLM Provider 侧主要由 `xsai` 生态驱动。

常见入口如下：

- `apps/stage-web`：网页端，也就是 <https://airi.moeru.ai>；
- `apps/stage-tamagotchi`：桌面端，包含 Electron 主进程、渲染端、桌面窗口、插件宿主和服务通道；
- `apps/stage-pocket`：移动端实验应用；
- `packages/stage-ui`：网页端、桌面端和移动端共享的核心业务组件、设置页、stores 与 composables；
- `packages/stage-ui-three` 与 `packages/stage-ui-live2d`：3D / Live2D 舞台相关能力；
- `packages/server-runtime`、`packages/server-sdk`、`packages/server-shared`：服务通道和外部智能体连接；
- `services/discord-bot`、`services/telegram-bot`、`services/minecraft`：需要源码配置运行的服务侧实验模块。

如果你想贡献代码，可以从[贡献指南](../contributing/)开始；如果你想改进界面，请先阅读[设计指南](../contributing/design-guidelines/resources)。

::: warning 实验性功能与早期开发声明
Project AIRI 仍处于活跃开发阶段。发布版会优先保证基础体验；一些高级能力，例如 Minecraft 智能体、Discord / Telegram 机器人、Factorio、插件宿主、MCP、computer-use、更完整的长期记忆等，可能还需要从源码配置、运行或参与开发。

如果你希望体验这些功能，请参考[贡献指南](../contributing/)和对应服务文档。
:::
