---
title: CometAPI (ASR/STT)
description: Configuring CometAPI speech recognition in AIRI
---

CometAPI provides audio transcription through its compatible interface.

::: info Why choose CometAPI?
If you have used CometAPI to manage models and credentials, you can directly reuse the same API Key in AIRI for speech recognition.
:::

## Obtain API Key

1. Log in to [CometAPI Console](https://www.cometapi.com/console/token), then create an API key.
2. Confirm that the account can access an audio-transcription model, then copy the key and store it securely.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone.
:::

## Configure in AIRI

1. Open **Settings → Providers → Transcription → Comet API** and fill in the API Key.
2. In **Model Name**, enter the exact model ID from the CometAPI model catalog, for example `whisper-1`.
3. Keep the default Base URL: `https://api.cometapi.com/v1/`. Modify it only when using a proxy or compatible gateway.

## Verify configuration

1. Make sure that **Model Name** contains the exact model ID from the CometAPI model catalog.
2. Use the playground on the same page, allow microphone access, and record a short sample to confirm that text is returned.

## Enable microphone transcription

Open **Settings → Modules → Hearing** and select **Comet API**. Make sure that the model matches **Model Name**, then choose a microphone and run the Hearing test. Testing the provider page alone does not enable microphone transcription.

## Troubleshooting

If the playground cannot complete a request, check the API Key, account permissions, and network connection. If no text appears, confirm that AIRI has microphone access.
