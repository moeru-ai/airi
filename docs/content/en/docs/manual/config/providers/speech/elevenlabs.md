---
title: ElevenLabs (TTS)
description: Configuring ElevenLabs speech synthesis in AIRI
---

ElevenLabs synthesizes AIRI responses into speech.

::: info Why choose ElevenLabs?
Choose this provider to use voices from your ElevenLabs account and select them directly in AIRI.
:::

## Obtain API Key

1. Log in to [ElevenLabs API Key Settings](https://elevenlabs.io/app/settings/api-keys), then create an API key.
2. Give the key an easily identifiable name and appropriate usage restrictions.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. If you suspect a leak, please immediately revoke and recreate it in the ElevenLabs console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → ElevenLabs**.
2. Paste the API Key into the basic settings.
3. The default Base URL is the AIRI/UnSpeech gateway at `https://unspeech.hyp3r.link/v1/`, not ElevenLabs' direct API. Your API key, text to synthesize, model/voice selection, and returned audio pass through this gateway. Use it only if you accept that trust boundary; otherwise enter a compatible self-hosted gateway URL or choose a provider that connects directly.

## Verify configuration

1. Select an available voice in the provider playground. This page uses AIRI's default ElevenLabs model.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **ElevenLabs**, then select an available model and voice. The playground test alone does not enable the provider for normal replies.

## Troubleshooting

If the playground cannot complete a request, check the API key, subscription character quota, rate limits, and network connection. If models load but no audio plays, confirm that a valid model and voice are selected under **Settings → Modules → Speech**.
