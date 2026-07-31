---
title: Desktop Developer Tools
description: Understand and use the diagnostic and validation tools under Settings → System → Developer in AIRI Desktop
---

The **System → Developer** page in AIRI Desktop contains tools for development, troubleshooting, and validating experimental features. They do not improve everyday chat or character interactions, and you do not need to configure them after installation. Use them only when reproducing a problem, developing a feature, or collecting diagnostics requested by a maintainer.

This page covers the desktop app only. The web app also has development pages, but its available features and runtime environment differ.

::: warning Know what you are testing
Some tools capture the screen, use the microphone, register global shortcuts, open additional windows, or display raw network and plugin data. Stop capture streams and close unused windows after testing. Do not publicly share screenshots containing API keys, conversations, screen contents, or WebSocket data.
:::

## Open the page and choose a tool

In the desktop app, open **Settings → System → Developer**. Quick actions and rendering switches appear at the top; links to individual diagnostic pages appear below.

Choose a tool based on what you need to investigate:

| What you need to check | Start with |
| --- | --- |
| Page errors, element styles, or network requests | Open Developer Tools |
| Three.js or VRM rendering diagnostics | Lag Visualizer |
| Broken transition animations | the animation switches |
| Keyboard, mouse, display, or global-shortcut behavior | useMagicKeys, mouse/display tools, or Global Shortcut |
| Chat context, WebSockets, or real-time transcription | Context Flow, WebSocket Inspector, or Aliyun Real-time Transcriber |
| Plugin discovery, loading, or unloading | Plugin Host Debug |
| Failed updates or an unexpected update source | Updater |
| Screen sharing, vision input, or capture permissions | Screen Capture or Vision Capture |

## Quick actions and rendering diagnostics

### Open Developer Tools

Select **Open** to launch Electron's built-in browser developer tools. Use them to inspect console errors, network requests, the DOM, and performance recordings. This is usually the best starting point for an interface problem.

For a reproducible issue, clear the console, repeat the action once, and save only the relevant errors. Remove sensitive information before attaching diagnostics to an issue or pull request.

### Markdown Stress

This tool renders high-volume Markdown in a separate window to test long passages, code blocks, tables, scrolling, and theme styles. It does not modify your documents or conversations.

### IO Tracer

IO Tracer shows the timing spans for interaction turns across ASR, LLM, Streaming Control, TTS, and Playback. Use it to locate delays or missing stages in the voice-and-chat pipeline. Trace data can contain contextual information, so open it only when needed and avoid sharing complete traces.

### Lag Visualizer

Lag Visualizer traces the Stage Three runtime. It reports the window lifecycle, Three.js render counts and resources, VRM frame-update timing, fade-on-hover hit tests, VRM load and disposal timing, and renderer/resource snapshots. Use it for Three.js or VRM rendering problems; it is not a general page-transition, long-task, or FPS profiler.

### Stage and page transition animations

**Disable Stage Transitions** removes the overall animation used when switching stages. Turn it on to remove stage transitions as a variable during testing. **Use Page Specific Transitions** controls each page's own transition and is unavailable while **Disable Stage Transitions** is on.

When investigating flickering, pages that do not unload, or slow transitions, test each state separately. Restore your normal settings after testing.

## Keyboard, mouse, and displays

### useMagicKeys

This page shows keyboard shortcut and modifier-key state so you can confirm that the app receives key events correctly. It has no regular user settings. To change AIRI's Spotlight shortcut, use **Settings → System → Window Shortcuts** instead.

### useElectronWindowMouse, Displays, and Relative Mouse

These tools show pointer positions in different coordinate systems:

- **useElectronWindowMouse** shows the pointer in the desktop coordinate space formed by all displays.
- **Displays** shows connected displays and the pointer's current location. Use it for multi-display, scaling, or external-monitor problems.
- **Relative Mouse** shows the pointer relative to the AIRI window. Use it to test hit areas and dragging inside the window.

When reporting window-following, click-offset, or multi-display positioning problems, include the display arrangement, scale factors, primary display, and reproduction steps.

### Widgets Calling

Widgets Calling creates overlay widgets and validates the component props passed to them. It is intended for desktop-overlay and component-call development; regular AIRI use does not require it.

### Beat Sync Visualizer

Beat Sync Visualizer plots beat-synchronized V-motion targets, paths, and Y/Z scalar changes. Use **Hit beat** or **Hit V sequence** to inject test beats and inspect the resulting motion. This page has no audio input or automatic beat-detection path.

## Chat, real-time services, and networking

### Context Flow

Context Flow shows context updates entering the chat pipeline and chat-stream events sent to services. It is useful for confirming that context from plugins, VS Code, and other external sources reaches AIRI.

Open the tool first, perform the smallest reproduction, and then compare the input context and output events in chronological order. Context can contain filenames, conversations, or other private information; redact logs before sharing them.

### WebSocket Inspector

WebSocket Inspector displays raw WebSocket traffic. Use it for failed connections, missing events, or messages with an unexpected format. Share only the few frames relevant to the problem, and remove tokens, user content, and address information.

### Aliyun Real-time Transcriber

This page sends audio from the system's default microphone to Alibaba Cloud NLS and displays the transcription as it arrives. It validates the real-time speech-recognition path: default microphone input, credentials, network connectivity, and transcription output. The page does not provide an input-device selector, so choose the desired default microphone in the operating system before opening it. Record only where you have permission.

## Plugins, updates, and system features

### Plugin Host Debug

Plugin Host Debug shows whether plugins are discovered, enabled, and loaded, and lets developers control their load and unload lifecycle. For a plugin that does not work, check discovery, enabled state, load errors, and whether events or interface state remain after unloading.

Record the current state and errors before changing anything. Repeatedly loading and unloading a plugin without a minimal reproduction can make the original problem harder to diagnose.

### Updater

Updater shows the current version, platform, architecture, update channel, update source, log location, and update state. It can also check for, download, and install updates manually. Use it to investigate failed updates, unexpected update sources, or platform-specific installation problems.

For routine updates, prefer the **About** window. Do not override the update source unless you understand and trust it.

## Screen and vision capture

### Screen Capture

Screen Capture can capture an application window or an entire display and create a video or audio stream. It is primarily a test page for screen-sharing and capture behavior.

The operating system may request screen-recording permission on first use. On macOS, if AIRI is not listed, enable or add it under **System Settings → Privacy & Security → Screen & System Audio Recording**, restart AIRI, and try again. Permission prompts on Windows and Linux depend on the operating system, desktop environment, and Electron version.

In the tool, **Applications** lists application windows and **Displays** lists entire screens. The current implementation does not supply external sources to the **Devices** tab, so that tab remains empty. Use **Refetch** after connecting or disconnecting a display, opening a window, or changing permissions. After stopping, confirm that the preview has closed so the stream no longer uses system resources or permissions.

### Vision Capture

Vision Capture captures screen frames and shows the payload sent through the vision pipeline. Use it to verify that vision input is captured correctly and reaches downstream features. It is a diagnostic workflow, not a global switch that must remain open after configuring a vision provider.

To test screen vision:

1. Configure a vision provider's credentials under **Settings → Providers → Vision**.
2. Open **Settings → Modules → Vision**, then select the configured provider and an image-capable model.
3. Open **Settings → System → Developer → Vision Capture** and grant the operating system's screen-recording permission.
4. Choose a window or display, then select **Start ticker** to begin capturing and analyzing frames.
5. Enable **Publish to character** only when you want recognition results added to AIRI's conversation context.
6. Select **Stop ticker** when finished. Leaving the page also stops the capture loop.

If the page remains on a permission prompt, grant permission in the operating system, fully quit AIRI, restart it, and reopen the tool. Never publish captures that show a personal desktop, notifications, or content from other applications.

## Global shortcuts

### Global Shortcut

Global Shortcut registers, unregisters, and observes system-wide shortcut events. It differs from the Spotlight shortcut configured for everyday use under **Settings → System → Window Shortcuts**: this page exists for development and validation.

Choose a key combination that does not conflict with the operating system or another application. If registration fails, check whether that combination is already in use. Unregister the shortcut after testing so it does not continue intercepting keys.
