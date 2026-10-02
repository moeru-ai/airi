---
title: Provider configuration guide
description: Configure Chat, Vision, Speech, Transcription, and Artistry providers for Project AIRI
---

To chat with AIRI, configure at least one Chat provider and chat model. Speech synthesis (TTS) adds voice output, while automatic speech recognition (ASR/STT) adds microphone input. Voice input and output are optional and can be configured independently.

## Configure the minimum required setup

1. Open AIRI’s **Settings → Providers**.
2. Select a provider in the **Chat** category, enter its credentials, and complete the available verification.
3. Open **Settings → Modules → Consciousness** and select the provider and model you configured.
4. Send a message to confirm that AIRI can reply.

After Chat is working, add voice input or output as needed:

* **[General Instructions](./common.md)**: Understand the configuration process, field meanings, verification results and FAQs.
* **[Configure Chat Model](./llm.md)**: Configure LLM and select the model in Consciousness.
* **[Configure Speech Input and Output](./audio.md)**: Configure TTS and ASR/STT and enable them in **Modules → Speech** and **Modules → Hearing**.
* **[Configure Visual Understanding](./vision.md)**: Configure a separate Vision provider and select an image-capable model.
* **[Configure Web Search](./web-search.md)**: Use Tavily to let AIRI search the Internet for the latest information when needed.
* **Providers**: Expand **Providers** in the sidebar and select **Chat**, **Vision**, **Speech**, **Transcription**, or **Artistry**. Provider pages save credentials; module pages select which provider and model AIRI actively uses.

> [!TIP]
> Configure Chat first if you want to verify the basic setup. Add TTS and ASR afterward to isolate any voice-configuration problems.

## Additional setup

After configuring a provider, you can also change AIRI's theme or switch its display model. The current model selector supports Live2D, Spine, VRM, MMD, and Tachie.

<video autoplay loop muted playsinline preload="metadata" poster="/assets/tutorial-basic-open-settings-poster.avif">
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

When configuring a service provider, use the default address and model name from its documentation whenever possible. Don't guess at the Base URL, model ID, or region parameters; they vary by provider.

### Change model

You can replace the default model with another supported 2D or 3D display model.

Model settings are located in **Settings → Models**.

::: tip Importing a model from VTube Studio?
Compress the complete Live2D model folder as a ZIP file. AIRI ignores VTube Studio's `items_pinned_to_model.json` metadata during import, so you do not need to remove it manually.
:::

<br />

::: tip Model changes
The stage observes model-setting changes and reloads the selected renderer automatically. If an imported model itself fails to load, check its package structure and assets before restarting AIRI.
:::
<br />

<video autoplay loop muted playsinline preload="metadata" poster="/assets/tutorial-settings-change-model-poster.avif">
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
