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

After the service provider configuration is completed, you can also change the theme color of AIRI in the settings, or switch between Live2D (2D) and VRM (3D) models.

<video autoplay loop muted playsinline preload="metadata" poster="/assets/tutorial-basic-open-settings-poster.avif">
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

When configuring a service provider, use the default address and model name from its documentation whenever possible. Don't guess at the Base URL, model ID, or region parameters; they vary by provider.

### Change model

You can replace the default model with another Live2D (2D) model or a VRM (3D) model.

Model settings are located in **Settings → Models**.

::: tip Importing a model from VTuber Studio?
The library we use to render Live2D models may have problems reading ZIP files packaged by VTuber Studio because VTuber Studio uses some files that the Live2D engine does not recognize.
Therefore, when compressing a VTuber Studio model into a ZIP file before importing, make sure to exclude the following files:

- `items_pinned_to_model.json`
:::

<br />

::: tip Model changes
The stage observes model-setting changes and reloads the selected renderer automatically. If an imported model itself fails to load, check its package structure and assets before restarting AIRI.
:::
<br />

<video autoplay loop muted playsinline preload="metadata" poster="/assets/tutorial-settings-change-model-poster.avif">
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
