# Project Airi Manual

Writing time: (UTC+8) April 2, 2026 – evening

Corresponding version: AIRI-0.9.0-beta.4-windows-x64

<details>

<summary>Expand to see the authors</summary>

Lead writing team: MuGewRayce

Contributing editor: JhIcefair (primary)

</details>

<details>

<summary>Disclaimer: (click to expand)</summary>

- Some technical functions and operations of Airi will not be explained in detail in this manual.
- The primary editor is only responsible for the Chinese version of this manual. Other language versions are AI‑translated and then lightly manually corrected, so they may not match the actual software. Please refer to the actual content.
- Most of the content has been explored by the lead writing team and may differ from reality. Please rely on your own experience.
- This manual may not be updated in a timely manner.
- Due to limited time and ability, this manual currently only covers some detailed tutorials for Airi installed via the installer on Windows.
- Some parts of the software use English without translation. This manual attempts to translate those parts, but the final interpretation should follow the actual software.
- Version updates may change content. This manual only describes the latest version before the writing time. If you encounter differences with other versions, please handle them yourself.
- If you have additions or questions about this manual, please @jhicefair on the official Project Airi Discord channel and leave a message.
- For any other questions, please leave a message on the official Project Airi Discord channel.
- Have fun! AwA

</details>

## Chapter 1 – Installation

Go to the Project Airi GitHub homepage: [moeru-ai/airi](https://github.com/moeru-ai/airi)

Find the “**Releases**” option on the right side of the page.

Click “+ 68 releases”
(Note: the number indicates other releases; yours may not be 68)

Pick a version, find “**Assets**” below it, and expand.

Choose the version suitable for your computer and download it.
(Note: You may need to click “Show all 19 assets” at the bottom – the number may vary.)

[ *The following uses the Windows installer version as an example.* ]

Locate the downloaded installer and double‑click to install.
*(Due to time constraints, this part is skipped; I believe you can handle it.)*

## Chapter 2 – Initial Configuration

### Section 1 – Preparation

Before you begin, you need to prepare at least one API from an LLM service provider.

<details>

<summary>Terminology explanation: (click to expand)</summary>

* LLM

LLM stands for Large Language Model.
Simply put, an AI.

* API

API stands for Application Programming Interface.
It is a set of predefined rules that allow different software applications to communicate, exchange data, and share functions.
You don’t need to understand it deeply, just know how to obtain one.

</details>

[There are many LLM providers, and the methods to obtain an API vary. Due to time constraints, no tutorial or example is provided here. Please search online or ask an AI.]

Once you have your API, keep it safe and do not share it with others.

### Section 2 – Launch Airi!

Open Airi (normally it opens automatically after installation).

Select your language in the main window.

Click “**setup with your provider**”.

Select your service source and click “**Next**”.

[ *Using Deepseek as an example* ]

Enter your API Key and click “**Next**”.

Click “**Next**” again.

Select the model you wish to use, then click “**Save and continue**”.

Congratulations! You have completed the initial configuration of Airi.

## Chapter 3 – Airi Interface Overview

### Main Window

This window displays the virtual character. There are four buttons:
- “websocket status” – top right, click to open connection settings (detailed explanation omitted).
- “Expand” – bottom right, click to reveal more options (see below).
- “Open hearing control” – bottom right, allows you to speak to Airi (requires STT service; seems you also need to open the chat window first. Since this function hasn’t worked for me yet, tutorial omitted).
- “Move” – bottom right, long‑press and drag to reposition the main window.

<details>

<summary>Terminology explanation: (click to expand)</summary>

* websocket

WebSocket is a network communication protocol that provides full‑duplex, persistent connections between a browser and a server.
In simple terms, traditional HTTP is a “request‑response” model (client requests, server responds, then disconnects), while WebSocket allows both parties to send messages at any time after the connection is established, without repeated requests.

* STT

STT stands for Speech‑to‑Text, also known as automatic speech recognition (ASR).
Its goal is to enable computers to understand human speech and convert it into text.

</details>

Click “Expand” to reveal eight options:
- “Open settings” – opens the settings window.
- “Switch character” – switch character cards (details omitted due to time).
- “Open chat” – opens the chat window.
- “Refresh” – refreshes the main window.
- “Switch to dark mode” – toggles light/dark theme.
- “Unpin” – makes the main window not always on top.
- “Always show” / “Hide on hover” – allows clicking through the window.
- “Close” – closes Airi.

### System Tray Other Options

First, locate the Airi icon in the system tray (on Windows you may need to click “Show hidden icons”).

Right‑click the Airi icon to see ten options:
- “Show” – brings up the main window, usually not needed.
- “Adjust size” – adjusts the main window size and centers it.
  Includes four options: “Recommended (450x600)”, “Full height”, “Half height”, “Full screen”.
- “Align to” – aligns the main window to a specific screen position.
  Includes five options: “Center”, “Top left”, “Top right”, “Bottom left”, “Bottom right”.
- “Settings” – opens the settings window.
- “About” – details omitted.
- “Open quick actions” – details omitted.
- “Open widgets” – details omitted.
- “Open caption” – opens subtitles (requires TTS service to display text when Airi speaks; default hides on hover).
- “Caption overlay” – includes two options: “Follow window” (default, caption moves with main window) and “Reset position”.
- “Quit” – closes Airi.

<details>

<summary>Terminology explanation: (click to expand)</summary>

* TTS

TTS stands for Text‑to‑Speech, which converts written text into natural‑sounding spoken output.

</details>

### Settings Window

[ *This section only describes what the window contains; detailed functions are in Chapter 4.* ]

You can open settings by clicking “Expand” on the main window and selecting “Open settings”, or by right‑clicking the Airi tray icon.

There are nine sections:

- “AIRI Character Card” – configure character personality.
- “Body Modules” – configure various functions: Consciousness, Vocalization, Hearing, Vision, Short‑term Memory, Long‑term Memory, Discord, X/Twitter, Minecraft, Factorio, MCP Server, Rhythm Game.
- “Scene” – not yet released.
- “Character Model” – choose and configure the character’s model.
- “Memory Bank” – not yet released.
- “Service Sources” – configure LLM, TTS, STT services.
- “Data” – manage Airi’s data.
- “Connection” – configure WebSocket server address.
- “System” – includes four sub‑sections: “General” (theme, language, etc.), “Color Scheme”, “Window Shortcuts” (empty – see warning), “Developer” (advanced features, see Chapter 4).

### Chat Window

You can open the chat window by clicking “Expand” on the main window and selecting “Open chat”.

Here you can chat with Airi.
Detailed introduction omitted.

## Chapter 4 – Settings

You can open settings by clicking “Expand” on the main window and selecting “Open settings”, or by right‑clicking the Airi tray icon.

### AIRI Character Card

Here you can upload, create, or modify the default character card.

About uploading: the popup suggests any file type is supported, but I haven’t used it, and there is no export function, so details omitted.

About creating a new character card:
You can set the character’s identity, behavior, modules, etc.

**Identity** includes name, nickname, description, creator’s notes.
Name is the official name; if a nickname is set, it will be used first.
Description is the detailed personality. You can be creative or refer to the default character card.
(Note: if you refer to the default card, you may omit the part about ACT tags.)
Creator’s notes – I haven’t used them, details omitted.

**Behavior** includes personality, scenario (environment/background/context), and greeting. I haven’t adjusted these, details omitted.

**Modules** – you can configure character‑specific body modules; usually leave as is, details omitted.

**Settings** includes system prompt, history prompt instructions, and version (character card version). I haven’t used the first two, details omitted.

The most important parts are name and description in Identity. After filling them in, click “**Create**” to complete the character card.

Finally, click the circle in the bottom‑right corner of the card, or select the card and click Activate, to enable your character card.
[ ***Note: Newly created cards are not enabled by default. You must activate them.*** ]

### Body Modules

Here you can configure various Airi functions, as follows:

#### Consciousness

First select a service source (or add a new one) and select it.
[ *If there are too many sources and you cannot click the ones at the back, move the mouse over a tab, press the middle button, and drag left/right.* ]
Then select a model – configuration is complete.

#### Vocalization

First select a service source (or add a new one) and select it.
Then select a model, then select a voice.
You can also choose “None” to disable Airi’s voice.

At the bottom of this page, you can enter text to test the voice by clicking “**Test voice**”.

[ Note: The configuration process may vary slightly for different service sources. This uses Alibaba Bailian as an example; follow the actual interface. ]
[ For some services, the Pitch control may not work. ]

Other details omitted.

#### Hearing

First select your audio input device.
Then select a service source (or add a new one) and select it.
Then select a model – configuration is complete.

Additionally, you can enable “Auto‑send transcribed text” to send automatically, or disable it to adjust the transcription result (I think – I haven’t successfully used Hearing).
You can also set “Auto‑send delay”.

In the middle of this page, you can test the microphone.
Click “**start monitoring**” to start listening.
You can adjust Sensitivity (I haven’t tried it, details omitted).

At the bottom of this page, you can test STT.
Click “**start speech‑to‑text**” to begin testing.
The result will appear under “Transcription Result”.

Other details omitted.

#### Vision

First select a service source (or add a new one) and select it.
Then select a model – configuration is complete.

You can also set “Capture interval”.

[ ***This function requires enabling vision capture in System → Developer → vision capture. See that section for details.*** ]

Other details omitted.

#### Short‑term Memory

Not yet released.

#### Long‑term Memory

Not yet released.

#### Discord

Here you can configure a Discord bot so that Airi can join your Discord server and interact.
You need to obtain your Discord bot token and enter it in the appropriate field.

**Note:**
This function requires a Discord bot, which is not included in the installer version. You need to extract the relevant files from the GitHub page. Since I have a low priority for this, tutorial omitted.

#### X/Twitter

Similar to Discord; requires a bot. Tutorial omitted.

#### Minecraft

Requires a bot. Tutorial omitted.

#### Factorio

Requires a bot. Tutorial omitted.

#### MCP Server

I haven’t used this. Tutorial omitted.

#### Rhythm Game

I am still exploring this. Tutorial omitted.

### Scene

Not yet released.

### Character Model

Here you can choose and set the character’s model.

Airi supports Live2D models and VRM 3D models.

Click “**select model**” to choose a model. In this version, there are two Live2D and two VRM models by default.
Select one and click “**confirm**” to switch models.
You can also click “**add**” to import your own Live2D or VRM model.

[ **Note: Old Live2D models are not supported! You must use files including “*.moc3”.** ]
[ **Before importing a Live2D model, you must compress the model folder into a “*.zip” file.** ]

- **If you choose a Live2D model**

Expand “Zoom & Position” to adjust the model’s size and position in the main window.
x is horizontal (left/right), y is vertical (up/down).

Expand “parameters” to set mouse tracking, Idle Animation, frame rate, Auto Blink, Force Auto Blink (fallback timer), Shadow, reset to default parameters, clear model cache, and all model‑specific parameters.
If you want to set an idle animation, ensure the model zip includes animation files.
Other details omitted.

Expand “Expressions” to enable the Expression System.
I haven’t tested this yet, details omitted.

- **If you choose a VRM 3D model**

Expand “Scene” to set Model Position, camera angle (degrees), camera distance (zoom), model orientation (Y‑axis rotation), model gaze direction, etc.
This section, including “Change model”, is omitted due to time constraints.

### Memory Bank

Not yet released.

### Service Sources

Here you can configure LLM, TTS, and STT service sources.

Details omitted.

### Data

Here you can manage Airi’s various data.

[ ***Note: This section allows deletion and clearing of data, which cannot be undone. Please operate with caution!*** ]

The first box contains “Open app data folder”.
Click “**Open folder**” to open it.
[ *Note: There is a bug – it opens the folder multiple times at once.* ]

The second box allows you to import/export chat history or delete all chat sessions.
(Details omitted.)

The third box allows you to delete all imported models or reset module preferences and credentials.
(Details omitted.)

The fourth box allows you to reset desktop settings and state.
(Details omitted.)

The fifth box allows you to reset all provider settings and credentials, or clear every local setting, provider configuration, and model.
(Details omitted.)

### Connection

Here you can configure your WebSocket server address.

(Details omitted.)

### System

#### General

Here you can set the program theme, language, etc.

Theme defaults to light; click the button to switch to dark mode.

Language sets the interface language.

Control island icon size changes the size of the three buttons at the bottom‑right of the main window.

Finally, you can choose whether to allow collection of usage data and crash reports, or read the privacy policy (click “Privacy Policy” to open).

#### Color Scheme

Here you can change the theme color.

You can enable the RGB option to make the theme color cycle like an RGB strip.
You can also drag the black line or click on the color bar to change the theme color.
Below that is a color preview.

You can also select a preset below to change the theme color.
[ ***Note: You should click on a circle, not the square box.*** ]

#### Window Shortcuts

[ ***Warning: This option has no content and no back button. Once you enter, you must close and reopen the settings window. Do not click it!*** ]

#### Developer

Here you can use some advanced features.

[ **Since most of this content is in English and consists of advanced features that are rarely needed, this part is for reference only!** ]

- In the first box, you can click “**Open**” to open the developer tools window (like F12 in a browser).

- The second “Markdown stress test” – details omitted.

- The third “Lag visualization” – details omitted.

- The fourth “Enable stage transition animation” – details omitted.

- The fifth “Use page‑specific cutscenes” – details omitted.

##### useMagicKeys tool

Blank – details omitted.

##### useElectronWindowMouse

Here you can detect the mouse cursor position on the screen.

##### Displays

Here you can visualize the mouse cursor position on the screen.

##### widgets calling

Details omitted.

##### Context Flow

Real‑time inspection of incoming context updates (server + broadcast) and outgoing chat hooks. Use this to verify how plugin context (e.g., VSCode coding context) flows into the chat pipeline and out to server events.
Details omitted.

##### relative mouse

Here you can visualize the mouse cursor position within this window.

##### beat sync visualizer

Details omitted.

##### WebSocket Inspector

Details omitted.

##### Plugin Host Debug

Details omitted.

##### Screen Capture

Here you can capture any application window or the entire screen.
There are four options at the top:
“applications” – select any open application window, click “**share window**” to view it at the top; move the mouse over the capture and click “stop” to stop.
“displays” – capture the whole screen, click “**share screen**” to view; move the mouse over the capture and click “stop” to stop.
“devices” – omitted.
“refetch” – omitted.

##### vision capture

Details omitted.
