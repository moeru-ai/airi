---
title: Xiaomi MiMo (ASR/STT)
description: Configuring Xiaomi MiMo Voice Recognition in AIRI
---

MiMo uses its native audio understanding model to complete speech transcription.

::: info Why choose Xiaomi MiMo?
If you already use MiMo, or want to use its multimodal model to process audio content, you can choose this service provider.
:::

## Step 1: Obtain API Key

1. Open and log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/)，确认账户已开通 API usage rights.
2. Create an API Key, copy it and keep it in a safe place.

::: warning API Key and audio data
Don't expose the API Key. Using cloud transcription will send the audio to be recognized to the service provider. Please confirm your data processing requirements first.
:::

## Step 2: Configure in AIRI

1. Fill in the API Key in **Settings → Service Provider → Voice Recognition → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the service provider provides another address.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model**: After the test is successful, select `mimo-v2-omni` or the available model listed on the interface; then go to **Settings → Hearing** to enable it.
3. Allow microphone access and perform a short voice input to confirm that text can be output.

## Troubleshooting

When request fails, check API Key, model selection, and network connection. When there are no text results, confirm that AIRI has obtained the system microphone permission.
