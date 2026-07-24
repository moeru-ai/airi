---
title: MiniMax Speech（TTS）
description: Configuring MiniMax speech synthesis in AIRI
---

MiniMax Speech provides speech synthesis models and preset sounds in AIRI.

::: info Why choose MiniMax Speech?
If you already use MiniMax and want to use its Chinese or English preset sounds directly, you can select it.
:::

## Step 1: Obtain API Key

1. Open and log in to [MiniMax Open Platform](https://platform.minimaxi.com/), then enable API access.
2. Create a key on the API Key management page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → MiniMax Speech** and paste the API Key.
2. Keep the default service address `https://api.minimax.io` unless the service provider explicitly provides another address.

## Step 3: Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Troubleshooting

If the playground cannot complete a request, check the API Key, account limit, and network connection. When a model or sound is unavailable, the list currently open in the MiniMax account will prevail.
