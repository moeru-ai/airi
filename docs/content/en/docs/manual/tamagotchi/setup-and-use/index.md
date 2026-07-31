---
title: Project AIRI Manual
authors:
  - name: MuGewRayce
    aliases:
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
---
This manual corresponds to AIRI 0.11.3.

::: warning Before you begin
- Some AIRI features and operations are not covered in detail in this manual.
- The Chinese edition is the source version. Other language editions are machine-translated and lightly edited manually, so their wording may differ from the app. Always refer to the app if there are discrepancies.
- This manual is based on research by its contributors and may be incomplete, inaccurate, or out of date.
- The manual focuses on the desktop app and includes selected web tutorials. The two versions differ in some areas, so follow the app when they conflict.
- AIRI updates may change the documented behavior. This manual describes the version current when it was written; refer to the app and current release notes for later versions.
- If you have any questions about this manual, please leave a message at @jhicefair or @0x_selenic_dove in the [Project AIRI Official Discord](https://discord.gg/TgQ3Cu2F7A) channel.
- Join the WeChat group: Open the [WeChat group description](https://github.com/moeru-ai/airi/blob/main/docs/wechat.md), scan the QR code to add the admin's WeChat, and include `AIRI` in the join request; the admin will invite you to join the group.
- Join the QQ group: Open the [QQ group invitation link](https://qun.qq.com/universal-share/share?ac=1&authKey=9g00d%2BZS7nORzcJugNNddJ7rCghZTIR7fhXabGwch2S%2BG%2BKGIKwlN1N2nIqkh2jg&busi_data=eyJncm91cENvZGUiOiIxMDU4MTU2Njk3IiwidG9rZW4iOiJmcnkra1hWNFIxNytEcG0zcHRUdVJIaldlRDFxN0dzK080QWtvTEdOQjJkNEY2eUFta1g1clNpbkxSMS9FQWFYIiwidWluIjoiMTI2MDkwNzMzNSJ9&data=b1eJrwn3GVOUh7YIxZ7l9vHQo99HPmRxKPpMKlDCmfzx8Y57IXb2EZCMaOC9rVTd2U558qpNjwUYUWlPHxVHvg&svctype=4&tempid=h5_group_info), then use QQ to confirm joining; if the link is invalid, refer to the latest link in the repository README.
- For other questions about AIRI, join the community discussion on Discord, WeChat, or QQ.
- Have fun chatting with your AI companion! :)
:::

<a id="chapter-1-installation"></a>
## Chapter 1: Installation

Go to the [latest Project AIRI release](https://github.com/moeru-ai/airi/releases/latest), expand **Assets**, and download the file for your device. Open the package and follow the installation prompts. Replace `<version>` below with the value used by the current release.

| Platform | Device | File to download |
| --- | --- | --- |
| Windows | x64 or Windows 11 ARM64 | `AIRI-<version>-windows-x64-setup.exe` |
| macOS | Apple silicon (M series) | `AIRI-<version>-darwin-arm64.dmg` |
| macOS | Intel | `AIRI-<version>-darwin-x64.dmg` |
| Linux | x64 Debian systems such as Ubuntu | `AIRI-<version>-linux-amd64.deb` |
| Linux | x64 RPM systems such as Fedora, openSUSE | `AIRI-<version>-linux-x86_64.rpm` |
| Linux | ARM64 Debian systems such as Ubuntu | `AIRI-<version>-linux-arm64.deb` |
| Linux | ARM64 RPM systems such as Fedora, openSUSE | `AIRI-<version>-linux-aarch64.rpm` |
| Android | Android devices, including supported HarmonyOS devices | `AIRI-<version>-android.apk` |
| iOS/iPadOS | iPhone, iPad | The `.ipa` asset for iOS/iPadOS |

::: info About Windows installation
The installer can install AIRI for the current user or for everyone. A current-user installation does not require administrator rights. Installing for everyone requires administrator rights and makes AIRI available to every user on the computer.
:::

::: info About iPhone and iPad installation
Only IPA files are currently provided. They must be signed and installed manually; detailed installation instructions are not yet available.

The project team plans to release a TestFlight testing link in the future.
:::

::: info About HarmonyOS
A native HarmonyOS version is not currently available. If you use HarmonyOS NEXT, use Zhuoyitong (卓易通) to install the Android version of AIRI.
:::

<a id="chapter-2-initial-configuration"></a>
## Chapter 2: Initial configuration

Before you start using AIRI, you need at least one chat provider and an available chat model. Cloud services usually require an API key or a login account; local services require starting the model service first.

Complete the initial configuration as follows:

1. Open AIRI and start the onboarding flow.
2. On the welcome screen, optionally click the <span class="i-lucide:globe inline-block align-[-0.125em]" aria-hidden="true"></span> **globe button** in the upper-right corner to change the interface language.
3. Select **Setup with your provider** to use your own provider, or **Sign in** to use AIRI's official provider. If you are unsure which provider to use, start with [AIRI Official Provider](../../config/providers/consciousness/official.md), [OpenRouter](../../config/providers/consciousness/openrouter.md), [OpenAI Compatible](../../config/providers/consciousness/openai.md), or a local [Ollama](../../config/providers/consciousness/ollama.md) instance.
4. If you use your own provider:
    1. Select the provider you would like to use and click **Next**.
    2. Enter your API key, change the Base URL if necessary, and click **Next**.
    3. If an analytics notice is shown, review it and click **Next**.
    4. Select the chat model you plan to use and click **Save and Continue**.
5. To use AIRI's official provider, see [AIRI official provider](../../config/providers/consciousness/official.md).

Congratulations! You have completed AIRI's initial configuration.

::: tip Just configure the chat first
Once the chat provider and model are successfully configured, AIRI can reply to messages. Later, you can add capabilities such as speech synthesis (TTS), speech recognition (ASR/STT), visual understanding, and art creation. You can refer to [Voice Input and Output](../../config/audio.md), [Visual Understanding](../../config/vision.md) or [Art Creation](#chapter-4-art) to learn how to configure.
:::

::: warning API Key security
API Keys, AccessKey Secrets, and other service credentials should only be saved on your device. Do not commit them to the repository, post them to an issue, take screenshots, or send them to others.
:::

<a id="chapter-3-interface-overview"></a>
## Chapter 3: AIRI interface overview

<a id="chapter-3-main-window"></a>
### Main window

This section focuses on the desktop app. It also applies to many parts of the web and mobile apps; their unique features are introduced [here](#chapter-3-main-web).

This window displays the virtual character. Its primary controls are:

- **Expand** - Located in the lower right corner; click it to show more controls.
- **Open hearing Controls** - Opens the voice-input controls.
::: info Hearing control
First enable microphone input and select the microphone; if prompted for permission, allow AIRI to use the microphone. After configuring the transcription service, speech can be transcribed and sent to the current chat session. AIRI pauses input while speaking to reduce feedback.
:::

- **Drag to move window** - Hold the left mouse button and drag to move the main window.

Click **Expand**. The available controls are:

- **Sign in** — sign in to your AIRI account.
- **Open settings** — open AIRI's settings interface.
- **Switch Profile** — switch profiles.
- **Open Chat** — open the chat window.
- **Refresh** — refresh the main window.
- **Move to screen center** — moves the window to the center of the screen.
- "Switch to dark mode"/"Switch to light mode" - switch AIRI's interface theme.
- "Pin on top"/"Unpin from top" - control whether the AIRI window stays above other windows.
- "Auto hide"/"Always show" - control whether the AIRI window gets out of the way when you move the pointer over it.
- **Close** — close AIRI with one click.

![Expanded AIRI main-window control menu](./assets/manual-controls-island-expanded.avif)

<a id="chapter-3-system-tray"></a>
### Other system tray options

Find the AIRI icon in the Windows taskbar or macOS menu bar.

::: tip If you can't find the taskbar/menu bar icon...
On Windows, you may need to click "Show hidden icons (⌃)" on the taskbar to expand it to find the AIRI icon.

On a MacBook with a display notch, the AIRI icon may not fit in the visible menu bar. Open **System Settings → Menu Bar** and hide another menu bar item to make room.
:::

Right-click the AIRI icon to open the tray menu. The available entries depend on the current platform and app state:

- **Show** — show the main window.
- **Adjust sizes** — resize and center the main window. It contains four options:
  - **Recommended (450x600)** — Set to the recommended size of 450x600.
  - **Full Height** — Make the height of the main window fill the height of the desktop.
  - **Half Height** — Make the height of the main window half the height of the desktop.
  - **Full Screen** — Make the main window fill the entire desktop.
- **Align to** — align the main window to a specific desktop position. It contains five options:
  - **Center** — Align to the middle of the desktop.
  - **Top Left** — Align to the upper-left corner of the desktop.
  - **Top Right** — Align to the upper-right corner of the desktop.
  - **Bottom Left** — Align to the lower-left corner of the desktop.
  - **Bottom Right** — Align to the lower-right corner of the desktop.
- **Settings...** — open the settings interface.
- **About...** — open the About window to view the version, visit the project homepage, update AIRI, or select the update channel.
- **Open Inlay...** — open an experimental window for testing Electron vibrancy and background-material effects. It is not the Spotlight prompt.
- **Open Widgets...** — open the widget window. Widgets supplied by maps, weather, art, or extensions appear here; the window may be empty when no corresponding tool or extension is running.
- **Open Caption...** / **Close Caption...** — open or close captions. When TTS is enabled, captions display AIRI's spoken text and are hidden by default while the pointer hovers over them.
- **Caption Overlay** — contains two options:
  - **Follow window** — This mode is selected by default. The caption window then moves with the main window; if unchecked, its position is independent.
  - **Reset position** — Reset the caption position.
- **Quit** — Close AIRI.



<a id="chapter-3-settings-overview"></a>
### Settings

::: info Scope of this section
This part only introduces what is in the interface. See Chapter 4 for specific functions.
:::

You can open the settings interface in the following two ways:

- Click **Expand** in the main window and select **Open settings**.
- Right-click the AIRI icon in the system tray and select **Settings...**.

The settings navigation includes:

- **AIRI Card** - Select and configure the active character.
- **Modules** - Configure AIRI features such as Consciousness, Speech, Hearing, Vision, and integrations.
- **Scenes** - Configure the active character's background.
- **Models** - Select, import, and configure the character display model.
- **Memory** - View memory settings as they become available.
- **Providers** - Configure Chat, Vision, Speech, Transcription, and Artistry providers.
- **Data** - Export, reset, or remove locally stored AIRI data.
- **Connection** - Configure the AIRI WebSocket server and remote access.
- **System** - Contains **General**, **Color Scheme**, **Window Shortcuts**, and **Developer** pages. See [Desktop Developer Tools](/en/docs/contributing/desktop-developer-tools) for the developer-only pages.

![AIRI settings overview](./assets/manual-settings-window.avif)

<a id="chapter-3-chat-window"></a>
### Chat window

You can click **Expand** in the main window and then select **Open Chat** to open the chat window.

![AIRI chat window](./assets/manual-chat-window.avif)

Here you can chat with AIRI. After speech synthesis is enabled, **Stop speaking** appears while AIRI is reading a reply; clicking it stops the current speech playback without cancelling the generated text reply.

Click **Conversations** in the chat-window title bar, or click the title itself, to open the conversation list. Conversations are ordered by their most recent update and show a preview and synchronization status. You can switch or delete conversations, or create a new conversation for the current character. Deletion is usually unrecoverable, so confirm that you no longer need the content.

<a id="chapter-4-settings"></a>
## Chapter 4: Settings

You can open the settings interface in the following two ways:

- Click **Expand** in the main window and select **Open settings**.
- Right-click the AIRI icon in the system tray and select **Settings...**.

<a id="chapter-4-airi-card"></a>
### AIRI Card

Here you can import, create, edit, and activate character cards.

![AIRI character card settings](./assets/manual-airi-card.avif)

::: info About import and export
Character cards can be imported or exported as AIRI character card packs. Card packs use Character Card V3 data and may include a Live2D, Spine, Tachie, or VRM display model. During import, AIRI validates the package manifest and character-card data; packages with an invalid format or missing required files cannot be imported. AIRI Card packs use an explicit field whitelist and are not lossless CCv3 backups; see the [Character Card Template](../character-card-template.md) for details.
:::

To create a character card:

1. Fill in the identity section, including name, nickname, description, and creator notes.
2. Add behavior details such as personality, scenario, and greetings.
3. Configure the character's preferred capabilities under **Modules**.
4. Configure image-generation preferences under **Artistry**, if needed.
5. Review **Settings**, including the system prompt, post-history instructions, and card version.
6. Click **Create**.
7. Activate the new card by clicking the control in its lower-right corner, or open the card and click **Activate**.

The most important identity fields are the character's name and description:

- The name is the character name currently shown by AIRI. Although Character Card V3 supports a `nickname` field, the current interface and runtime still display `name`.
- The description tells the model who the character is. Use the default character card as a reference when you need an example.

::: info Editor's notes
- The default ReLU prompt explains AIRI's `ACT` tokens for stage emotions and actions. Keep equivalent instructions in a custom card if you want the model to control those behaviors; omitting them can reduce or remove action and emotion output.
- Creator notes are only notes for character cards and will not affect the AIRI response results.
- Behavior defines personality, scenario, and greetings. Modules can specify chat, Vision, Speech, and display-model preferences. Artistry stores image-generation preferences. Settings contains the system prompt, post-history instructions, and card version.
:::

::: warning Requires manual activation
Creating a character card does not activate it automatically. Use the card's activation control before starting a conversation with it.
:::

<a id="chapter-4-modules"></a>
### Modules

Configure AIRI's active capabilities here.

![AIRI module settings](./assets/manual-modules.avif)

#### Consciousness

Open **Settings → Modules → Consciousness** to select the active chat provider and model. See [Chat Model](../../config/llm.md) for the complete provider-to-model flow.
![AIRI Consciousness settings](./assets/manual-consciousness.avif)

#### Speech
Open **Settings → Modules → Speech** to select the active speech provider, model, and voice. See [Voice Input and Output](../../config/audio.md) for configuration. If you do not want AIRI to speak, select **None**.
::: tip Supplementary instructions for the Speech page
- Select the provider and model first, then select a supported voice. Different providers expose different fields.
- Pitch only affects providers and models that support this parameter.
:::

![AIRI Speech settings](./assets/manual-speech.avif)

#### Hearing
Open **Settings → Modules → Hearing** to select the transcription provider, model, and audio input. See [Voice Input and Output](../../config/audio.md) for configuration. If you are not using voice input yet, select **None**.

::: info Speech recognition (ASR/STT)

Speech-to-text (STT), also called automatic speech recognition (ASR), converts spoken audio into text.
:::

::: info Using voice input on macOS
The first time you use voice input on macOS, allow AIRI to access the microphone when prompted.
![macOS permission prompt](image-7.png)
:::

![AIRI Hearing settings](./assets/manual-hearing.avif)

In addition, you can:

- Enable the Auto-send transcribed text feature for automatic sending.
- Disable it to review or edit a transcription before sending it.
- Use **Auto-send delay** to change how long AIRI waits before sending.

::: info Automatic sending
When auto-send is enabled, the recognized text will be sent to the chat session after a set delay; when it is turned off, you can check or modify the text before sending it manually.
:::

If you want to test the microphone:

1. Click **Start Monitoring**.
2. Adjust **Sensitivity** if necessary.

If you want to test STT functionality:

1. Click **Start Speech-to-Text Test**.
2. Review the recognized text under **Transcription Result**.

#### Vision
Open **Settings → Modules → Vision** to select the active vision provider and image-capable model and to set **Capture interval**. See [Visual Understanding](../../config/vision.md) for the complete flow.

![AIRI Vision settings](./assets/manual-vision.avif)

::: warning Before using screen vision, you need to start Vision Capture
When configuring only the vision service provider and model, there is no need to enable this tool.

To have AIRI analyze your screen or window, open **System → Developer → Vision Capture**, grant screen-recording permission, select a window or display, and click **Start ticker**. To send the results to the current character, enable **Publish to character**.

Vision Capture is the current desktop debugging/development workflow; leaving the page will stop the capture loop. For complete instructions, see [Desktop Developer Tools](/en/docs/contributing/desktop-developer-tools#vision-capture).
:::


<a id="chapter-4-art"></a>
#### Artistry (artistic creation)

Here you can configure AIRI's ability to create art.

Open **Settings → Providers → Artistry** to configure an image provider, then enable it under **Settings → Modules → Artistry**.

::: warning Tool calling for interactive Artistry
In the ordinary interactive Artistry flow, AIRI makes the configured image tool available to the current **chat model**, which calls the tool to submit the generation task. This flow requires a provider and model that support **Tool Calling / Function Calling**.

Under **Settings → Modules → Consciousness**, select a model that the provider explicitly marks as supporting tool calling. Models limited to ordinary text conversations may respond with text without submitting a task to the selected image service.

After configuration, ask the character to generate a simple image. Confirm that AIRI initiates a tool call; if the provider offers task status, history, or a console, you can also confirm that it received the task. After the task returns an image, AIRI displays the result. See the corresponding page under **Settings → Providers → Artistry** for provider-specific verification.

The character-card option **Cinematic Autonomy (Autonomous Artist)** uses a separate text-analysis flow and invokes the selected image provider directly, so that mode does not require LLM tool calling.
:::

#### Short-term memory

This feature is not available yet. If you have ideas for its implementation, submit an issue or pull request.

#### Long term memory

This feature is not available yet. If you have ideas for its implementation, submit an issue or pull request.

#### Discord

Discord integration requires running the bot service from source to allow AIRI to enter the Discord server's messaging and voice channels.

1. Create a Discord application and enable the required Intents described in the [Discord Bot Integration Guide](/en/docs/integrations/discord).
2. Start the Discord bot service from the repository.
3. In AIRI, open **Settings → Connection** and copy the **Auth Token** into the bot service configuration.
4. Open **Settings → Modules → Discord**, enter the **Bot Token**, turn on **Enable Discord Integration**, and click **Save**. The running bot service receives this configuration from AIRI.

::: warning Credential security
The Bot Token, AIRI Auth Token, and optional transcription credentials should only be saved in local configuration. Do not submit, screenshot, or send these values.
:::

#### X / Twitter

The X / Twitter settings form is present, but the integration is not functional in AIRI 0.11.3. Do not enter credentials. See the [X / Twitter Integration Guide](/en/docs/integrations/x) for the current implementation limitation.

#### Web search

Open **Settings → Modules → Web Search**, then follow the [Web Search Configuration Guide](../../config/web-search.md) to configure the Tavily API Key and learn about usage, privacy tips, and FAQs.

#### Minecraft

Minecraft integration requires running a local agent service from source. Follow the [Minecraft Agent Integration Guide](/en/docs/integrations/minecraft) to configure the trusted server, AIRI, and model services, and then start the agent.

::: warning Security reminder
Do not connect Minecraft agents to untrusted public servers. It drives local Minecraft sessions and network connections, and malicious servers can cause unexpected behavior.
:::

::: tip Integration Service Documentation
Instructions for running integration services from source are in the **Integration Services** section of the documentation sidebar.
:::

#### Factorio

Open **Settings → Modules → Factorio**, then follow the [Factorio Integration Guide](/en/docs/integrations/factorio) to enter the trusted server address, port, and in-game username. AIRI does not include a ready-to-deploy Factorio server-side integration.

#### MCP Server

MCP (Model Context Protocol) allows AIRI to use external tools through local processes. On desktop, open **Settings → Modules → MCP Server**, click **Add server**, then fill in **Identifier**, **Command**, **Arguments**, and any optional **Working directory** or **Environment** values. Use **Test** to test the selected server, then click **Save and restart** to write the configuration and restart MCP. **Reveal in file manager** and **Edit JSON** are also available for direct configuration maintenance. Only run MCP servers that you trust: they can execute commands locally and access environment variables that you grant.

#### Beat Sync

Open **Settings → Modules → Beat Sync**. Beat Sync analyzes audio from a selected screen or window and sends beat signals to the stage effects. Click **Start screen capture** and select the source containing audio; use **Stop** to end capture. The page provides sensitivity, minimum beat interval, advanced filtering parameters, and real-time spectrum and beat visualizations. First use may require system screen-recording permission.

<a id="chapter-4-stage"></a>
### Scenes

Scenes are backgrounds for AIRI's main interface.

The **Scene Gallery** shows the backgrounds currently available to AIRI. Hover over an inactive scene and click its check button to make it the active character background.

Click **Upload to Gallery** to import an image.

To remove the active background, click **Clear Default**.

<a id="chapter-4-character-model"></a>
### Models

Here you can select and set up your character's model.

![AIRI character model settings](./assets/manual-models.avif)

AIRI supports Live2D, Spine 2D, VRM 3D, MMD, and Tachie models.

If you just want to switch an existing model, we recommend the following steps:

1. Click **Select model** to open the **Model Selector**.
2. Click **Pick** on the model you want to use.
3. Click **Confirm** to complete the switch.

To import your own model, open **Model Selector** and use **Import**. The selector accepts:

- Live2D: `.zip`
- VRM: `.vrm`
- Spine: `.zip`
- MMD: `.zip`, `.pmx`, or `.pmd`
- Tachie: `.tachie.zip`

::: info Godot Stage (Experimental)
**Switch to Godot Stage (Experimental)** starts the separate Godot stage renderer; click **Back to Built-in Stage** to switch back. Godot Stage currently supports only VRM models. With a VRM model selected, you can adjust camera X/Y/Z, yaw, pitch, and field of view in Godot View. Status and model-loading errors also appear there.
:::

::: warning Before importing a model
- Older Live2D formats are not supported. The model package must include a `.moc3` file.
- Compress the complete Live2D model folder as a `.zip` file before importing it.
- Spine models also use `.zip`; VRM uses a single `.vrm` file.
:::

#### If you select a Live2D model

You can continue to adjust in the following order:

1. Expand **Scale and Position** to adjust the model's size and position. X controls horizontal position and Y controls vertical position.
2. Expand **Parameters** to configure mouse tracking, idle animation, frame rate, blinking, shadows, model-cache clearing, and model-specific parameters.
3. To use an idle animation, ensure that the imported package includes animation files.
4. Expand **Expressions** and enable **Expression System** to use expressions included with the model.

When speech synthesis is enabled, AIRI automatically restores Live2D's mouth state after speech playback.

::: info Parameters and expressions
The parameters, standby animations and expressions available to the model are determined by the model file itself. After the Expression System is enabled, only the expressions actually provided by the model will be displayed; if there are no expressions or animation files, the corresponding options will have no effect.
:::

#### If you select the Spine 2D model

The Spine model provides a separate settings panel. You can adjust scaling, X/Y position, skins, variants, idle animations, animation blend time and playback speed, as well as limit frame rate and adjust render scale. If the model contains available skins, variants, or animations, they will appear in the corresponding drop-down options; missing assets will not be displayed.

#### If you select a VRM 3D model

Expand **Scene** to adjust model position, viewing angle, camera distance, Y-axis rotation, and gaze direction.

::: info VRM perspective
Position, rotation, camera distance and gaze direction in the built-in stage are saved to the current settings.
:::

<a id="chapter-4-memory-bank"></a>
### Memory

The function has not been released yet. If you have ideas for implementing this feature, please submit suggestions via issues or PR.

<a id="chapter-4-providers"></a>
### Providers

**Providers** is where AIRI connects to model, voice, transcription, and image services. Enter provider credentials here, then select the provider and model on the corresponding module page.

You can choose categories by purpose:

- **Chat**: Configure a chat model so AIRI can reply to messages. At least one working Chat provider is required.
- **Vision**: Configure a vision model for image understanding; then select it under **Modules → Vision**.
- **Speech**: Configure text-to-speech; then select the provider, model, and voice under **Modules → Speech**.
- **Transcription**: Configure speech-to-text; then select the provider and model under **Modules → Hearing**.
- **Artistry**: Configure an image-generation service; then select it under **Modules → Artistry**.

If you skip onboarding, configure a chat provider first: enter its API key or account details and any required advanced fields, such as Base URL or region. Wait for automatic validation and use **Ping API** when it is available. Then open **Modules → Consciousness**, select the provider and model, and send a message.

After switching chat providers, the selected chat model is cleared. Return to **Modules → Consciousness** to select a model for the new provider.

::: warning Credential security
Save API Keys, AccessKey Secrets, and other service credentials only in settings on your device. Do not commit them to the repository, post them in an issue, include them in screenshots, or send them to anyone.
:::

::: tip Configuration guide
- If you are unsure about provider fields, validation methods, or errors, read [Common Configuration Instructions](../../config/common.md).
- To configure the chat model, read [Chat Model](../../config/llm.md) and choose a provider under **Settings → Providers → Chat**.
- To configure voice input and output, read [Voice Input and Output](../../config/audio.md). Speech and Transcription providers are under **Settings → Providers** and are enabled from their corresponding module pages.
- Vision providers store their own credentials, even when their fields match the corresponding Chat provider. See [Visual Understanding](../../config/vision.md) for details.
:::

![AIRI service provider settings](./assets/manual-providers.avif)

::: tip Technical advice
The provider list depends on the installed AIRI version. If an unlisted provider implements an OpenAI-compatible interface, use the corresponding **OpenAI Compatible** entry and enter the exact Base URL and model ID from that provider's documentation.
:::

<a id="chapter-4-data"></a>
### Data

Manage AIRI's locally stored data here.

::: warning Unrecoverable operation
Deletion and reset operations in this section cannot be undone. Confirm the selected data before continuing.
:::

![AIRI Data settings](./assets/manual-data-settings.avif)

Use **Move desktop window to center** to restore the desktop stage to the center of the current screen.

::: tip Web version feature description
Opening the app data folder and resetting desktop settings and status are only available in the desktop version, not in the web/mobile version of the app.
:::

<a id="chapter-4-connection"></a>
### Connection

**Connection** configures AIRI's service channel. You can set the **WebSocket Server Address** and enable **Enable Secure WebSocket (WSS)** when encrypted transport is required. On desktop, **Expose On Network** can be set to **This device**, **All**, or **Advanced**; the Advanced option reveals **Bind Hostname**. You can also set an **Auth Token** and use the QR code to connect Stage Pocket. Expose AIRI only on trusted networks and keep the token private.

![AIRI Connection settings](./assets/manual-websocket-settings.avif)

::: tip macOS may require administrator verification
When secure WebSockets are enabled, AIRI adds the local certificate to the macOS login keychain. You may be asked to authorize this action using Touch ID or entering your Mac login password. Verify your fingerprint or Mac login password to continue.
![macOS administrator verification](image-16.png)
:::


<a id="chapter-4-system"></a>
### System

#### General

Configure AIRI's theme, language, and general behavior here.

![AIRI System general settings](./assets/manual-system-general.avif)

- **Theme** switches between light and dark mode.
- **Language** sets the interface language; the selection is retained after restarting AIRI.
- **Controls Island Icon Size** changes the desktop control-island icon size.
- **Enable usage analytics** controls anonymous usage analytics when analytics are available in the current build. The description links to the privacy policy.

#### Color scheme

Configure AIRI's theme colors here.

![AIRI color scheme settings](./assets/manual-system-color-scheme.avif)

- You can activate the RGB option to make the theme colors change automatically like an RGB light strip.
- You can also drag the black line below or click in the color bar to change the theme color.
- Below it is a preview of the color effect.
- You can also directly select the preset below to change the theme color.

::: tip Color presets
Click a color swatch to apply its preset.
:::

#### Window Shortcuts
Here you can modify the **Spotlight** global shortcut. Spotlight is AIRI's floating prompt input.

1. Click the current shortcut key.
2. Press the new key combination you want to use; it must contain at least one modifier key: Cmd, Ctrl, Alt, or Super.
3. If the shortcut key is occupied by other applications, AIRI will prompt a conflict; press Esc to cancel recording.
4. Click **Reset** to restore the default shortcut.

::: tip Use Spotlight
Press the configured shortcut to open Spotlight. Enter a request and press Enter; AIRI hides Spotlight and displays the result in a notification. Press Esc to close it without sending.
:::

#### Developer

This page is used to develop, troubleshoot, and verify experimental features; regular users do not need it. Complete tool descriptions are available in [Developer Guide → Developer Tools](/en/docs/contributing/desktop-developer-tools).

<a id="web-features"></a>
## Web-version features

<a id="chapter-3-main-web"></a>
### Web main interface

![AIRI web interface](./assets/manual-main-web.avif)

The web interface contains the character stage, chat area, and account and display controls.

#### Chat box

The upper area displays chat history. The lower area contains the message input and controls for conversations, sending behavior, and voice input.

#### Other parts

##### Upper area

The upper area provides access to **About**, **Characters**, and the account menu. When signed in, the account menu shows the current name and Flux balance, followed by **Profile**, **Flux**, **Settings**, and **Sign out**.

###### Profile

**Profile** opens account management. Depending on how the account was created, you can update the display name, manage the password and connected sign-in methods, or delete the account from the danger zone. The current avatar is displayed as account information, but this page does not provide avatar upload.

###### Flux

Flux is the balance used by AIRI's official services. After signing in, open **Flux** to view the balance, usage statistics, and transaction history. When purchasing is enabled for the current deployment, you can choose an available package; AIRI Desktop completes checkout in the system browser. Requests to official chat, vision, or speech services may consume Flux. Third-party providers bill usage separately.

###### Settings

**Settings** opens the same configuration areas described in [Chapter 4](#chapter-4-settings), although desktop-only controls are not available on the web.

##### Lower area

The lower-right controls provide six actions:

- open saved conversations;
- mute or unmute speech output;
- adjust character position and size;
- clear the current conversation;
- switch between light and dark themes;
- change the background.

###### Position and size

Open the position-and-size control to adjust the character's X position, Y position, and scale. The vertical control on the left side of the stage provides another way to adjust the view.

![Adjusting the main window position and size](./assets/web-position-size.avif)

###### Clear the current conversation

Select the trash button to clear messages and context from the active conversation. Other saved conversations are not deleted.

::: warning Proceed with caution
Cleared messages cannot be restored.
:::

###### Switch between light and dark

Select the sun or moon button to switch between the light and dark themes.

###### Background

Select the background button to choose a different stage background.

<a id="features-issues"></a>
## Troubleshooting and shortcuts

### FAQ

- After an upgrade, a model may appear to be missing if its saved size or position places it outside the visible area. Reset the model's scale and position under **Settings → Models**.

<a id="h3-1-1"></a>
### Connection status shortcut

On surfaces that display **WebSocket Status** in the upper-right area, click it to open **Connection** and configure the **WebSocket Server Address**.


<a id="chapter-ed-toeveryeditor"></a>
## Contributing to this manual

This community-maintained manual is published with the official AIRI documentation. Contributions that improve its accuracy, wording, screenshots, or formatting are welcome. Submit a pull request and add yourself to the author list when your contribution is substantial.

Thank you for helping improve AIRI's documentation.

——Ling Zhen
