---
title: Deepgram (TTS)
description: Configuring Deepgram speech synthesis in AIRI
---

Deepgram offers the Aura family of speech synthesis models in AIRI.

::: info Why choose Deepgram?
If you already use Deepgram, or want to choose from the Aura range of voices, you can use this integration.
:::

## Obtain API Key

1. Log in to the [Deepgram Console](https://console.deepgram.com/), then create a key on the project’s API Key page.
2. Confirm that the project has permission to use speech synthesis.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, take screenshots, or send it to others.
:::

## Configure in AIRI

1. Open **Settings → Providers → Speech → Deepgram** and paste the API key.
2. The default Base URL is the AIRI/UnSpeech gateway at `https://unspeech.hyp3r.link/v1/`, not Deepgram's direct API. Your API key, text to synthesize, model/voice selection, and returned audio pass through this gateway. Use it only if you accept that trust boundary; otherwise enter a compatible self-hosted gateway URL or choose a provider that connects directly.

## Verify configuration

1. Select an available Aura voice in the provider playground.
2. Use the playground on the same page to enter a short text and confirm that audio plays.

## Enable for AIRI replies

Open **Settings → Modules → Speech**, select **Deepgram**, then select an available model and voice. The playground test alone does not enable the provider for normal replies.

## Troubleshooting

If the playground cannot complete a request, check the project API Key, account permissions, and network connection. When the voice list is empty, retest your credentials before selecting a model.
