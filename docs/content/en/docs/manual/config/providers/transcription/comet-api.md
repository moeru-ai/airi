---
title: CometAPI (ASR/STT)
description: Configure CometAPI speech recognition in AIRI
---


CometAPI provides audio transcription through its compatible interface.


::: info Why choose CometAPI?


If you already manage models and credentials with CometAPI, you can reuse the same API key for speech recognition in AIRI directly.


:::


## Step 1: Get an API Key


1. Open and sign in to the [CometAPI console](https://www.cometapi.com/console/token) and create an API key.
2. Confirm the account can access audio transcription models, copy the key, and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Transcription → CometAPI Transcription** and fill in the API key.
2. Keep the default Base URL: `https://api.cometapi.com/v1/`; only change it when using a proxy or a compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose an available transcription model, then enable it under **Settings → Hearing**.
3. Allow microphone access and do a short voice input to confirm text is produced.


## Troubleshooting


If Ping API fails, check the API key, account permissions, and network connection. If there are no text results, confirm AIRI has system microphone permission.

