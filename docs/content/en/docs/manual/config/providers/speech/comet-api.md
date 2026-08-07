---
title: CometAPI (TTS)
description: Configure CometAPI text-to-speech in AIRI
---


CometAPI provides text-to-speech through its compatible interface.


::: info Why choose CometAPI?


If you already manage models and credentials with CometAPI, you can reuse that API key in AIRI directly.


:::


## Step 1: Get an API Key


1. Open and sign in to the [CometAPI console](https://www.cometapi.com/console/token) and create an API key.
2. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → CometAPI Speech** and fill in the API key.
2. Keep the default Base URL: `https://api.cometapi.com/v1/`; only change it when using a proxy or a compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, choose an available model and voice, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If verification fails, check the API key, account balance, and network connection. If the model list is empty, confirm the account currently has access to speech models.

