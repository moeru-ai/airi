---
title: Project AIRI Manual
authors:
  - name: 沐玖芸萱
    aliases:
      - 沐玖芸萱
      - MuGewRayce
    role: Lead writing team
    kind: person
  - name: JhIcefair
    role: Contributing editor (primary)
    kind: person
  - name: 0xSelenicDove
    githubUsername: 0xSelenicDove
    role: Contributing editor
    kind: person
  - name: MilkyWeighW
    githubUsername: MilkyWeighW
    role: Contributing editor
    kind: person
---


This manual corresponds to version: AIRI-0.11.3


::: warning Before You Read


- Some of AIRI's more technical features and operations are not covered in detail in this manual.
- The lead editors are only responsible for the Chinese version of this manual. Other language versions are currently produced by AI translation with light manual correction, and may differ from the actual content — please treat the actual app as the source of truth.
- Most of the manual's content was researched by the lead writing team and other contributors through exploration; it may not match reality or may contain inaccuracies. Please rely on your own actual experience.
- This manual may not be updated promptly.
- Due to length constraints, this manual currently covers only part of the detailed tutorials for the desktop and web clients. (The manual focuses on desktop features; most web features can be referenced from the desktop version, but note that the two differ in some places — please treat the actual app as the source of truth.)
- Some parts of the software are in English and have no translation. This manual tries to translate the relevant content; the final translation should be treated as unofficial.
- AIRI version updates may change some content. This manual only describes the features of the latest version at the time of writing. For earlier or later versions, the manual may keep descriptions of some features; if you encounter differences, please resolve them yourself.
- If you have questions about this manual, feel free to leave a message in the [Project AIRI official Discord](https://discord.gg/TgQ3Cu2F7A) by mentioning @jhicefair or @0x_selenic_dove.
- To join the WeChat group: open the [WeChat group instructions](https://github.com/moeru-ai/airi/blob/main/docs/wechat.md) in the repository, scan the QR code to add the assistant, and note `AIRI`; an admin will invite you to the group. You can also mention 爱吃吃的哥伦比娅 in the group, or contact them via the WeChat ID `0xColumbina`.
- To join the QQ group: open the [QQ group invite link](https://qun.qq.com/universal-share/share?ac=1&authKey=9g00d%2BZS7nORzcJugNNddJ7rCghZTIR7fhXabGwch2S%2BG%2BKGIKwlN1N2nIqkh2jg&busi_data=eyJncm91cENvZGUiOiIxMDU4MTU2Njk3IiwidG9rZW4iOiJmcnkra1hWNFIxNytEcG0zcHRUdVJIaldlRDFxN0dzK080QWtvTEdOQjJkNEY2eUFta1g1clNpbkxSMS9FQWFYIiwidWluIjoiMTI2MDkwNzMzNSJ9&data=b1eJrwn3GVOUh7YIxZ7l9vHQo99HPmRxKPpMKlDCmfzx8Y57IXb2EZCMaOC9rVTd2U558qpNjwUYUWlPHxVHvg&svctype=4&tempid=h5_group_info) provided in the repository README and confirm your join with QQ; if the link is expired, use the latest link from the repository README.
- For other usage questions, you are also welcome to discuss them with the community in AIRI's Discord, WeChat group, or QQ group.
- Enjoy! AwA


:::


<a id="chapter-1-installation"></a>


## Chapter 1 · Installation


Go to the [latest Project AIRI release](https://github.com/moeru-ai/airi/releases/latest), download the file matching your device from **Assets**, then open the installer and follow the prompts to complete the installation. The `<version>` in the table changes with the latest release; please treat the actual release as the source of truth.
| Platform | Device | File to download |
| --- | --- | --- |
| Windows | x64 or Windows 11 ARM64 | `AIRI-<version>-windows-x64-setup.exe` |
| macOS | Apple silicon (M series) | `AIRI-<version>-darwin-arm64.dmg` |
| macOS | Intel | `AIRI-<version>-darwin-x64.dmg` |
| Linux | x64 Debian-based systems, e.g. Ubuntu | `AIRI-<version>-linux-amd64.deb` |
| Linux | x64 RPM-based systems, e.g. Fedora, openSUSE | `AIRI-<version>-linux-x86_64.rpm` |
| Linux | ARM64 Debian-based systems, e.g. Ubuntu | `AIRI-<version>-linux-arm64.deb` |
| Linux | ARM64 RPM-based systems, e.g. Fedora, openSUSE | `AIRI-<version>-linux-aarch64.rpm` |
| Android |  Huawei HarmonyOS and other Android devices | `AIRI-<version>-android.apk` |
| iOS/iPadOS |  iPhone, iPad | `AIRI-<version>-ios.ipa`|
::: info About the Windows installer
The installer offers two installation modes: for yourself or for all users.
Choosing to install for yourself does not require administrator privileges, but only the current user can access it; choosing to install for all users requires administrator privileges, but every user on this computer can use the software.
:::
::: info About the iPhone and iPad installer
Only an ipa file is currently provided; it must be signed and installed manually. No detailed installation tutorial is available yet.
The project team will publish a TestFlight beta link in the future — stay tuned!
:::
::: info About Huawei HarmonyOS
There is no native HarmonyOS build yet. If you use HarmonyOS NEXT (pure-blood HarmonyOS), install the Android version via Zhuoyitong (卓易通).
:::
<a id="chapter-2-initial-configuration"></a>
## Chapter 2 · Initial Configuration
Before you start using AIRI, you need at least one chat provider and a usable model. Cloud services usually require creating an API key or signing in; local services require starting the model service first.
Complete the initial configuration with the steps below:
1. Open AIRI and enter the first-run setup wizard.
2. Select your language.
3. If you want to use your own AI model, click "**Configure your own AI service provider**". To use the official AI model, click "**Sign in**". If you are not sure which provider to use, we recommend starting with the [AIRI official provider](../../config/providers/consciousness/official.md), [OpenRouter](../../config/providers/consciousness/openrouter.md), an [OpenAI-compatible provider](../../config/providers/consciousness/openai.md), or local [Ollama](../../config/providers/consciousness/ollama.md).
4. If using your own AI model (see "Configuration → Providers → Chat Providers" in the sidebar for how to configure):
   1. Select the provider you prepared, then click "**Next**";
   2. Enter your API key (change the Base URL if necessary), then click "**Next**";
   3. Click "**Next**" once more;
   4. Select the model you plan to use, then click "**Save and Continue**".
5. If using the official AI model: refer to [AIRI Official Provider](../../config/providers/consciousness/official.md).
Congratulations — barring any surprises, you have completed AIRI's initial configuration!
::: tip Only Chat Configuration Is Needed First
Once the chat provider and model are configured successfully, AIRI can reply to messages. Afterwards, you can add text-to-speech (TTS), speech recognition (ASR/STT), vision understanding, artistry, and other capabilities. See [Voice Input and Output](../../config/audio.md), [Vision Understanding](../../config/vision.md), or [Artistry](#chapter-4-art) for how to configure them.
:::
::: warning API Key Security
API keys, AccessKey Secrets, and other service credentials should only be stored on your device. Do not commit them to the repository, post them in issues, screenshot them, or share them with others.
:::
<a id="chapter-3-interface-overview"></a>
## Chapter 3 · AIRI Interface Overview
<a id="chapter-3-main-window"></a>
### > Main Window
This section mainly covers the desktop client. The web/mobile clients can refer to this section; other web/mobile-only features are covered [here](#chapter-3-main-web).
This window displays the virtual character and has three controls:
- "Expand ⌃" — located at the bottom right; click to expand more options (see below).
- "Hearing Control &#x1F3A4;&#xFE0E;" — located at the bottom right; click to talk with AIRI.
    ::: info About Hearing Control
    Clicking it opens the "Hearing Input" panel. First enable microphone input and select a microphone; if the system asks for permission, allow AIRI to use the microphone. Once a speech recognition service is configured, what you say is transcribed and sent to the current chat session. While AIRI is speaking, it pauses listening so its own voice is not recognized again.
    :::
- "Move &#x2725;" — located at the bottom right; press and hold the left mouse button and drag to change the main window's position on the desktop.
After clicking "Expand ⌃", nine sub-options appear, in order from top to bottom and left to right:
- "Sign in" — sign in to your own AIRI account.
- "Open Settings" — open the AIRI settings interface.
- "Switch Character" — switch character cards.
- "Open Chat" — open the chat window.
- "Refresh" — refresh the main window.
- "Move to screen center" — move the window to the center of the screen.
- "Switch to dark mode" — toggle AIRI's interface background between light/dark.
- "Unpin" — stop keeping the AIRI character model pinned on top.
- "Always show" / "Hide on hover" — keep the AIRI main window from blocking mouse clicks on the content behind it, so it does not interrupt your work.
- "Close" — close AIRI with one click.
![](./assets/manual-overlay-panel.avif)
<a id="chapter-3-system-tray"></a>
### > Other System Tray Options
First, find AIRI's small icon in the taskbar.
::: tip If you cannot find the taskbar/menu bar icon...
On Windows, you may need to click "Show hidden icons (⌃)" in the taskbar to reveal the AIRI icon.
On macOS, the icon may be hidden behind the notch (especially on MacBook built-in displays). In that case, hide some existing menu bar icons — open System Settings → Menu Bar and show or hide menu icons.
:::
Right-click AIRI's small icon to see ten options:
- "Show" — summon the main window; usually not needed.
- "Resize" — resize the main window; this also centers it. Contains four sub-options:
  - "Recommended (450x600)" — set to the recommended size 450x600.
  - "Full Height" — make the main window's height fill the desktop height.
  - "Half Height" — make the main window's height half of the desktop height.
  - "Full Screen" — make the main window fill the entire desktop.
- "Align to" — align the main window to a specific position on the desktop. Contains five sub-options:
  - "Center" — align to the center of the desktop.
  - "Top Left" — align to the top-left corner of the desktop.
  - "Top Right" — align to the top-right corner of the desktop.
  - "Bottom Left" — align to the bottom-left corner of the desktop.
  - "Bottom Right" — align to the bottom-right corner of the desktop.
- "Settings" — open the settings interface.
- "About" — open the About window to view the version number, visit the project homepage, update AIRI, and choose the update channel.
- "Open Quick Action" — open a floating input box. Enter a short request for AIRI and press Enter; the window hides and shows the processing result as a notification; press Esc to cancel.
- "Open Widgets" — open the widgets window. Widgets provided by maps, weather, artistry, or extensions are shown here; the window may be empty when the related tools or extensions are not running.
- "Open Captions" — open the captions. Text is shown while AIRI speaks only when a TTS service is enabled; by default, captions hide when the mouse cursor hovers over them.
- "Caption Overlay" — contains two sub-options:
  - "Follow Window" — selected by default; the caption window position follows the main window. Uncheck to make the caption position independent.
  - "Reset Position" — reset the caption position.
- "Quit" — close AIRI with one click.
<a id="chapter-3-settings-overview"></a>
### > Settings Interface
::: info Scope of This Section
This part only introduces what is in the interface; the detailed feature descriptions are in Chapter 4.
:::
You can open the settings interface in either of two ways:
- Click "Expand" in the main window, then select "Open Settings".
- Right-click the AIRI small icon in the system tray and select "Settings".
The settings interface includes the following nine sections:
- "AIRI Card" — select and configure the character's persona.
- "Modules" — configure AIRI's various features, including Consciousness, Speech, Hearing, Vision, Short-term Memory, Long-term Memory, Discord, X / Twitter, Web Search, Minecraft, Factorio, MCP Servers, and Beat Sync.
- "Scenes" — configure AIRI's scene (background).
- "Models" — select and set the character's model.
- "Memory" — feature not yet released.
- "Providers" — configure the sources for LLM, TTS, STT, and Artistry services.
- "Data" — manage AIRI's various data.
- "Connection" — configure your WebSocket server address.
- "System" — includes four sub-options:
  - "General" — set the program theme, language, and more.
  - "Color Scheme" — set the theme color.
  - "Window Shortcut" — set the global shortcut for Spotlight.
  - "Developer" — advanced tools for development and troubleshooting; no configuration is needed for daily use. See the [developer tools](../../../contributing/desktop-developer-tools) for details.
![](./assets/manual-settings-window.avif)
<a id="chapter-3-chat-window"></a>
### > Chat Window
You can click "Expand" in the main window and select "Open Chat" to open the chat window.
![](./assets/manual-chat-window.avif)
Here you can chat with AIRI. When text-to-speech is enabled and AIRI is reading a reply aloud, a "Stop Reading" button appears in the input area; clicking it only stops the current speech playback, not the already-generated text reply.
Click the "Conversations" button on the left of the input area, or click the chat window title, to open the conversation list. The list shows a preview and sync status for each conversation, ordered by last update time; you can switch, delete, or start a new conversation for the current character. Deleted conversations usually cannot be recovered, so confirm you no longer need the content first.
<a id="chapter-4-settings"></a>
## Chapter 4 · Settings
You can open the settings interface in either of two ways:
- Click "Expand" in the main window, then select "Open Settings".
- Right-click the AIRI small icon in the system tray and select "Settings".
<a id="chapter-4-airi-card"></a>
### > AIRI Card
Here you can upload, create, or directly modify the default character card.
![](./assets/manual-airi-card.avif)
::: info About Import and Export
Character cards can be imported or exported as AIRI character card packages. A package uses Character Card V3 data and may optionally include a Live2D, Spine, or VRM display model. On import, AIRI validates the manifest and character card data in the package; packages with an incorrect format or missing required files cannot be imported.
:::
To create a new character card, we recommend configuring in the following order:
1. Fill in the identity section, including name, nickname, description, and creator notes.
2. Fill in the behavior section as needed, including personality, scenario (think of it as the surrounding environment, background, or situation), and greeting.
3. Adjust the modules section as needed to assign specific body modules to the character.
4. Configure the Artistry section as needed to enable image generation for the character.
5. Finally, review the settings section, including system prompt, post-history instructions, and version.
6. Once the content is correct, click "**Create**" to finish creating the character card.
7. After creation, click the circle at the bottom right of the character card, or click the card and then activate it, to officially enable it.
The most important parts of the identity section are the name and description:
- The name is the character's official name; if a nickname is set, the nickname takes priority.
- The description contains the concrete details of the persona; you can write freely or reference the default character card.
::: info Editor's Notes
- If you reference the default character card when writing your own character's settings, the ACT-tag related content in the latter half does not need to be included.
:::
- The behavior section supplements personality, scenario, and greeting; the modules section assigns chat, vision, speech, and display models to the character; the Artistry section sets the character's image generation preferences; the settings section contains the system prompt, post-history instructions, and version information.
::: warning Manual Activation Required
A newly created character card is not enabled by default; you must activate it manually to use it. Click the play button below to enable it.
:::
<a id="chapter-4-modules"></a>
### > Modules
Here you can configure AIRI's various features, as follows:
![](./assets/manual-modules.avif)
#### > Consciousness
Refer to [Chat Model](../../config/llm.md) for configuration.
![](./assets/manual-provider.avif)
#### > Speech
Refer to [Voice Input and Output](../../config/audio.md) for configuration. If you do not want AIRI to speak, select "None".
::: tip Additional Notes on the Speech Page
- Select the provider and model first, then choose a voice offered by that model; the fields shown differ between providers.
- Pitch only takes effect for providers and models that support this parameter.
:::
![](./assets/manual-speech.avif)
#### > Hearing
Refer to [Voice Input and Output](../../config/audio.md) for configuration. If you are not using voice input for now, select "None".
::: info Terminology: Speech Recognition STT
STT stands for "Speech-to-Text", also known as automatic speech recognition (ASR).
Its goal is to let the computer understand human speech and convert it into the corresponding text.
:::
::: info When using on macOS
The first time you use AIRI's voice input on macOS, a one-time microphone permission prompt appears. When you see the following prompt, choose Allow; otherwise the feature will not work properly.
![](./assets/manual-permission-microphone.avif)
:::
![](./assets/manual-hearing.avif)
In addition, you can:
- Enable Auto-send transcribed text to send automatically.
- Disable it to adjust the transcription result before sending.
- Adjust the send delay via Auto-send delay.
::: info Auto-send
With auto-send enabled, recognized text is sent to the chat session after the configured delay; with it disabled, you can review or edit the text and send it manually.
:::
To test the microphone:
1. Click "**start monitoring**" in the middle of the interface to start listening.
2. Adjust the Sensitivity if needed.
To test the STT feature:
1. Click "**start speech-to-text**" at the bottom of the interface to start the test.
2. Check the recognition result under Transcription Result.
#### > Vision
Refer to [Vision Understanding](../../config/vision.md) for configuration.
![](./assets/manual-vision.avif)
::: warning Vision Capture must be started before using screen vision
You do not need to enable this tool just to configure a vision provider and model.
To let AIRI analyze the screen or a window, go to "System → Developer → Vision Capture": grant screen recording permission, choose the window or display to capture, and click "Start ticker". To feed the recognition results into AIRI conversations, enable "Publish to character" as well.
Vision Capture is the current desktop debugging/development workflow; leaving the page stops the capture loop. See the [desktop developer tools](../../../contributing/desktop-developer-tools#vision-capture) for the full instructions.
:::
<a id="chapter-4-art"></a>
#### > Artistry
Here you can configure AIRI's artistry capability.
Refer to "Configuration → Providers → Artistry Providers" in the sidebar for how to configure and use different AI providers to create works.
::: warning Use a chat model that supports tool calling
Artistry does not generate images directly from the character: AIRI provides the current **chat model** with tools for the configured image service, and the model invokes that tool to submit the generation task. Therefore, the chat model and provider must support **Tool Calling / Function Calling**.
After selecting a provider under "Settings → Consciousness", choose a model that the provider explicitly marks as supporting tool calling. Models that only support plain text chat, or providers that do not pass through tool calls, may only reply in text, refuse to generate, or never submit a task to the selected image service.
After configuration, first have the character make a simple image request. Confirm AIRI has initiated a tool call; if the provider offers task status, history, or a console, you can also confirm the task was received there. AIRI only shows the result after the task finishes and returns an image. For each provider's specific verification method, see the corresponding page under "Configuration → Providers → Artistry Providers" in the sidebar.
:::
#### > Short-term Memory
Under development — stay tuned. If you have ideas for implementing this feature, you are welcome to suggest them via issues or PRs.
#### > Long-term Memory
Under development — stay tuned. If you have ideas for implementing this feature, you are welcome to suggest them via issues or PRs.
#### > Discord
The Discord integration requires running the bot service from source so AIRI can join the message and voice channels of a Discord server.
1. Create a Discord application, enable the required intents, and configure the Bot Token in the [Discord bot integration guide](../../../integrations/discord.md).
2. Configure model and speech service credentials locally.
3. Start the Discord bot service from the repository root.
::: warning Credential Security
Discord Bot Tokens, model API keys, and speech service credentials should only be stored in local configuration files. Do not commit, screenshot, or share these configurations.
:::
#### > X / Twitter
Read the [X / Twitter integration guide](../../../integrations/x.md) and create/fill in the X Developer Platform app credentials. Do not expose the API Key, API Secret, or access tokens.
#### > Web Search
Read the [web search configuration guide](../../config/web-search.md), configure a Tavily API key, and learn about usage, privacy notes, and common issues.
#### > Minecraft
The Minecraft integration requires running a local agent service from source. Follow the [Minecraft agent integration guide](../../../integrations/minecraft.md) to configure a trusted server, AIRI, and the model service, then start the agent.
::: warning Security Reminder
Do not connect the Minecraft agent to untrusted public servers. It drives a local Minecraft session and network connection; a malicious server could cause unexpected behavior.
:::
::: tip Integration Service Documentation
The run-from-source instructions for Discord, Minecraft, Satori, and Telegram are all located under "Integration Services" in the sidebar.
:::
#### > Factorio
Read the [Factorio integration guide](../../../integrations/factorio.md) and fill in the trusted server's address, port, and in-game username in AIRI. AIRI does not ship with a directly deployable Factorio server integration.
#### > MCP Integration
MCP (Model Context Protocol) lets AIRI use external tools through local processes. On the desktop client, open this page to add a server, fill in its command, arguments, and environment variables, run a connection test first, then click "Apply and Restart" to start or restart the MCP service. You can also open the config file or use the JSON editor to maintain the configuration in bulk. Only run MCP servers you trust: they can execute commands on your machine and access the environment variables you grant them.
#### > Beat Sync
Beat Sync analyzes the audio captured from the screen to detect beats and sends beat signals to stage effects. Click "Start Screen Capture" and choose a screen or window that contains audio; use "Stop" to end the capture. The page provides sensitivity, minimum beat interval, and advanced filter parameters, and shows a real-time spectrum and beat visualization. The first use may require granting system screen recording permission.
<a id="chapter-4-stage"></a>
### > Scenes
Here you can configure the scene of the AIRI main interface — you can simply think of it as the background of the AIRI main interface.
There are two presets; click the **checkmark** in the center of a preset (it only appears when you move the mouse cursor over it) to enable that scene.
You can also click "**Upload to Scene Library**" to import your own image scene.
To clear the scene, click "**Clear Default**".
<a id="chapter-4-character-model"></a>
### > Models
Here you can select and configure the character's model.
![](./assets/manual-models.avif)
AIRI supports Live2D, Spine 2D, and VRM 3D models.
If you just want to switch between existing models, follow the steps below:
1. Click "**select model**" to open the model selection interface.
2. In the current version, two Live2D models and two VRM 3D models are available by default.
3. After selecting a model, click "**confirm**" to finish switching.
To import your own model, click "**add**" and choose the Live2D, Spine, or VRM format.
::: info Godot Stage (Experimental)
"Switch to Godot Stage (Experimental)" starts a separate Godot stage renderer; click "Back to Built-in Stage" again to switch back. Godot Stage currently only supports VRM models. After starting it and selecting a VRM, you can adjust camera X/Y/Z, yaw, pitch, and field of view in the Godot View; state or model loading errors are shown in this area.
:::
::: warning Before Importing a Model
- Old Live2D models are not supported; choose files that include "*.moc3".
- Before importing a Live2D model, you must compress the "model folder" into a "*.zip" file.
- Spine models must also be imported as "*.zip"; VRM uses a single "*.vrm" file.
:::
#### > If You Chose a Live2D Model
You can continue adjusting in the following order:
1. Expand "Scale and Position" to adjust the model's size and position in the main window. `x` is the horizontal (left/right) position, `y` is the vertical (up/down) position.
2. Expand "Model Parameters" to configure mouse tracking, Idle Animation, frame rate, Auto Blink, Force Auto Blink (fallback timer), Shadow, reset to default parameters, clear model cache, and all parameters involved in the model.
3. To set an idle animation, make sure the model package contains animation files.
4. If you also need expressions, expand "Expressions" and enable the Expression System.
When text-to-speech is enabled, AIRI automatically restores the Live2D mouth state after it finishes reading aloud.
::: info Model Parameters and Expressions
The parameters, idle animations, and expressions available for a model are determined by the model file itself. After enabling the Expression System, only the expressions the model actually provides are shown; if there are no expression or animation files, the corresponding options have no effect.
:::
#### > If You Chose a Spine 2D Model
Spine models provide a dedicated settings panel. You can adjust scale, X/Y position, skins, variants, idle animation, animation blend time, and playback speed, and limit the frame rate or adjust the render scale. If the model contains usable skins, variants, or animations, they appear in the corresponding dropdown options; missing resources are not shown.
#### > If You Chose a VRM 3D Model
Expand "Scene" first, then configure Model Position, view angle (degrees), camera distance (zoom), model facing (Y-axis rotation), and model look direction.
::: info VRM View
Position, rotation, camera distance, and look direction in the built-in stage are saved to the current settings.
:::
<a id="chapter-4-memory-bank"></a>
### > Memory
Feature not yet released. If you have ideas for implementing it, you are welcome to suggest them via issues or PRs.
<a id="chapter-4-providers"></a>
### > Providers
"Providers" is the entry point where AIRI connects to model and voice capabilities. Save the provider credentials here first, then select the provider and model on the corresponding feature page.
You can choose a category by purpose:
- **Chat**: configure the LLM that lets AIRI reply to messages; this is the required configuration to start using AIRI.
- **Text-to-Speech (TTS)**: let AIRI read replies aloud; then select a model and voice under "Modules → Speech".
- **Speech Recognition (ASR/STT)**: convert microphone speech into text; then select a model under "Modules → Hearing".
- **Artistry**: configure an image generation service; then use it under "Modules → Artistry".
If you skipped the initial setup wizard, we recommend configuring a chat provider first: select a provider, fill in its API key or sign in; if the provider requires it, fill in advanced fields such as Base URL and region; then use **Ping API** to verify connectivity. After verification, go to "Modules → Consciousness", select the provider and model, and send a message to confirm AIRI can reply.
After switching chat providers, the previously selected chat model is cleared; return to "Modules → Consciousness" and select a model for the new provider again.
::: warning Credential Security
API keys, AccessKey Secrets, and other service credentials should only be stored in the settings of the current device. Do not commit them to the repository, paste them in issues, screenshot them, or share them with others.
:::
::: tip Configuration Guides
- If you are unsure about a provider's fields, verification method, or error messages, read [General Configuration Instructions](../../config/common.md).
- To configure a chat model, read [Chat Model](../../config/llm.md); see "Configuration → Providers → Chat Providers" to learn how to configure different chat providers.
- To configure voice input and output, read [Voice Input and Output](../../config/audio.md); text-to-speech, speech recognition, and artistry providers are also located under the "Providers" menu in the sidebar.
- Vision understanding reuses the same credentials as the chat provider and requires selecting a chat model that supports image input; see [Vision Understanding](../../config/vision.md) for details.
:::
![](./assets/manual-providers-list.avif)
::: tip Technical Advice
The provider list follows the current AIRI version. If your provider is not in the list but supports the OpenAI-compatible interface, use the **OpenAI-compatible API** configuration; the Base URL and model ID must be filled in per that provider's official documentation.
:::
<a id="chapter-4-data"></a>
### > Data
Here you can manage AIRI's various data.
::: warning Irreversible Operations
This section can delete or clear related data, and the action cannot be undone — proceed with caution. Before performing delete and reset operations, we recommend double-checking the content.
:::
![](./assets/manual-data-management.avif)
"Move desktop window to center" moves the desktop window to the center.
::: tip Web Client Notes
"Open app data folder" and "Reset desktop settings and state" are only available on the desktop client; they are not available on the web/mobile clients.
:::
<a id="chapter-4-connection"></a>
### > Connection
"Connection" configures AIRI's service channel. You can set the WebSocket address and enable TLS when encrypted transport is needed. On the desktop client, you can also choose local-only access, allow LAN access, or fill in an advanced hostname (currently unavailable), and set an access token; the page shows a QR code for other devices to connect. Only enable LAN access on trusted networks and keep the access token safe.
![](./assets/manual-connection.avif)
::: tip macOS may require administrator verification
When enabling secure WebSocket, AIRI adds a local certificate to the macOS login keychain. The system may ask you to authorize this with Touch ID or your Mac login password. Verify with your fingerprint or Mac login password to continue.
![](./assets/manual-security-auth.avif)
:::
<a id="chapter-4-system"></a>
### > System
#### > General
Here you can set the program theme, language, and more.
![](./assets/manual-system-general.avif)
- The theme option defaults to light; click the button next to it to switch to dark mode.
- The language option sets the interface language; the choice persists after restarting AIRI.
- The control island icon size option changes the size of the three buttons at the bottom right of the main window.
- Finally, you can also choose whether to allow usage data and crash analytics collection, or read the privacy policy (click "Privacy Policy" to open it).
#### > Color Scheme
Here you can change the theme color.
![](./assets/manual-system-color-scheme.avif)
- You can enable the RGB option(I Want It Dynamic!) to make the theme color cycle automatically like an RGB light strip.
- You can also drag the black line below or click in the color bar to change the theme color.
- Below it is a color effect preview.
- You can also directly select one of the presets below to change the theme color.
::: tip Color Presets
Click any circle here, not the box.
:::
#### > Window Shortcut
Here you can change the **Spotlight** global shortcut. Spotlight is the floating input box used by "Open Quick Action".
1. Click the current shortcut.
2. Press the new key combination you want; it must include at least one modifier key from Cmd, Ctrl, Alt, or Super.
3. If the shortcut is already used by another app, AIRI warns about the conflict; press Esc to cancel recording.
4. Click "Reset" to restore the default shortcut.
::: tip Using Spotlight
Pressing the configured shortcut opens the quick-action input box. Enter a request and press Enter to send it to AIRI; press Esc to close it.
:::
#### > Developer
This page is for development, troubleshooting, and validating experimental features; regular users do not need to touch it. The full tool documentation has moved to [Developer Guide → Developer Tools](../../../contributing/desktop-developer-tools).
<a id="web-features"></a>
## > Web Client Feature Supplement
<a id="chapter-3-main-web"></a>
### > Web Client Main Interface
![](./assets/manual-main-web.avif)
Here you can see your character model and talk to it directly.
Broadly, it is divided into three parts:
- The character model space
- The chat box
- Others
Below we focus on the chat box and the other parts of the interface.
#### > Chat Box
The chat box is divided into two parts:
- The upper part displays and records the chat history
- The lower part is the input box, where you can type to talk to the character
Below the lower part there are three buttons: (text content is for reference only)
- Conversations (manage conversations; different conversations are independent of each other)
- Send method (choose how to confirm sending a message)
- Enable voice input
#### > Other Parts
##### > Upper Area
Includes three options:
- About
- Character Card
- Account & Settings
The third option contains three blocks:
- Account information
- Profile, Flux, Settings
- Sign out
###### > Profile
If you are signed in to AIRI, you can manage your account information here.
You can view and change the display name, manage the password and linked sign-in methods (e.g. GitHub, Google), and deactivate or delete the account in the danger zone. The avatar is currently taken from the account profile; uploading a new avatar here is not supported yet.
###### > Flux
Flux is the balance unit used by AIRI official services. After signing in, you can view the current balance, usage statistics, and transaction history; in regions or versions where purchase is available, you can also choose a plan and proceed to checkout here. Requests that use the official chat, vision, or speech services may consume Flux; fees for third-party providers are still billed separately by those providers.
###### > Settings
Same as the desktop settings; see [Chapter 4](#chapter-4-settings).
##### > Lower Area
Includes four options: (text content is for reference only)
- Position & Size
- Delete Chat History
- Toggle Light/Dark
- Background
###### > Position & Size
After clicking, you will see three new options to the left of the option — x, y, and scale — plus a vertical bar on the left of the web interface. `x` is the model's X-axis position, `y` is the model's Y-axis position, and `scale` is the model's scale (size). You can **click and drag** the vertical bar on the left of the web interface to adjust these three parameters.
![](./assets/manual-web-position-size.avif)
###### > Delete Chat History
Click to clear all chat history in one go.
::: warning Proceed with Caution
Deletion cannot be undone — proceed with caution!
:::
###### > Toggle Light/Dark
Switch the interface between "light" and "dark".
###### > Background
Change the background of the main interface.
<a id="features-issues"></a>
## > Historical Features & FAQ
### > FAQ
- After upgrading from an early version, if you previously changed the model's size and position, the model may "disappear". If this happens, reset the model's scale and position in the model settings.
<a id="h3-1-1"></a>
### > Feature H3-1-1
In some past versions, an additional option could be seen in the top-right corner of the main window:
- "websocket status" — located at the top right; click to open the connection settings, where you can configure your WebSocket server address.
<a id="chapter-ed-toeveryeditor"></a>
## > A Final Note — To Every Friend Who Wants to Contribute to This Manual
Although this manual is mostly maintained by unofficial writers yet published on the official website, and its content is usually maintained by the MuGewRayce studio team, we very much hope that every friend who wants to edit this document, or has already edited it, will leave their name in the author section at the top — whether your contribution is to the content or to the formatting. We welcome everyone to enrich and improve this manual together, contributing your own **strength** to the AIRI project and to this manual!
Also, if you, as a non-official person, want to make changes to this manual, you do not need to have any extra concerns — just make the changes and submit a pull request. But again, do not forget to leave your name!
Thank you all for your support and cooperation!
—— Ling Ling (凌柃)
