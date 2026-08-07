---
title: ElevenLabs (TTS)
description: Configure ElevenLabs text-to-speech in AIRI
---


ElevenLabs can synthesize AIRI's replies into speech.


::: info Why choose ElevenLabs?


If you want to use the voices in your ElevenLabs account and select available voices directly in AIRI, you can choose this provider.


:::


## Step 1: Get an API Key


1. Open and sign in to the [ElevenLabs API Key settings](https://elevenlabs.io/app/settings/api-keys) and create a key.
2. Give the key a recognizable name and appropriate usage limits.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If you suspect a leak, revoke it immediately in the ElevenLabs console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Speech → ElevenLabs**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL shown on the page; only change it when using your own compatible gateway.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, select the model and the voice you want under **Settings → Speech**.
3. Enter a short text and preview it; if the speech plays normally, the configuration was successful.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If models are listed but there is no sound, confirm a valid model and voice are selected under "Speech".

