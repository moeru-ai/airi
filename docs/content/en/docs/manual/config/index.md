---
title: Provider configuration guide
description: Configure Chat, Vision, Speech, Transcription, and Artistry providers for Project AIRI
---

To let AIRI talk to you, you need to configure at least one chat service provider and one chat model. Speech synthesis (TTS) allows AIRI to speak; speech recognition (ASR/STT) allows it to understand microphone input. These two items are optional, but to obtain a complete voice interaction experience, it is recommended to configure them together.

## Complete the minimum available configuration first

1. Open AIRI’s **Settings → Providers**.
2. Select the service provider in the **Chat** category, fill in the credentials and complete verification.
3. Open **Settings → Modules → Consciousness** and select the service provider and model just configured.
4. Send a message to confirm that AIRI can reply.

After completing the chat configuration, configure the voice as needed:

* **[General Instructions](./common.md)**: Understand the configuration process, field meanings, verification results and FAQs.
* **[Configure Chat Model](./llm.md)**: Configure LLM and select the model in Consciousness.
* **[Configure Speech Input and Output](./audio.md)**: Configure TTS and ASR/STT and enable them in **Modules → Speech** and **Modules → Hearing**.
* **[Configure Visual Understanding](./vision.md)**: Configure a separate Vision provider and select an image-capable model.
* **[Configure Web Search](./web-search.md)**: Use Tavily to let AIRI search the Internet for the latest information when needed.
* **Providers**: Expand **Providers** in the sidebar and select **Chat**, **Vision**, **Speech**, **Transcription**, or **Artistry**. Provider pages save credentials; module pages select which provider and model AIRI actively uses.

> [!TIP]
> If you just want to verify that AIRI works first, configure the chat provider first. TTS and ASR can be added after the chat is working correctly, which makes it easier to locate the problem.

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
