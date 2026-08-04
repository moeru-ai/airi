---
title: What is Project AIRI?
description: Understand the positioning, capabilities, and how to get started with Project AIRI
---


### TL;DR


Project AIRI is an open-source AI VTuber / digital companion project. You can think of it as:


- An open-source replication direction inspired by [Neuro-sama](https://www.youtube.com/@Neurosama);
- An open-source alternative to digital companion products such as [Grok Companion](https://news.ycombinator.com/item?id=44566355);
- A [SillyTavern](https://github.com/SillyTavern/SillyTavern) (tavern) extension that goes beyond chatting, supporting Live2D, VRM, voice, character cards, game agents, and application context awareness.


If all you want is a chatbot, Character.ai, JanitorAI, and SillyTavern already cover many use cases. What AIRI aims to advance is something different: letting a virtual character truly "live" in your computer, browser, or mobile device — able to speak, hear, display its own body, and progressively integrate with games, streaming, Discord, Telegram, MCP tools, and local models.


In other words, AIRI is not just a chat interface; it is an attempt to connect large language models, voice, vision, character presentation, and external tools into an extensible digital life container.


## What You Can Do


Today you can start using AIRI as a configurable digital companion:


- Configure her "brain" through OpenAI-compatible interfaces and services such as OpenRouter, DeepSeek, Ollama, Qwen, Gemini, and Claude;
- Use character cards to define the name, personality, speaking style, and the models used by different modules;
- Start chatting directly on the web, or keep her on your screen as a Live2D or VRM model on desktop;
- Configure text-to-speech, speech recognition, and voice activity detection to extend interaction from text to voice;
- Use desktop pet-style interactions on desktop, such as system tray, click-through windows, hover fade, move, and resize;
- Connect experimental capabilities such as Discord, Telegram, Minecraft, Factorio, and MCP Server by running from source or through modules under development.


The project is still evolving rapidly. Stable releases prioritize chat, characters, model display, and basic settings; deeper game agents, bots, plugins, and local runtime capabilities are under continuous development.


## Why AIRI


Many AI character projects focus on "chatting more like a character." AIRI focuses more on how characters enter the real environment:


- **Body**: supports Live2D and VRM, aiming to give characters interactive 2D / 3D presentation;
- **Voice**: integrates TTS, STT, VAD, and other capabilities so characters can speak, hear you, and detect whether you are speaking;
- **Context**: the desktop client and plugin system are bringing application state, development environment, and game state into the conversation flow;
- **Agency**: service-side modules such as Minecraft, Factorio, Discord, and Telegram demonstrate the direction of AIRI as an agent participating in the external world;
- **Portability**: the project has relied heavily on web technologies from the start, combining WebGPU, WebAudio, Web Worker, WebAssembly, WebSocket, and more, so the web, desktop, and mobile can share much of the infrastructure.


This is also why the repository contains modules such as `stage-web`, `stage-tamagotchi`, `stage-pocket`, `stage-ui`, `server-runtime`, and `plugin-sdk`. AIRI is not a single application but a monorepo built around the virtual character experience: the front-end stage, desktop runtime, mobile client, shared UI, service channel, plugin protocol, and agent services are all taking shape within the same project.


## Getting Started


The easiest ways to get started today are the web client and the desktop client.

<div flex gap-2 w-full justify-center text-xl>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:app-window />
    </div>
    <span>Web</span>
    <a href="https://airi.moeru.ai/" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      Open
    </a>
  </div>
  <div w-full flex flex-col items-center gap-2 border="2 solid gray-500/10" rounded-lg px-2 pt-6 pb-4>
    <div flex items-center gap-2 text-5xl>
      <div i-lucide:laptop />
      /
      <div i-lucide:computer />
    </div>
    <span>Desktop</span>
    <a href="https://github.com/moeru-ai/airi/releases/latest" target="_blank" decoration-none class="text-primary-900 dark:text-primary-400 text-base not-prose bg-primary-400/10 dark:bg-primary-600/10 block px-4 py-2 rounded-lg active:scale-95 transition-all duration-200 ease-in-out">
      Download
    </a>
  </div>
</div>


The **web client** is ideal for a quick experience. Open your browser, configure a model provider and API key, and you can start chatting with AIRI. It also works well on mobile devices, or for trying out PWA and in-browser capabilities.


The **desktop client** is suited for long-term use and a fuller desktop pet experience. Built on Electron, it lets AIRI live on your desktop as a Live2D / VRM model, with system tray, click-through windows, hover fade, local model support, plugin debugging, and more experimental features.


**Mobile** (`stage-pocket`) is under development and reuses web stage capabilities via Capacitor. For now, if you just want to try it on your phone, the web client is the way to go.

<div flex gap-2 w-full flex-col justify-center text-base>
  <a href="../manual/tamagotchi/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:laptop />
      </div>
      <span>Desktop</span>
    </div>
    <div decoration-none class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      How to use?
    </div>
  </a>
  <a href="../manual/web/" w-full flex items-center gap-2 border="2 solid gray-500/10" rounded-lg px-4 py-2>
    <div w-full flex items-center gap-2>
      <div flex items-center gap-2 text-2xl>
        <div i-lucide:app-window />
      </div>
      <span>Web</span>
    </div>
    <div class="text-gray-900 dark:text-gray-200 text-base not-prose rounded-lg active:scale-95 transition-all duration-200 ease-in-out text-nowrap">
      How to use?
    </div>
  </a>
</div>


## For Developers


AIRI's main tech stack is Vue 3, TypeScript, Vite, Pinia, VueUse, UnoCSS, and Vitest. The desktop client uses Electron, and the mobile client uses Capacitor; cross-process communication and service events use `@moeru/eventa`, service composition relies heavily on `injeca`; the model and LLM provider side is driven primarily by the `xsai` ecosystem.


Common entry points:


- `apps/stage-web`: the web client, i.e. <https://airi.moeru.ai>;
- `apps/stage-tamagotchi`: the desktop client, including the Electron main process, renderer, desktop windows, plugin host, and service channel;
- `apps/stage-pocket`: the experimental mobile application;
- `packages/stage-ui`: core business components, settings pages, stores, and composables shared by the web, desktop, and mobile clients;
- `packages/stage-ui-three` and `packages/stage-ui-live2d`: 3D / Live2D stage capabilities;
- `packages/server-runtime`, `packages/server-sdk`, `packages/server-shared`: the service channel and external agent connections;
- `integrations/discord-bot`, `integrations/telegram-bot`, `integrations/minecraft`: external platform integrations that require source-level configuration to run.
If you want to contribute code, start with the [Developer Guide](../contributing/); if you want to improve the interface, please read the [Design Guidelines](../contributing/design-guidelines/resources).
::: warning Experimental Features and Early Development Notice
Project AIRI is still in active development. Release versions prioritize the basic experience; some advanced capabilities — such as the Minecraft agent, Discord / Telegram bots, Factorio, plugin host, MCP, computer-use, and more complete long-term memory — may still require configuring from source, running from source, or participating in development.
If you would like to try these features, please refer to the [Developer Guide](../contributing/) and the corresponding service documentation.
:::
