---
title: Desktop Developer Tools
description: Understand and use the diagnostic and verification tools under AIRI desktop's "System → Developer"
---


The desktop "System → Developer" is a set of tools for development, troubleshooting, and validating experimental features. They do not improve everyday chat or character experience, nor do they need configuration after a first install; you only open them when reproducing an issue, developing features, or when a maintainer asks you to collect diagnostic information.


This page only covers the desktop client. The web client also has development-related pages, but the available features and runtime environment differ.


::: warning Confirm Your Purpose Before Using


Some tools read the screen, use the microphone, register global shortcuts, open extra windows, or show raw network and plugin data. Close windows and capture streams you no longer use after testing; do not share screenshots containing API keys, chat content, screen captures, or WebSocket data publicly.


:::


## How to Enter and Choose Tools


On the desktop client, open "Settings → System → Developer". The upper part of the page contains quick actions and rendering toggles; the lower part contains the different diagnostic pages.


Before choosing a tool, you can decide by problem type:


| What you want to confirm | Prefer using |


| --- | --- |


| Page errors, element styles, or network requests | Open Developer Tools |


| Page jank or abnormal transition animations | Lag Visualizer, animation toggles |


| Keys, mouse, displays, or global shortcuts | useMagicKeys, mouse/display tools, Global Shortcut |


| Chat context, WebSocket, or real-time transcription | Context Flow, WebSocket Inspector, Aliyun Real-time Transcriber |


| Plugin discovery, loading, or unloading | Plugin Host Debug |


| Update failures or abnormal update sources | Updater |


| Screen sharing, vision input, or permission issues | Screen Capture, Vision Capture |


## Quick Actions and Rendering Diagnostics


### Open Developer Tools


Clicking "Open" opens the built-in browser developer tools of Electron. It is suitable for viewing console errors, network requests, DOM structure, and performance records, and is the first entry point for locating interface issues.


If the problem reproduces reliably, clear the console first, repeat the operation once, and save the relevant error information; remove sensitive content before submitting an issue or PR.


### Markdown Stress Test


This tool renders high-load Markdown in a separate window to check how long documents, code blocks, tables, and styles behave under larger content volumes. It is suitable for troubleshooting Markdown rendering jank, scrolling anomalies, or theme style errors, and does not modify your documents or chat history.


### IO Tracer


IO Tracer opens a diagnostic window for input/output events. It is used to observe the event flow during debugging, and is suitable for checking whether an operation produced the expected input, output, or state changes. Event content may include contextual data, so only enable it when needed and avoid sharing full logs.


### Lag Visualizer


Lag Visualizer is used to view interface performance and frame times. When window movement, stage switching, character rendering, or animations show obvious jank, use it first to confirm whether the problem is related to rendering load. It helps locate problems but does not automatically optimize performance; recording the reproduction steps, device environment, and frame-time changes is more helpful than screenshots alone.


### Stage Switching and Page Transitions


"Enable stage switch animation" controls the overall animation during stage switching; turning it off reduces animation interference in tests. "Use page-specific transitions" controls each page's own transition effects and is unavailable when the overall stage switch animation is disabled.


When troubleshooting flickering, pages not unmounting, or switching jank, test the two states separately. After testing, restore the settings you normally use.


## Input, Mouse, and Displays


### useMagicKeys


This is a debug page for keyboard shortcut state, used to confirm whether the application correctly receives modifier keys and key states. There is currently no configuration item for regular users; if you only want to change AIRI's Spotlight shortcut, use "System → Window Shortcut".


### useElectronWindowMouse, Displays, and Relative Mouse


These three tools each help inspect the mouse position in different coordinate systems:


- **useElectronWindowMouse**: view the mouse position in the desktop coordinate system composed of all screens;
- **Displays**: view the currently connected displays and the mouse position, suitable for multi-display, scaling ratio, or external screen issues;
- **Relative Mouse**: view the mouse position relative to the AIRI window, suitable for checking in-window hit areas and drag behavior.


When reporting window-following, click-offset, or multi-screen positioning issues, also state the display arrangement, scaling ratios, primary display, and reproduction steps.


### Widgets Calling


Widgets Calling creates overlay widgets and verifies the component parameters passed in. It mainly serves desktop overlay and component-call development; if you only use AIRI, there is nothing to do here.


### Beat Sync Visualizer


Beat Sync Visualizer plots Beat Sync's V-motion targets, trajectories, and Y/Z scalar changes. It is used to confirm whether beat- or sound-driven character motion is continuous and stable, and to compare motion data under different inputs.


## Chat, Real-Time Services, and Network


### Context Flow


Context Flow inspects the context updates entering the chat pipeline and the chat stream events sent to the server. It is well suited for verifying whether context from external sources such as plugins and VS Code reaches AIRI as expected.


A recommended troubleshooting flow is: open the tool first, then perform a minimal reproduction, and finally check in chronological order whether input context and output events appear in pairs. Context may contain the names of files being edited, chat content, or other private information; always sanitize logs before sharing.


### WebSocket Inspector


WebSocket Inspector shows raw WebSocket traffic. It is suitable for connection establishment failures, events not delivered, or message formats that do not match expectations. Because it shows low-level protocol data, usually only capture the few frames directly related to the problem, and remove tokens, user content, and address information.


### Aliyun Real-time Transcriber


This page sends microphone audio to Alibaba Cloud NLS and displays real-time transcription results. It is used to verify the real-time speech recognition pipeline, including microphone input, credentials, network, and transcription output. Before starting, confirm the correct input device is selected, and only test in an environment where you have permission to record.


## Plugins, Updates, and System Features


### Plugin Host Debug


Plugin Host Debug checks whether plugins are discovered, enabled, and loaded, and can control the plugin load/unload lifecycle. When a plugin does not take effect, check in order: whether the plugin is discovered, whether it is enabled, whether errors occurred during loading, and whether events or UI state remain after unloading.


Do not repeatedly load and unload plugins randomly to "fix" a common usage issue; first record the state and error messages, then make minimal changes and test — the results are easier to reproduce.


### Updater


Updater shows the current version, platform, architecture, update channel, update source, log location, and update status, and can also manually check, download, and install updates. It is mainly used to troubleshoot update failures, wrong update sources, or platform-specific installation issues.


For daily upgrades, prefer the "About" window; before overriding the update source in the developer tools, make sure you understand that source's trustworthiness and impact.


## Screen and Vision Capture


### Screen Capture


Screen Capture can capture application windows, entire displays, or other devices exposed by the system, and create video or audio streams. It is mainly used to verify screen sharing and capture pipelines.


On first use, the system asks for screen recording permission. If AIRI is not listed on macOS, add or enable AIRI manually under "System Settings → Privacy & Security → Screen & System Audio Recording", then restart the app and test again. The available devices and permission prompts on Windows and Linux vary with the system, desktop environment, and browser/Electron version.


In the tool, `applications` selects an application window, `displays` selects an entire display, and `devices` lists the capturable devices the system reports; after connecting/disconnecting displays, opening new windows, or changing permissions, use `refetch` to refresh the list. After stopping capture, confirm the preview is closed to avoid continuing to hold permissions or resources.


### Vision Capture


Vision Capture captures screen frames and shows the output payload submitted to the vision processing pipeline. It is used to verify that vision input is obtained successfully, the frame data is correct, and downstream vision features receive the expected content. It is not a persistent global toggle: you do not need to open this page just to configure a vision provider and model.


To use screen vision, complete the following steps in order:


1. Select a vision provider and a model that supports image input under "Settings → Providers → Vision";
2. Open "System → Developer → Vision Capture" and complete the system screen recording authorization;
3. Choose a window or display, then click "Start ticker" to start capture and analysis;
4. Only enable "Publish to character" when you want the recognition results to enter AIRI's conversation context;
5. Click "Stop ticker" after testing. Leaving this page also stops the capture loop.


If the page stays on the permission prompt, complete the authorization in the operating system, fully quit and restart AIRI, then reopen this tool; do not upload captures containing your personal desktop, notifications, or other application content to public places.


## Global Shortcuts


### Global Shortcut


Global Shortcut registers, unregisters, and observes system-level shortcut events. It differs from the Spotlight shortcut that regular users set under "System → Window Shortcut": the former is for development and verification, the latter for daily use.


Before testing, choose a key combination that does not conflict with the OS or common applications. If registration fails, first check whether the combination is already taken; unregister the shortcut after testing so it does not keep intercepting keys in the background.

