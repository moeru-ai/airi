---
title: MiniMax Speech (TTS)
description: Configuring MiniMax speech synthesis in AIRI
---

MiniMax Speech provides speech synthesis models and preset sounds in AIRI.

::: info Why choose MiniMax Speech?
If you already use MiniMax and want to use its Chinese or English preset sounds directly, you can select it.
:::

## Step 1: Obtain API Key

1. Open and log in to the [MiniMax Global Platform](https://platform.minimax.io/), then enable API access.
2. Create a key on the API Key management page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Providers → Speech → MiniMax Speech** and paste the API Key.
2. Keep the global service address `https://api.minimax.io`. Credentials from `platform.minimaxi.com` belong to the China service and must use that platform's documented endpoint instead.

## Step 3: Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **MiniMax Speech**, then choose `speech-2.8-hd` or `speech-2.8-turbo` and an available voice. The provider test alone does not enable speech for normal replies.

## Troubleshooting

If the playground cannot complete a request, check the API Key, account limit, and network connection. When a model or voice is unavailable, the list currently open in the MiniMax account will prevail.
