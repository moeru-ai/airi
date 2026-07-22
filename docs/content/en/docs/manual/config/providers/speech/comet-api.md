---
title: CometAPI（TTS）
description: Configuring CometAPI speech synthesis in AIRI
---

CometAPI provides speech synthesis through its compatible interface.

::: info Why choose CometAPI?
If you already use CometAPI to manage models and credentials, you can reuse the API Key directly in AIRI.
:::

## Step 1: Obtain API Key

1. Open and log in to [CometAPI Console] (https://www.cometapi.com/console/token)，创建 API Key.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → CometAPI Speech** and fill in the API Key.
2. Keep the default Base URL: `https://api.cometapi.com/v1/`; modify it only when using a proxy or compatible gateway.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select models and sounds**: After the test is successful, select the available models and sounds, and then go to **Settings → Sound** to enable.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When verification fails, check the API Key, account balance, and network connection. When the model list is empty, confirm that the account can currently access the voice model.
