---
title: Desktop Quick Start
description: How to start using Project AIRI on desktop
---

## Start Chatting

After installing and launching AIRI, the quickest way to start a conversation is to complete the onboarding flow:

1. Select your language if AIRI asks for it.
2. Choose **setup with your provider**, or sign in if you already use an AIRI account.
3. Pick a chat provider, such as OpenRouter, OpenAI Compatible API, DeepSeek, Ollama, Qwen, Gemini, or Claude.
4. Enter the required API key or local endpoint information.
5. Choose a chat model, then save and continue.
6. On the main character window, click the bottom-right **Expand** button in the Controls Island.
7. Click **Open Chat**, type a message, and send it.

::: tip Using Ollama locally?
Set `OLLAMA_ORIGINS=*` as a system environment variable, then restart Ollama before selecting it in AIRI.
:::

<br />

<video controls autoplay loop muted>
 <source src="/assets/tutorial-basic-setup-providers.mp4" type="video/mp4">
</video>

## What Is On Screen

The desktop version, also called Stage Tamagotchi, usually has these surfaces:

- **Main character window**: the always-on-desktop Live2D / VRM stage.
- **Controls Island**: the small button group at the bottom-right of the character window.
- **Chat window**: the conversation window opened from Controls Island.
- **Settings window**: provider, character, model, module, data, connection, and system settings.
- **System tray menu**: size, alignment, settings, caption, widgets, and quit actions.

If the character window is hidden, you can bring it back by clicking the AIRI tray icon or choosing **Show** from the tray menu.

## Controls Island

The Controls Island is the most convenient place to operate the desktop app during everyday use.

- Click **Expand** to reveal more actions.
- Click **Open Chat** to open the chat window.
- Click **Open Settings** to configure providers, models, modules, characters, and system settings.
- Click **Switch Profile** to change the active character card.
- Click **Refresh** when the stage needs to reload.
- Click the light/dark icon to switch theme.
- Click the pin icon to toggle always-on-top.
- Click the eye icon to toggle **Auto hide** / **Always show**.
- Use the microphone button to open hearing controls.
- Drag the move button to reposition the character window.

## Auto Hide

The eye button controls whether AIRI should stay fully interactive or gently reduce visual and click interference while you work.

- **Always show** keeps the character visible and clickable.
- **Auto hide** fades the character and UI when your cursor is nearby, then lets clicks pass through to the app underneath.

The first time you enable Auto hide, AIRI shows a short notice explaining the behavior. If AIRI becomes hard to click, move the cursor near the Controls Island and click the eye button again.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-180 translate-x--30 translate-y--2 lg:scale-150 lg:translate-x--40">
    <source src="/assets/tutorial-basic-fade-on-hover.mp4" type="video/mp4">
  </video>
</div>

## Move And Resize

To move the character window, drag the move button at the bottom-right of the Controls Island.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-225 translate-x--45 translate-y--5 lg:scale-200 lg:translate-x--80 lg:translate-y--5">
    <source src="/assets/tutorial-basic-move.mp4" type="video/mp4">
  </video>
</div>

On Windows, you can resize the character window by dragging the window edges or corners. The tray menu also provides a few quick presets:

1. Right-click the AIRI tray icon.
2. Open **Adjust sizes**.
3. Choose **Recommended**, **Full Height**, **Half Height**, or **Full Screen**.

You can use **Align to** in the same tray menu to place the window at the center or a screen corner.

<div rounded-lg overflow-hidden>
  <video autoplay loop muted class="scale-160 translate-x--20 lg:scale-150 lg:translate-x--40 lg:translate-y-10">
    <source src="/assets/tutorial-basic-resize.mp4" type="video/mp4">
  </video>
</div>

## Settings Worth Checking

These pages are useful to check after the first chat works:

- **Service Sources**: add or edit Chat, Speech, Transcription, and Artistry providers.
- **Body Modules**: choose which providers AIRI uses for consciousness, voice, hearing, vision, memory, Discord, Minecraft, Factorio, MCP, and other modules.
- **Character Model**: switch between Live2D and VRM models, or import your own model.
- **AIRI Character Card**: change the active character or create a new one.
- **System**: set language, theme, analytics preference, and desktop-specific options.

Some modules are still experimental and may require local source setup or external services. For a more detailed Windows-focused walkthrough, see the [full desktop manual](./setup-and-use/).
