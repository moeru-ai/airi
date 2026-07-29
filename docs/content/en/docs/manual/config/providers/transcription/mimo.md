---
title: Xiaomi MiMo (ASR/STT)
description: Configuring Xiaomi MiMo Voice Recognition in AIRI
---

MiMo uses its native audio understanding model to complete speech transcription.

::: info Why choose Xiaomi MiMo?
If you already use MiMo, or want to use its multimodal model to process audio content, you can choose this service provider.
:::

## Obtain API Key

1. Log in to [Xiaomi MiMo Platform](https://platform.xiaomimimo.com/), then confirm that the account has API access enabled.
2. Create an API Key, copy it and keep it in a safe place.

::: warning API Key and audio data
Don't expose the API Key. Using cloud transcription will send the audio to be recognized to the service provider. Please confirm your data processing requirements first.
:::

## Configure in AIRI

1. Fill in the API Key in **Settings → Providers → Transcription → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the service provider provides another address.

## Verify configuration

1. Select an available transcription model in the provider settings.
2. Use the playground on the same page, allow microphone access, and record a short sample to confirm that text is returned.

## Enable microphone transcription

Open **Settings → Modules → Hearing**, select **Xiaomi MiMo**, choose model ID `mimo-v2-omni`, then choose a microphone and run the Hearing test. Testing the provider page alone does not enable microphone transcription.

## Troubleshooting

If a request fails, check the API key, model selection, and network connection. If no text is returned, confirm that AIRI has microphone permission.
