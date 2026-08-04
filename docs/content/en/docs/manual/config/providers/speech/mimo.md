---
title: Xiaomi MiMo (TTS)
description: Configure Xiaomi MiMo text-to-speech in AIRI
---


MiMo supports three text-to-speech modes: preset voices, voice design, and voice cloning.


::: info Why choose Xiaomi MiMo?


If you need preset Chinese voices, or want to design a voice using a text description, you can select MiMo.


:::


## Step 1: Get an API Key


1. Open and sign in to the [Xiaomi MiMo platform](https://platform.xiaomimimo.com/) and confirm the account has API access enabled.
2. Create an API key, copy it, and store it securely.


::: warning Voice Samples and API Key Security


Voice cloning requires audio samples in Base64 data URI format. Only upload voices you have the right to use; do not expose the API key or other people's voice samples.


:::


## Step 2: Configure in AIRI


1. Fill in the API key under **Settings → Providers → Text-to-Speech → Xiaomi MiMo**.
2. Keep the default Base URL: `https://api.xiaomimimo.com/v1/`, unless the provider offers another address.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, select a preset voice, voice design, or voice cloning model, and enable it under **Settings → Speech**.
3. Enter a short text and preview it. Voice design needs a style description; voice cloning also needs a valid voice sample.


## Troubleshooting


If requests fail, check the API key and model selection. If voice cloning fails, confirm the sample is a valid Base64 data URI and that you have the right to use that voice.

