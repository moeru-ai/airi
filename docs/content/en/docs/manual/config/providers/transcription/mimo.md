---
title: Xiaomi MiMo (ASR/STT)
description: Configure Xiaomi MiMo speech recognition in AIRI
---


MiMo uses its native audio understanding models to perform speech transcription.


::: info Why choose Xiaomi MiMo?


If you already use MiMo, or want to use its multimodal models to process audio content, you can select this provider.


:::


## Step 1: Get an API Key


1. Open and sign in to the [Xiaomi MiMo platform](https://platform.xiaomimimo.com/) and confirm the account has API access enabled.
2. Create an API key, copy it, and store it securely.


::: warning API Key and Audio Data


Do not expose the API key. Cloud transcription sends the audio to be recognized to the provider; make sure this matches your data processing requirements first.


:::


## Step 2: Configure in AIRI


1. Fill in the API key under **Settings → Providers → Transcription → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the provider offers another address.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose `mimo-v2-omni` or an available model listed on the page, then enable it under **Settings → Hearing**.
3. Allow microphone access and do a short voice input to confirm text is produced.


## Troubleshooting


If requests fail, check the API key, model selection, and network connection. If there are no text results, confirm AIRI has system microphone permission.

