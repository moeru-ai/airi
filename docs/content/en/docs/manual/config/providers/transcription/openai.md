---
title: OpenAI compatible API (ASR/STT)
description: Configuring OpenAI or an OpenAI-compatible API as a speech recognition provider in AIRI
---

This page is used to configure OpenAI or a service provider that provides an OpenAI-compatible transcoding interface. After completing the configuration, select the model in Hearing and test the microphone input.

::: info Why choose OpenAI to be ASR/STT compatible?
If your speech recognition service provider clearly provides an OpenAI-compatible transcription interface, you can access AIRI as described on this page. Merely having an API address ending with `/v1` or a key starting with `sk-` does not guarantee service compatibility.
:::

## Step 1: Obtain API Key

1. Log in to the management console of the selected service provider.
2. Create an API Key on the API Key or Developer Settings page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the provider console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Recognition → OpenAI Compatible API**.
2. Fill in the API Key and the ASR/STT model ID to be used.
3. When using OpenAI official services, keep the default Base URL: `https://api.openai.com/v1/`; when using compatible services, fill in the API root address provided by the service provider's documentation.

## Step 3: Verify configuration

1. Select the configured service provider and model in Hearing, and select the audio input device.
2. Click "Start Monitoring" and then speak into the microphone or play an audio clip.
3. Confirm that the text can be output in real time in the transcription area; if the recognition result is inaccurate, you can adjust the sensitivity and test again.

## Troubleshooting

If there are no text results, please first confirm that the system has granted AIRI microphone permission. When using a compatible service, please confirm that it clearly supports the OpenAI translation interface and the filled-in model ID.
