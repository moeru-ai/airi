---
title: Volcano Engine (TTS)
description: Configuring Volcano Engine speech synthesis in AIRI
---

Volcengine speech synthesis requires an API Key and application information in AIRI.

::: info Why choose Volcengine?
If you have created a voice application and managed voice resources in Volcengine, you can reuse those settings in AIRI.
:::

## Prepare application credentials

1. Log in to the [Volcengine Speech console](https://console.volcengine.com/speech/app), then create or open a speech application.
2. Copy the **App ID** of the application and create the corresponding **API Key**.
3. Confirm that both pieces of information come from the same account and application configuration.

::: warning API Key Security
Do not submit the API Key or App ID to the repository, include screenshots, or send it to others. Once either the key or ID is compromised, immediately revoke it and create a new key in the Volcengine console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Volcano Engine**.
2. Enter the API key and App ID. The default Base URL is the AIRI/UnSpeech gateway at `https://unspeech.hyp3r.link/v1/`, not Volcengine's direct API. Your credentials, text to synthesize, model/voice selection, and returned audio pass through this gateway. Use it only if you accept that trust boundary; otherwise enter a compatible self-hosted gateway URL or choose a direct provider.

## Verify configuration

1. Select an available voice in the provider playground. This page uses AIRI's default Volcengine speech model.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Volcano Engine**, then select an available model and voice. The provider playground tests credentials; this module selection enables speech for normal AIRI replies.

## Troubleshooting

When verification fails, check whether the App ID and API Key are from the same application. When there is no sound, make sure the app has enabled speech synthesis and selected a voice.
