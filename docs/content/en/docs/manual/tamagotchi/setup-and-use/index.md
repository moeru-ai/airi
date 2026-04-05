# Project AIRI Manual

Writing time: (UTC+8) April 2, 2026 – evening

Corresponding version: AIRI-0.9.0-beta.4-windows-x64

::: info Authors
Lead writing team: MuGewRayce

Contributing editor: JhIcefair (primary)
:::

::: warning Before You Start
- Some technical functions and operations of AIRI will not be explained in detail in this manual.
- The primary editor is only responsible for the Chinese version of this manual. Other language versions are AI-translated and then lightly manually corrected, so they may not match the actual software. Please refer to the actual content.
- Most of the content has been explored by the lead writing team and may differ from reality. Please rely on your own experience.
- This manual may not be updated in a timely manner.
- Due to limited time and ability, this manual currently only covers some detailed tutorials for AIRI installed via the installer on Windows.
- Some parts of the software use English without translation. This manual attempts to translate those parts, but the final interpretation should follow the actual software.
- Version updates may change content. This manual only describes the latest version before the writing time. If you encounter differences with other versions, please handle them yourself.
- If you have additions or questions about this manual, please @jhicefair on the official Project AIRI Discord channel and leave a message.
- For any other questions, please leave a message on the official Project AIRI Discord channel.
- Have fun! AwA
:::

## Table Of Contents

- [Chapter 1 – Installation](#chapter-1-installation)
- [Chapter 2 – Initial Configuration](#chapter-2-initial-configuration)
  - [Section 1 – Preparation](#chapter-2-prerequisites)
  - [Section 2 – Launch Airi!](#chapter-2-launch)
- [Chapter 3 – Airi Interface Overview](#chapter-3-interface-overview)
  - [Main Window](#chapter-3-main-window)
  - [System Tray Other Options](#chapter-3-system-tray)
  - [Settings Window](#chapter-3-settings-overview)
  - [Chat Window](#chapter-3-chat-window)
- [Chapter 4 – Settings](#chapter-4-settings)
  - [AIRI Character Card](#chapter-4-airi-card)
  - [Body Modules](#chapter-4-modules)
  - [Scene](#chapter-4-stage)
  - [Character Model](#chapter-4-character-model)
  - [Memory Bank](#chapter-4-memory-bank)
  - [Service Sources](#chapter-4-providers)
  - [Data](#chapter-4-data)
  - [Connection](#chapter-4-connection)
  - [System](#chapter-4-system)

<a id="chapter-1-installation"></a>
## Chapter 1 – Installation

Go to the Project AIRI GitHub homepage: [moeru-ai/airi](https://github.com/moeru-ai/airi)

Follow these steps:

1. Find the "**Releases**" option on the right side of the page.
2. Click "+ 68 releases".
3. Pick a version, find "**Assets**" below it, and expand.
4. Choose the version suitable for your computer and download it.
5. Locate the downloaded installer and double-click to install.

::: tip Download Page Notes
- The number in "+ 68 releases" only shows how many other releases exist, so yours may differ.
- You may also need to click "Show all 19 assets" at the bottom; that number may also vary.
- The following sections use the Windows installer version as an example.
- Due to time constraints, the installation walkthrough itself is skipped — you can handle it.
:::

<a id="chapter-2-initial-configuration"></a>
## Chapter 2 – Initial Configuration

<a id="chapter-2-prerequisites"></a>
### Section 1 – Preparation

Before you begin, you need to prepare at least one API from an LLM service provider.

::: info Terminology
* LLM

LLM stands for Large Language Model.
Simply put, an AI.

* API

API stands for Application Programming Interface.
It is a set of predefined rules that allow different software applications to communicate, exchange data, and share functions.
You don't need to understand it deeply, just know how to obtain one.
:::

::: tip Getting An API
There are many LLM providers, and the method for obtaining an API varies. Due to time constraints, no tutorial or example is provided here. Please search online or ask an AI.
:::

::: warning Keep Your API Key Safe
Once you have your API, keep it safe and do not share it with others.
:::

<a id="chapter-2-launch"></a>
### Section 2 – Launch Airi!

::: info Example
The steps below use Deepseek as the example provider.
:::

Follow these steps to finish the first-time setup:

1. Open Airi (normally it opens automatically after installation).
2. Select your language in the main window.
3. Click "**setup with your provider**".
4. Select your service source and click "**Next**".
5. Enter your API Key and click "**Next**".
6. Click "**Next**" again.
7. Select the model you wish to use, then click "**Save and continue**".

Congratulations! You have completed the initial configuration of Airi.

<a id="chapter-3-interface-overview"></a>
## Chapter 3 – Airi Interface Overview

<a id="chapter-3-main-window"></a>
### Main Window

This window displays the virtual character. There are four buttons:

- "websocket status" – top right, click to open connection settings where you can configure your WebSocket server address.
- "Expand" – bottom right, click to reveal more options (see below).
- "Open hearing control" – bottom right, allows you to speak to Airi. Requires an STT service.
- "Move" – bottom right, long-press and drag to reposition the main window.

![Airi main window overview](./assets/manual-main-window.avif)

::: info About Hearing Control
It seems you also need to open the chat window first. Since this feature has not worked for the editor yet, the tutorial is omitted.
:::

::: info Terminology
* websocket

WebSocket is a network communication protocol that provides full-duplex, persistent connections between a browser and a server.
In simple terms, traditional HTTP is a "request-response" model (client requests, server responds, then disconnects), while WebSocket allows both parties to send messages at any time after the connection is established, without repeated requests.

* STT

STT stands for Speech-to-Text, also known as automatic speech recognition (ASR).
Its goal is to enable computers to understand human speech and convert it into text.
:::

Click "Expand" to reveal eight options:

- "Open settings" – opens the settings window.
- "Switch character" – switch character cards.
- "Open chat" – opens the chat window.
- "Refresh" – refreshes the main window.
- "Switch to dark mode" – toggles light/dark theme.
- "Unpin" – makes the main window not always on top.
- "Always show" / "Hide on hover" – allows clicking through the window.
- "Close" – closes Airi.

![Airi expanded controls menu](./assets/manual-controls-island-expanded.avif)

<a id="chapter-3-system-tray"></a>
### System Tray Other Options

First, locate the Airi icon in the system tray.

::: tip Windows Taskbar Tip
On Windows, you may need to click "Show hidden icons" in the taskbar to find the Airi icon.
:::

Right-click the Airi icon to see ten options:

- "Show" – brings up the main window, usually not needed.
- "Adjust size" – adjusts the main window size and centers it. Includes four sub-options:
  - "Recommended (450x600)" – sets the window to the recommended 450x600 size.
  - "Full height" – makes the window's height span the full desktop height.
  - "Half height" – makes the window's height span half the desktop height.
  - "Full screen" – makes the window fill the entire desktop.
- "Align to" – aligns the main window to a specific screen position. Includes five sub-options:
  - "Center" – aligns to the center of the desktop.
  - "Top left" – aligns to the top-left corner.
  - "Top right" – aligns to the top-right corner.
  - "Bottom left" – aligns to the bottom-left corner.
  - "Bottom right" – aligns to the bottom-right corner.
- "Settings" – opens the settings window.
- "About" – details omitted.
- "Open quick actions" – details omitted.
- "Open widgets" – details omitted.
- "Open caption" – opens subtitles. Requires TTS service to display text when Airi speaks; hidden on hover by default.
- "Caption overlay" – includes two sub-options:
  - "Follow window" – default; caption position follows the main window.
  - "Reset position" – resets the caption position.
- "Quit" – closes Airi.

::: info Terminology
* TTS

TTS stands for Text-to-Speech, which converts written text into natural-sounding spoken output.
:::

<a id="chapter-3-settings-overview"></a>
### Settings Window

::: info Scope
This section only describes what the window contains. Detailed functions are explained in Chapter 4.
:::

You can open settings in either of these ways:

- Click "Expand" on the main window, then select "Open settings".
- Right-click the Airi tray icon and select "Settings".

The settings window contains nine sections:

- "AIRI Character Card" – configure character personality.
- "Body Modules" – configure various functions: Consciousness, Vocalization, Hearing, Vision, Short-term Memory, Long-term Memory, Discord, X/Twitter, Minecraft, Factorio, MCP Server, Rhythm Game.
- "Scene" – not yet released.
- "Character Model" – choose and configure the character's model.
- "Memory Bank" – not yet released.
- "Service Sources" – configure LLM, TTS, STT services.
- "Data" – manage Airi's data.
- "Connection" – configure WebSocket server address.
- "System" – includes four sub-sections:
  - "General" – theme, language, etc.
  - "Color Scheme" – change the theme color.
  - "Window Shortcuts" – currently empty, no back button.
  - "Developer" – advanced features, see Chapter 4.

::: warning Do Not Open "Window Shortcuts"
This option currently has no content and no back button. Once you enter it, you must close and reopen the settings window to exit.
:::

![Airi settings window overview](./assets/manual-settings-window.avif)

<a id="chapter-3-chat-window"></a>
### Chat Window

You can open the chat window by clicking "Expand" on the main window and selecting "Open chat".

![Airi chat window interface](./assets/manual-chat-window.avif)

Here you can chat with Airi.

<a id="chapter-4-settings"></a>
## Chapter 4 – Settings

You can open settings in either of these ways:

- Click "Expand" on the main window, then select "Open settings".
- Right-click the Airi tray icon and select "Settings".

<a id="chapter-4-airi-card"></a>
### AIRI Character Card

Here you can upload, create, or modify the default character card.

![Airi character card settings window](./assets/manual-airi-card.avif)

::: info About Uploading
The upload dialog suggests any file type is supported, but the editor has not actually used it, and there is no export function either, so details are omitted.
:::

About creating a new character card, the recommended order is:

1. Fill out **Identity**, including name, nickname, description, and creator's notes.
2. Then adjust **Behavior**, including personality, scenario, and greeting.
3. If needed, configure **Modules** for character-specific body modules.
4. Finally, review **Settings**, including system prompt, history prompt instructions, and version.
5. When you are ready, click "**Create**" to create the character card.
6. After creation, click the circle in the bottom-right corner of the card, or select the card and click Activate, to enable it.

The most important fields in **Identity** are name and description:

- Name is the official name; if a nickname is set, the nickname will be used first.
- Description is the detailed personality. You can be creative or refer to the default character card.

::: info Editor Notes
- If you refer to the default character card, you may omit the part about ACT tags.
- The editor has not used creator's notes, so details are omitted.
- The editor has not fully tested Behavior, Modules, or Settings yet — only the rough purpose is documented above.
:::

::: warning Activation Required
Newly created cards are not enabled by default. You must activate them manually.
:::

<a id="chapter-4-modules"></a>
### Body Modules

Here you can configure various Airi functions, as follows:

![Airi body modules settings window](./assets/manual-modules.avif)

#### Consciousness

Recommended order:

1. First select a service source, or add a new one and select it.
2. Then select a model.

::: tip Too Many Service Sources
If there are too many sources and you cannot click the ones at the back, move the mouse over a tab, press the middle mouse button, and drag left or right.
:::

![Airi consciousness settings window](./assets/manual-consciousness.avif)

#### Vocalization

::: tip Vocalization Notes
- The configuration process may vary slightly for different service sources. This section uses Alibaba Bailian as an example; follow the actual interface.
- For some services, the Pitch control may not work.
- If there are too many sources and you cannot click the ones at the back, move the mouse over a tab, press the middle mouse button, and drag left or right.
:::

Recommended order:

1. First select a service source, or add a new one and select it.
2. Then select a model.
3. Next select a voice.
4. If you do not want Airi to speak, choose "None".
5. After the basic setup, you can enter text at the bottom of this page and click "**Test voice**" to generate a sample.

![Airi vocalization settings window](./assets/manual-speech.avif)

#### Hearing

::: tip Too Many Service Sources
If there are too many sources and you cannot click the ones at the back, move the mouse over a tab, press the middle mouse button, and drag left or right.
:::

Recommended order:

1. First select your audio input device.
2. Then select a service source, or add a new one and select it.
3. Then select a model.

![Airi hearing settings window](./assets/manual-hearing.avif)

In addition, you can:

- Enable "Auto-send transcribed text" to send transcripts automatically.
- Disable it to adjust the transcription result before sending.
- Configure "Auto-send delay" to tune the send delay.

::: info Editor Note
The claim that "disabling auto-send lets you adjust the transcription" is the editor's guess — the editor has not successfully used the Hearing feature.
:::

If you want to test the microphone:

1. Click "**start monitoring**" in the middle of the page.
2. If needed, adjust Sensitivity.

If you want to test STT:

1. Click "**start speech-to-text**" at the bottom of the page.
2. Check the result under "Transcription Result".

#### Vision

::: tip Too Many Service Sources
If there are too many sources and you cannot click the ones at the back, move the mouse over a tab, press the middle mouse button, and drag left or right.
:::

Recommended order:

1. First select a service source, or add a new one and select it.
2. Then select a model.
3. Optionally set "Capture interval" to control the capture frequency.

![Airi vision settings window](./assets/manual-vision.avif)

::: warning Requires Vision Capture
This function requires enabling `vision capture` in `System → Developer → vision capture`. See that section for details.
:::

#### Short-term Memory

Not yet released.

#### Long-term Memory

Not yet released.

#### Discord

Here you can configure a Discord bot so that Airi can join your Discord server and interact.

Recommended order:

1. Obtain your Discord bot token.
2. Enter it into the appropriate field.
3. Finish the rest of the configuration based on the page.

::: warning About The Discord Bot
This function requires a Discord bot, which is not included in the installer version. You need to extract the relevant files from the GitHub page. Since the editor's schedule for this is a low priority, the full tutorial is omitted.
:::

#### X/Twitter

Similar to Discord; requires a bot. Tutorial omitted.

#### Minecraft

Requires a bot. Tutorial omitted.

#### Factorio

Requires a bot. Tutorial omitted.

#### MCP Server

The editor has not used this. Tutorial omitted.

#### Rhythm Game

The editor is still exploring this. Tutorial omitted.

<a id="chapter-4-stage"></a>
### Scene

Not yet released.

<a id="chapter-4-character-model"></a>
### Character Model

Here you can choose and set the character's model.

![Airi character model settings window](./assets/manual-models.avif)

Airi supports Live2D models and VRM 3D models.

If you only want to switch to an existing model:

1. Click "**select model**" to open the model picker.
2. In this version, there are two Live2D and two VRM models by default.
3. Select one and click "**confirm**" to switch.

If you want to import your own model, click "**add**" to import a Live2D or VRM model.

::: warning Before Importing A Model
- Old Live2D models are not supported. You must use files that include "\*.moc3".
- Before importing a Live2D model, compress the model folder into a "\*.zip" file.
:::

#### If you choose a Live2D model

You can continue in this order:

1. Expand "Zoom & Position" to adjust the model's size and position in the main window. x is horizontal (left/right), y is vertical (up/down).
2. Expand "parameters" to set mouse tracking, Idle Animation, frame rate, Auto Blink, Force Auto Blink (fallback timer), Shadow, reset to default parameters, clear model cache, and all model-specific parameters.
3. If you want idle animation, make sure the model zip includes animation files.
4. If needed, expand "Expressions" to enable the Expression System.

::: info Editor Note
The editor has not fully tested this part yet, so details are still limited.
:::

#### If you choose a VRM 3D model

Expand "Scene" and then set Model Position, camera angle (degrees), camera distance (zoom), model orientation (Y-axis rotation), model gaze direction, and related values.

::: info Editor Note
This section, including "Change model", is omitted due to time constraints.
:::

<a id="chapter-4-memory-bank"></a>
### Memory Bank

Not yet released.

<a id="chapter-4-providers"></a>
### Service Sources

Here you can configure LLM, TTS, and STT service sources.

![Airi service sources settings window](./assets/manual-providers.avif)

::: info Editor Note
Details omitted.
:::

<a id="chapter-4-data"></a>
### Data

Here you can manage Airi's various data.

![Airi data settings window](./assets/manual-data-settings.avif)

::: warning Destructive Actions
This section allows deletion and clearing of data, which cannot be undone. Please operate with caution, and double-check before running any delete or reset action.
:::

::: tip Known Issue
"Open app data folder" currently has a bug where it may open the folder multiple times at once.
:::

This page is organized into boxes:

1. The first box contains "Open app data folder". Click "**Open folder**" to open it.
2. The second box allows you to import/export chat history or delete all chat sessions.
3. The third box allows you to delete all imported models or reset module preferences and credentials.
4. The fourth box allows you to reset desktop settings and state.
5. The fifth box allows you to reset all provider settings and credentials, or clear every local setting, provider configuration, and model.

<a id="chapter-4-connection"></a>
### Connection

Here you can configure your WebSocket server address.

![Airi connection settings window](./assets/manual-websocket-settings.avif)

::: info Editor Note
Details omitted.
:::

<a id="chapter-4-system"></a>
### System

#### General

Here you can set the program theme, language, etc.

![Airi general system settings window](./assets/manual-system-general.avif)

- Theme defaults to light; click the button to switch to dark mode.
- Language sets the interface language.
- Control island icon size changes the size of the three buttons at the bottom-right of the main window.
- Finally, you can choose whether to allow collection of usage data and crash reports, or read the privacy policy (click "Privacy Policy" to open).

#### Color Scheme

Here you can change the theme color.

![Airi color scheme settings window](./assets/manual-system-color-scheme.avif)

- Enable the RGB option to make the theme color cycle like an RGB strip.
- Drag the black line or click on the color bar to change the theme color.
- Below that is a color preview.
- You can also select a preset below to change the theme color.

::: tip Color Presets
Click on one of the circles, not the square box.
:::

#### Window Shortcuts

::: warning Do Not Open
This option has no content and no back button. Once you enter it, you must close and reopen the settings window. Do not click it.
:::

#### Developer

Here you can use some advanced features.

![Airi developer settings window](./assets/manual-system-developer.avif)

::: info Advanced Features
Most of this content is in English and consists of advanced features that are rarely needed, so this section is for reference only.
:::

First box and its related options:

- In the first box, you can click "**Open**" to open the developer tools window (like F12 in a browser).
- The second "Markdown stress test" – details omitted.
- The third "Lag visualization" – details omitted.
- The fourth "Enable stage transition animation" – details omitted.
- The fifth "Use page-specific cutscenes" – details omitted.

##### useMagicKeys tool

::: info Editor Note
The page is currently blank; details omitted.
:::

##### useElectronWindowMouse

Here you can detect the mouse cursor position on the screen.

![Airi useElectronWindowMouse tool window](./assets/manual-devtools-use-window-mouse.avif)

##### Displays

Here you can visualize the mouse cursor position on the screen.

![Airi Displays tool window](./assets/manual-devtools-displays.avif)

##### widgets calling

![Airi widgets calling tool window](./assets/manual-devtools-widgets-calling.avif)

##### Context Flow

Real-time inspection of incoming context updates (server + broadcast) and outgoing chat hooks. Use this to verify how plugin context (e.g., VSCode coding context) flows into the chat pipeline and out to server events.

![Airi Context Flow tool window](./assets/manual-devtools-context-flow.avif)

##### relative mouse

Here you can visualize the mouse cursor position within this window.

![Airi relative mouse tool window](./assets/manual-devtools-relative-mouse.avif)

##### beat sync visualizer

![Airi beat sync visualizer tool window](./assets/manual-devtools-beat-sync.avif)

##### WebSocket Inspector

![Airi WebSocket Inspector tool window](./assets/manual-devtools-websocket-inspector.avif)

##### Plugin Host Debug

![Airi Plugin Host Debug tool window](./assets/manual-devtools-plugin-host.avif)

##### Screen Capture

If you have not granted system-level screen capture permission yet, you will first see a permission prompt like the screenshot below. After granting permission, you can capture any application window or the entire screen.

There are four options at the top:

- "applications" – select any open application window, click "**share window**" to view it at the top; move the mouse over the capture and click "stop" to stop.
- "displays" – capture the whole screen, click "**share screen**" to view; move the mouse over the capture and click "stop" to stop.
- "devices" – details omitted.
- "refetch" – details omitted.

![Airi Screen Capture tool window](./assets/manual-devtools-screen-capture.avif)

##### vision capture

If screen capture permission has not been granted yet, this page will also show a permission prompt first. After granting permission, the page can start capturing frames and show the vision processing result.

![Airi vision capture tool window](./assets/manual-devtools-vision-capture.avif)
