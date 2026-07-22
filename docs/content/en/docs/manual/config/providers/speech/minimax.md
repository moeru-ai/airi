---
title: MiniMax Speech（TTS）
description: Configuring MiniMax speech synthesis in AIRI
---

MiniMax Speech provides speech synthesis models and preset sounds in AIRI.

::: info Why choose MiniMax Speech?
If you already use MiniMax and want to use its Chinese or English preset sounds directly, you can select it.
:::

## Step 1: Obtain API Key

1. Open and log in to [MiniMax Open Platform](https://platform.minimaxi.com/)，开通 API usage rights.
2. Create a key on the API Key management page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → MiniMax Speech** and paste the API Key.
2. Keep the default service address `https://api.minimax.io` unless the service provider explicitly provides another address.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API Key is filled in correctly.
2. **Select model and sound**: After the test is successful, select an available model and sound such as `speech-2.8-hd` or `speech-2.8-turbo`, and then go to **Settings → Speech** to enable it.
3. Enter the short text to listen and confirm that it can be played normally.

## Troubleshooting

When pinging the API fails, check the API Key, account limit, and network connection. When a model or sound is unavailable, the list currently open in the MiniMax account will prevail.
