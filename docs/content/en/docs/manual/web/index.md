---
title: Getting started with the web version
description: How to use the web version of Project AIRI
---

## Welcome to AIRI!

When AIRI opens for the first time, optionally use the globe button in the upper-right corner to change the interface language. Then select **Setup with your provider**, or select **Sign in** to use the official AIRI provider.

### Select a Chat provider

Choose a Chat provider such as OpenAI, DeepSeek, or Ollama. For another service that implements the OpenAI API, select **OpenAI Compatible** and enter both its API key and documented Base URL. The screenshot uses SiliconFlow as an example.

![AIRI provider API configuration example](/assets/screenshot-api-example.avif)

### Select model

Select a compatible chat model, then select **Save and Continue**.

::: tip

Reasoning models may take longer to respond. Choose a non-reasoning model if you prefer faster conversation.

:::

### Start your first conversation

Enter text in the chat box and send it to AIRI.
![AIRI web chat interface](/assets/screenshot-chat.avif)

## Eyes, ears and mouth

In addition to text dialogue, AIRI supports many forms of interaction. Open **Settings → Modules** in the upper-right corner to configure more features.

### Let AIRI speak

Open **Settings → Providers → Speech** to configure a speech provider. Then open **Settings → Modules → Speech** and select the provider, model, and voice.

### Enable voice input

Open **Settings → Providers → Transcription** to configure a transcription provider. Then open **Settings → Modules → Hearing**, select the provider and model, and choose an available microphone. The microphone button on the main page opens the hearing controls.

### Let AIRI see you

Vision support is still experimental. See [Configure vision](../config/vision.md) for the currently supported desktop capture workflow and provider setup.

## Character Card

AIRI has a built-in character card called "ReLU", and you can also write your own character card for the model. You can find the button to switch character cards in the upper right corner of the homepage, or you can switch from the settings.

### Character card content

The character card contains AIRI's name, description, personality, behavior, etc. You can highly customize your AI.

### Character card settings

Character cards can store module preferences. Switching profiles can therefore switch the character and its associated model choices together.
