---
title: Desktop Quick Start
description: How to get started with the Project AIRI desktop client
---


## Start by Chatting


After installing and launching AIRI, follow the first-run guide to complete the basic setup:


1. If AIRI asks you to choose a language, select the language you want to use.
2. Choose **Configure your own AI service provider**; if you already use an AIRI account, you can also sign in.
3. Select a chat service provider, such as OpenRouter, an OpenAI-compatible API, DeepSeek, Ollama, Qwen, Gemini, or Claude.
4. Fill in the API key, or necessary details such as a local service address.
5. Select a chat model, then save and continue.
6. Back in the main character window, click the **Expand** button in the control island at the bottom right.
7. Click **Open Chat**, type a message, and send it.


::: tip Using Ollama locally?


You need to set the system environment variable `OLLAMA_ORIGINS=*`, then restart Ollama, and select it from AIRI.


:::


<br />

<video controls autoplay loop muted>
 <source src="/assets/tutorial-basic-setup-providers.mp4" type="video/mp4" />
</video>


## What You Will See


The desktop client is also called Stage Tamagotchi and usually consists of these interfaces:


- **Main character window**: the Live2D / VRM stage that lives on your desktop.
- **Control island**: the small button group at the bottom right of the main character window.
- **Chat window**: the conversation window opened from the control island.
- **Settings window**: configure service providers, characters, models, body modules, data, connections, and system options.
- **System tray menu**: resize, align position, open settings, captions, widgets, and quit.


If the main character window is hidden, click the AIRI tray icon, or select **Show** from the tray menu to bring it back.


## Control Island


The control island is the most convenient entry point for day-to-day use of the desktop client.


- Click **Expand** to show more actions.
- Click **Open Chat** to open the chat window.
- Click **Open Settings** to configure service providers, models, body modules, characters, and system settings.
- Click **Switch Character** to change the current character card.
- When needed, click **Refresh** to reload the stage.
- Click the light / dark icon to switch themes.
- Click the pin icon to toggle the window always on top.
- Click the eye icon to toggle **Hide on hover** / **Always show**.
- Click the microphone button to open hearing controls.
- Drag the move button to move the main character window.


## Hide on Hover


The eye icon toggles how AIRI is displayed: staying clickable, or minimizing occlusion and click interference while you work.


- **Always show** keeps the character visible and clickable.
- **Hide on hover** fades the character and interface out when the cursor approaches, making it easier for clicks to reach the applications below.


When you enable hide-on-hover for the first time, AIRI shows a short explanation. If it becomes inconvenient to click AIRI after enabling it, move the cursor near the control island and click the eye icon again to switch back.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4" />
  </video>
</div>


## Moving and Resizing


To move the main character window, drag the move button at the bottom right of the control island.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/assets/tutorial-basic-move.mp4" type="video/mp4" />
  </video>
</div>


On Windows, you can drag the window edges or corners to resize it. The tray menu also offers several common sizes:


1. Right-click the AIRI tray icon.
2. Open **Resize**.
3. Choose **Recommended**, **Full Height**, **Half Height**, or **Full Screen**.


The **Align to** option in the same tray menu can place the window at the center of the screen or in a corner.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/assets/tutorial-basic-resize.mp4" type="video/mp4" />
  </video>
</div>


## Settings Worth Checking Out


After your first chat, we recommend taking a look at these pages:


- **Service Providers**: add or edit Chat, Speech, Transcription, and Artistry service providers.
- **Modules**: select services for modules such as Consciousness, Speech, Hearing, Vision, Memory, Discord, Minecraft, Factorio, and MCP.
- **Models**: switch Live2D / VRM models, or import your own model.
- **AIRI Character Card**: switch the current character, or create a new character card.
- **System**: set language, theme, data analytics preferences, and desktop-only options.


Some modules are still experimental and may require local source-level configuration or additional external services. For a more complete Windows guide, see the [detailed desktop manual](./setup-and-use/).

