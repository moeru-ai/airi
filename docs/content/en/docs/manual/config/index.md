---
title: Service Provider Configuration Guide
description: Configure chat, vision, text-to-speech, and speech recognition services for Project AIRI
---


To have AIRI talk with you, you need to configure at least one chat provider and one chat model. Text-to-speech (TTS) lets AIRI speak; speech recognition (ASR/STT) lets it understand microphone input. Both are optional, but we recommend configuring them together for the full voice interaction experience.


## Set Up a Minimal Working Configuration First


1. Open AIRI's **Settings → Providers**.
2. In the **Chat** category, select a provider, enter the credentials, and complete verification.
3. Open **Settings → Consciousness**, and select the provider and model you just configured.
4. Send a message to confirm that AIRI can reply.


Once chat is configured, configure voice as needed:


* **[General Instructions](./common.md)**: learn about the configuration flow, field meanings, verification results, and common issues.
* **[Configure a Chat Model](./llm.md)**: configure an LLM and select a model in "Consciousness".
* **[Configure Voice Input and Output](./audio.md)**: configure TTS and ASR/STT, and enable them in "Speech" and "Hearing".
* **[Configure Vision Understanding](./vision.md)**: let AIRI use a model that supports image input from the configured chat providers.
* **[Configure Web Search](./web-search.md)**: use Tavily to let AIRI search the web for up-to-date information when needed.
* **Providers**: expand the "Providers" menu in the sidebar and enter the corresponding configuration guide by chat, text-to-speech, speech recognition, or artistry. For artistry, choose ComfyUI for local workflows, or Replicate or Nano Banana for cloud generation.


> [!TIP]
> If you just want to verify that AIRI works, configure a chat provider first. TTS and ASR can be added after chat works, which makes it easier to troubleshoot.


## Settings


After configuring providers, you can also change AIRI's theme color in Settings, or switch between Live2D (2D) and VRM (3D) models.


<video autoplay loop muted>
 <source src="./assets/tutorial-basic-open-settings.mp4" type="video/mp4" />
</video>


When configuring providers, prefer the default addresses and model names provided by the provider documentation. Do not guess the Base URL, model ID, or region parameters; they differ from provider to provider.


### Changing Models


You can replace the default model with other Live2D (2D) models or VRM (3D models, similar to Grok Companion, provided that you own these models).


Model settings are located under [Settings] -> [Model].


::: tip Importing a model from VTuber Studio?


The library we use to render Live2D models may have trouble reading ZIP files packaged by VTuber Studio, because VTuber Studio uses some files that the Live2D engine cannot recognize.


Therefore, when compressing a VTuber Studio model into a ZIP file before importing it, make sure to exclude the following files:


-`items_pinned_to_model.json`


:::


<br />


::: tip There Are Still Some Bugs


Model scene reloading does not work as expected yet.


After loading a model, you need to restart AIRI for the change to take effect.


:::


<br />

<video autoplay loop muted>
 <source src="./assets/tutorial-settings-change-model.mp4" type="video/mp4" />
</video>

