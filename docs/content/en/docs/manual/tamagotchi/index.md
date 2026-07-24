---
title: Desktop Quick Start
description: How to get started with Project AIRI Desktop
---

## Start chatting first

After installing and starting AIRI, you can first complete the basic configuration by following the first boot:

1. If AIRI asks for a language selection, first select the language you want to use.
2. Select **Configure your own AI service source**; if you are already using an AIRI account, you can also choose to log in.
3. Select a chat service source such as OpenRouter, OpenAI Compatible API, DeepSeek, Ollama, Qwen, Gemini, or Claude.
4. Fill in the API Key, local service address and other necessary information.
5. Select a chat model, then save and continue.
6. After returning to the main character window, click the **Expand** button in the control island in the lower right corner.
7. Click **Open Chat**, enter the message and send it.

::: tip Using Ollama locally?
You need to set the system environment variable `OLLAMA_ORIGINS=*`, then restart Ollama and select it from AIRI.
:::

<br />

<video controls autoplay loop muted>
 <source src="/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

## What will you see

The desktop version is also called Stage Tamagotchi and usually consists of these interfaces:

- **Main Character Window**: Live2D/VRM stage resident on the desktop.
- **Control Island**: A small group of buttons in the lower right corner of the main character window.
- **CHAT WINDOW**: A conversation window opened from the control island.
- **Settings Window**: Configure service sources, roles, models, body modules, data, connections and system options.
- **System Tray Menu**: resize, align position, open settings, subtitles, widgets and exit.

If the main character window is hidden, you can bring it back by clicking on the AIRI tray icon or selecting **Show** in the tray menu.

## Control Island

The control island is the most convenient entry point for daily operation of the desktop version.

- Click **Expand** to show more actions.
- Click **Open Chat** to open the chat window.
- Click **Open Settings** to configure service sources, models, airframe modules, roles and system settings.
- Click **Switch Role** to change the current character card.
- If needed, you can click **Refresh** to reload the stage.
- Click the light/dark icon to switch themes.
- Click the pushpin icon to switch the window to the top.
- Click on the eye icon to toggle **Hide on Hover** / **Always Show**.
- Click the microphone button to turn on hearing controls.
- Drag the move button to move the main character window.

## Hide on hover

The eye icon is used to toggle how AIRI is displayed: remain clickable, or minimize occlusion and click distractions while you work.

- **Always Show** will keep the character visible and clickable.
- **Hide on Hover** will fade out the character and interface when the cursor is close, making it easier to click on the application below.

When hiding on hover is turned on for the first time, AIRI will pop up a short description. If it is inconvenient to click AIRI after it is turned on, move the cursor near the control island and click the eye icon again to switch back.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

## Move and resize

To move the main character window, drag the move button in the lower right corner of the control island.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

On Windows, you can drag the edges or corners of a window to resize it. Several common sizes are also provided in the tray menu:

1. Right-click the AIRI tray icon.
2. Open **Resize**.
3. Select **Recommended**, **Full Height**, **Half Height** or **Full Screen**.

**Align to** in the same tray menu can move the window to the center or four corners of the screen.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## It is recommended to take a look at these settings again

After completing your first chat, I recommend taking a look at these pages:

- **Service Source**: Add or edit Chat, Speech, Transcription, Artistry service sources.
- **Body Module**: Select services for consciousness, vocalization, hearing, vision, memory, Discord, Minecraft, Factorio, MCP and other modules.
- **Character Model**: Switch between Live2D/VRM models, or import your own.
- **AIRI Character Card**: Switch the current character, or create a new character card.
- **System**: Set language, theme, data analysis preferences and desktop-specific options.

Some modules are still in the experimental stage and may require local source code configuration or additional external services. For more complete Windows usage instructions, please refer to [Desktop version detailed instructions](./setup-and-use/).
