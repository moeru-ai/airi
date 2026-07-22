---
title: ElevenLabs（TTS）
description: Configuring ElevenLabs speech synthesis in AIRI
---

ElevenLabs synthesizes AIRI responses into speech.

::: info Why choose ElevenLabs?
This provider is your choice if you want to use sounds from your ElevenLabs account and select available sounds directly in AIRI.
:::

## Step 1: Obtain API Key

1. Open and log in [ElevenLabs API Key Settings](https://elevenlabs.io/app/settings/api-keys), then create an API key.
2. Give the key an easily identifiable name and appropriate usage restrictions.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others. If you suspect a leak, please immediately revoke and recreate it in the ElevenLabs console.
:::

## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Speech Synthesis → ElevenLabs**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL of the interface; change it only when using your own compatible gateway.

## Step 3: Verify configuration

1. Select a model and any available voice in the provider settings.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Troubleshooting

If the playground cannot complete a request, check the API Key, account limit, and network connection. When the model can be listed but there is no sound, make sure that a valid model and sound are selected in "Voice".
