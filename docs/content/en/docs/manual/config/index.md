---
title: Service Provider Configuration Guide
description: Configuring chat, vision, speech synthesis, and speech recognition services for Project AIRI
---

To let AIRI talk to you, you need to configure at least one chat service provider and one chat model. Speech synthesis (TTS) allows AIRI to speak; speech recognition (ASR/STT) allows it to understand microphone input. These two items are optional, but to obtain a complete voice interaction experience, it is recommended to configure them together.

## Complete the minimum available configuration first

1. Open AIRI’s **Settings → Service Provider**.
2. Select the service provider in the **Chat** category, fill in the credentials and complete verification.
3. Open **Settings → Consciousness** and select the service provider and model just configured.
4. Send a message to confirm that AIRI can reply.

After completing the chat configuration, configure the voice as needed:

* **[General Instructions](./common.md)**: Understand the configuration process, field meanings, verification results and FAQs.
* **[Configure Chat Model](./llm.md)**: Configure LLM and select the model in Consciousness.
* **[Configure Speech Input and Output](./audio.md)**: Configure TTS and ASR/STT and enable them in "Sounding" and "Hearing".
* **[Configure Visual Understanding](./vision.md)**: Let AIRI use models that support image input in the configured chat provider.
* **[Configure Web Search](./web-search.md)**: Use Tavily to let AIRI search the Internet for the latest information when needed.
* **Service Provider**: Expand the "Service Provider" menu from the sidebar and press Chat, Speech Synthesis, Speech Recognition or Art Creation to enter the corresponding configuration guide. Choose ComfyUI when artistic creation requires local workflow; choose Replicate or Nano Banana when cloud generation is required.

> [!TIP]
> If you just want to verify that AIRI works first, configure the chat provider first. TTS and ASR can be added after the chat is normal, which makes it easier to locate the problem.

## set up

After the service provider configuration is completed, you can also change the theme color of AIRI in the settings, or switch between Live2D (2D) and VRM (3D) models.

<video autoplay loop muted>
 <source src="/assets/tutorial-basic-open-settings.mp4" type="video/mp4">
</video>

When configuring the service provider, give priority to using the default address and model name provided by the service provider document. Don't guess at the Base URL, model ID, or region parameters; they vary by provider.

### Change model

You can replace the default model with another Live2D (2D) model or a VRM (3D model, similar to Grok Companion, if you have those models).

Model settings are located in [Settings] -> [Model].

::: tip Importing a model from VTuber Studio?
The library we use to render Live2D models may have problems reading ZIP files packaged by VTuber Studio because VTuber Studio uses some files that the Live2D engine does not recognize.
Therefore, when compressing a VTuber Studio model into a ZIP file before importing, make sure to exclude the following files:

-`items_pinned_to_model.json`
:::

<br />

::: tip There are still some bugs
Currently the model scene reload feature does not work as expected.
After loading the model, you need to restart AIRI for it to take effect.
:::
<br />

<video autoplay loop muted>
 <source src="/assets/tutorial-settings-change-model.mp4" type="video/mp4">
</video>
