---
title: MiniMax Speech (TTS, unavailable)
description: Current availability of MiniMax speech synthesis in AIRI
---

MiniMax Speech appears in AIRI's provider registry, but the current app does not include a MiniMax Speech settings page. Selecting it under **Settings → Providers → Speech** therefore cannot complete a usable configuration.

::: warning Unavailable in AIRI 0.11.3
Do not enter credentials or try to follow a MiniMax setup flow in this version. The provider route is not implemented, and AIRI cannot save or test the required settings from the UI.
:::

## What to use instead

Choose another provider with a working settings page under **Settings → Providers → Speech**. If your service exposes an OpenAI-compatible speech endpoint, use [OpenAI Compatible API (TTS)](./openai.md) and follow the service's documented Base URL and model ID.
