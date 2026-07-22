---
title: CometAPI（ASR/STT）
description: Configuring CometAPI speech recognition in AIRI
---

CometAPI provides audio transcription through its compatible interface.

::: info Why choose CometAPI?
If you have used CometAPI to manage models and credentials, you can directly reuse the same API Key in AIRI for speech recognition.
:::

## Step 1: Obtain API Key

1. Open and log in to [CometAPI Console](https://www.cometapi.com/console/token), then create an API key.
2. Confirm that the account can access the audio transcription model, copy the key and keep it properly.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Recognition → CometAPI Transcription** and fill in the API Key.
2. Keep the default Base URL: `https://api.cometapi.com/v1/`; modify it only when using a proxy or compatible gateway.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model**: After the test is successful, select an available transcription model; then go to **Settings → Hearing** to enable it.
3. Allow microphone access and perform a short voice input to confirm that text can be output.

## Troubleshooting

When pinging the API fails, check the API Key, account permissions, and network connection. When there are no text results, confirm that AIRI has obtained the system microphone permission.
