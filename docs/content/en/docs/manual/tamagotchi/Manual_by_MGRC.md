# Project Airi Unofficial Manual

Author: JhIcefair

Writing time: (UTC+8) April 2, 2026 – afternoon

Corresponding version: AIRI-0.9.0-beta.4-windows-x64

**Disclaimer:**  
- I am not a technical person. Technical functions and operations of Airi will not be explained in detail in this manual.  
- I am only responsible for the Chinese version of this manual.  
- The English version of the manual was translated with the help of Deepseek, and may not be consistent with the actual display. There may be differences in meaning, please forgive us.  
- Most of the content comes from my own exploration and may not match reality. Please rely on your actual experience.  
- Due to my own schedule, this manual may not be updated promptly.  
- Due to limited ability, this manual only covers some detailed tutorials for Airi installed via the installer on Windows.  
- Version updates may change content. This manual only describes the latest version before the writing time. If you find differences, please handle them yourself.  
- If you have additions, please @jhicefair on the official Project Airi Discord channel. I will add them if possible.  
- If you have questions about this manual, please @jhicefair on the official Project Airi Discord channel.  
- If you have other questions, please leave a message on the official Project Airi Discord channel.  
- I can’t think of anything else important right now, so let’s stop here!  
- Have fun! AwA

## Chapter 1 – Installation
Go to the Project Airi GitHub homepage: [moeru-ai/airi](https://github.com/moeru-ai/airi)

Find the “Releases” option on the right side of the page.

Click “+ 68 releases”  
(Note: the number indicates other releases; yours may not be 68)

Pick a version, find “**Assets**” below, and expand it.

Choose the version suitable for your computer and download it.  
(Note: You may need to click “Show all 19 assets” at the bottom – the number may vary.)

[ *The following uses the Windows installer version as an example.* ]

Locate the downloaded installer and double-click to install.  
*(Time constraints – this part is skipped; I believe you can handle it.)*

## Chapter 2 – Initial Configuration

### Section 1 – Preparation

Before you begin, you need to prepare at least one API from an LLM service provider.

[ Obtaining APIs varies by provider. Due to time constraints, no tutorial is provided here. Please search online or ask an AI. ]

Keep your API safe and do not share it with others.

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
“websocket status” – top right, click to open connection settings (detailed explanation omitted).  
“Expand” – bottom right, click to reveal more options (see below).  
“Open hearing control” – bottom right, allows you to speak to Airi (requires STT service; not covered here).  
“Move” – bottom right, long-press and drag to reposition the main window.

Click “Expand” to reveal eight options:  
- “Open settings” – opens the settings window.  
- “Switch character” – switch character cards (details omitted).  
- “Open chat” – opens the chat window.  
- “Refresh” – refreshes the main window.  
- “Switch to dark mode” – toggles light/dark theme.  
- “Unpin” – makes the main window not always on top.  
- “Always show” / “Hide on hover” – allows clicking through the window.  
- “Close” – closes Airi.

### System Tray Other Options

Locate the Airi icon in the system tray (may be in hidden icons).  
Right-click the icon to see ten options:  
“show” - The main window can be summoned, but it is generally not needed.  
“adjust sizes” – includes: “recommended(450x600)”, “full height”, “half height”, “full screen”  
“align to” – includes: “center”, “top left”, “top right”, “bottom left”, “bottom right”  
“settings…” - You can open the settings interface  
“about”  
“open inlay…”  
“open widgets…”  
“open caption…” – shows subtitles (requires TTS service)  
“caption overlay” – includes: “follow window”, “reset position”  
“quit”

### Settings

[ *Only the structure is described here; detailed functions are in Chapter 4.* ]

Nine sections:

- “AIRI Character Card” – configure character personality.  
- “Body Modules” – configure various functions: Consciousness, Vocalization, Hearing, Vision, Short-term Memory, Long-term Memory, Discord, X/Twitter, Minecraft, Factorio, MCP Server, Rhythm Game.  
- “Scene” – not yet released.  
- “Character Model” – choose and configure the character’s model.  
- “Memory Bank” – not yet released.  
- “Service Sources” – configure LLM, TTS, STT services.  
- “Data” – manage Airi’s data.  
- “Connection” – configure WebSocket server address.  
- “System” – includes: General, Color Scheme, Window Shortcuts, Developer.

### Chat Window

You can chat with Airi here. Details omitted.

## Chapter 4 – Settings

### AIRI Card

Upload, create, or modify character cards.

Regarding uploading, judging from the pop-up window, it seems to support any file, but I haven't used it. The character card also doesn't have an export function, so there is no relevant introduction available.

To create a new character card:  
Set the character’s identity, behavior, modules, etc.  
Identity includes name, nickname, description, creator’s notes.  
Description is the detailed personality.  
Behavior includes personality, scenario, greeting.  
Modules – usually leave as is.  
Settings – system prompt, history instructions, version.  

After filling in name and description, click “**Create**”.

Then activate the card by clicking the circle or selecting it and clicking “Activate”.  
[ ***Please note: After creating a character card, it is not enabled by default and must be activated before it can be used.*** ]

### Modules

#### Consciousness

Select a service source and then a model.  
[ *If there are too many optional service sources, it may be difficult to click on the service sources at the back. In this case, you can move the mouse cursor to a tab, press the middle mouse button, and then drag left and right to solve the problem.* ]

#### Vocalization

Select a service source, then a model, then a voice.  
[ *If there are too many optional service sources, it may be difficult to click on the service sources at the back. In this case, you can move the mouse cursor to a tab, press the middle mouse button, and then drag left and right to solve the problem.* ]

You can also choose “**None**” to disable voice.

At the very bottom of this page, you can enter text to test the sound, and by clicking the '**Test Sound**' option, a test audio can be generated.

[ Please note: The configuration process on this page may vary slightly for different service sources. This example uses Alibaba Bailian; others should be based on actual situations. ]  
[ Some of the services related to Pitch features may not work. ]

#### Hearing

Select your audio input device, then a service source, then a model.  
[ *If there are too many optional service sources, it may be difficult to click on the service sources at the back. In this case, you can move the mouse cursor to a tab, press the middle mouse button, and then drag left and right to solve the problem.* ]

You can enable auto-send transcribed text and set auto-send delay.

Test microphone and STT at the bottom.

#### Vision

Select a service source and a model.  
[ *If there are too many optional service sources, it may be difficult to click on the service sources at the back. In this case, you can move the mouse cursor to a tab, press the middle mouse button, and then drag left and right to solve the problem.* ]

Set capture interval.  
(Requires enabling vision capture in System → Developer → vision capture.)

#### Short-term Memory

Not yet released.

#### Long-term Memory

Not yet released.

#### Discord

Configure Discord bot token. (Bot not included in installer version; tutorial omitted.)

#### X/Twitter

Similar to Discord; requires bot. Tutorial omitted.

#### Minecraft

Requires bot. Tutorial omitted.

#### Factorio

Requires bot. Tutorial omitted.

#### MCP Server

Not used; tutorial omitted.

#### Rhythm Game

Not used; tutorial omitted.

### Scene

Not yet released.

### Models

Choose between Live2D and VRM 3D models.

Click “select model”, pick one, then “confirm”.

Click “add” to import your own model (Live2D must be a *.moc3 file, compressed as *.zip).

#### For Live2D models

Expand “Zoom & Position” to adjust size and position.
Expand “parameters” to set mouse tracking, idle animation, frame rate, auto blink, shadow, etc.
Expand “Expressions” to enable expression system.

#### For VRM 3D models

Expand “Scene” to adjust model position, camera angle, distance, rotation, gaze direction, etc.

### Memory

Not yet released.

### Providers

Configure LLM, TTS, STT sources. Tutorial omitted.

### Data

Manage data:

Open app data folder.

Import/export chat history, delete all chat sessions.

Delete imported models or reset module preferences.

Reset desktop settings and state.

Reset all provider settings and credentials.

### Connection

Configure WebSocket server address. Tutorial omitted.

### System

#### General

Set program theme, language, control island icon size, and allow usage data collection.

#### Color Scheme

Change theme color. Enable RGB auto-change, pick a color, or choose a preset.

#### Window Shortcuts

[ WARNING: This option has no content and no back button. Do not click it – you will need to close and reopen settings. ]

#### Developer

[ **Since this part mostly involves advanced features that are generally not used, the introduction here is for reference only!** ]

Advanced features:

- Open developer tools (like F12).  
- Markdown stress test, lag visualization, stage transition animations, etc.

##### useMagicKeys 

(blank)

##### useElectronWindowMouse

detects cursor position.

##### Displays

visualizes cursor position.

##### widgets calling

omitted.

##### Context Flow

inspect context updates.

##### relative mouse

visualizes cursor position within current window.

##### beat sync visualizer

for rhythm game.

##### WebSocket Inspector

omitted.

##### Plugin Host Debug

omitted.

##### Screen Capture

capture any application window or full screen.

##### vision capture

detailed tutorial omitted.
