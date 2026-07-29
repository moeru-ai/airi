---
title: OpenAI compatible API (ASR/STT)
description: Configuring OpenAI or an OpenAI-compatible API as a speech recognition provider in AIRI
---

This page configures an OpenAI-compatible transcription API. After saving it, select the provider and model under **Settings → Modules → Hearing** and test microphone input.

::: info Why use an OpenAI-compatible API for ASR/STT?
If your speech recognition service provider clearly provides an OpenAI-compatible transcription interface, you can access AIRI as described on this page. Merely having an API address ending with `/v1` or a key starting with `sk-` does not guarantee service compatibility.
:::

## Obtain API Key

1. Log in to the management console of the selected service provider.
2. Create an API Key on the API Key or Developer Settings page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the provider console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Transcription → OpenAI Compatible API**.
2. Fill in the API Key and the ASR/STT model ID to be used.
3. For official OpenAI, select the separate **OpenAI** provider. The **OpenAI Compatible API** provider has no default Base URL; enter the complete API root documented by the compatible service.

## Verify configuration

1. Select the configured service provider and model in **Settings → Modules → Hearing**, then select the audio input device.
2. Click **Start Monitoring**, then speak into the microphone or play an audio clip.
3. Confirm that the text can be output in real time in the transcription area; if the recognition result is inaccurate, you can adjust the sensitivity and test again.

## Troubleshooting

If there is no text result, confirm that AIRI has microphone permission. For a compatible service, verify that it implements the OpenAI transcription API and supports the entered model ID.
