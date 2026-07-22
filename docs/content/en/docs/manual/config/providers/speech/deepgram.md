---
title: Deepgram（TTS）
description: Configuring Deepgram speech synthesis in AIRI
---

Deepgram offers the Aura family of speech synthesis models in AIRI.

::: info Why choose Deepgram?
If you already use Deepgram, or want to choose from the Aura range of voices, you can use this integration.
:::

## Step 1: Obtain API Key

1. Open and log in to the [Deepgram Console](https://console.deepgram.com/)，在项目的 API Key page to create a key.
2. Confirm that the project has permission to use speech synthesis.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → Deepgram** and paste the API Key into the basic settings.
2. Keep the default Base URL of the interface; only modify it when deploying a compatible gateway yourself.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model and sound**: After the test is successful, select the Aura model and sound, and then go to **Settings → Sound** to enable it.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When pinging the API fails, check the project API Key, account permissions, and network connection. When the tone list is empty, retest your credentials before selecting a model.
