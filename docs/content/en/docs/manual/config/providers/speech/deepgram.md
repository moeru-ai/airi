---
title: Deepgram (TTS)
description: Configure Deepgram text-to-speech in AIRI
---


Deepgram provides the Aura series of text-to-speech models in AIRI.


::: info Why choose Deepgram?


If you already use Deepgram, or want to pick a voice from the Aura series, you can use this integration.


:::


## Step 1: Get an API Key


1. Open and sign in to the [Deepgram Console](https://console.deepgram.com/) and create a key on the project's API key page.
2. Confirm the project has text-to-speech access enabled.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → Deepgram** and paste the API key into the basic settings.
2. Keep the default Base URL shown on the page; only change it when you self-host a compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, choose an Aura model and voice, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If Ping API fails, check the project API key, account permissions, and network connection. If the voice list is empty, retest the credentials and then select a model.

