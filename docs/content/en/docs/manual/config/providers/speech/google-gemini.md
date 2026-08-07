---
title: Google Gemini (TTS)
description: Configure Google Gemini audio text-to-speech in AIRI
---


Google Gemini audio text-to-speech uses Gemini credentials and models that support audio output.


::: info Why choose Google Gemini?


If you already configured Google Gemini in AIRI and want to use audio output under the same provider, you can select this option.


:::


## Step 1: Get an API Key


1. Open and sign in to [Google AI Studio](https://aistudio.google.com/app/apikey) and create an API key.
2. Confirm the account can use Gemini models that support audio output.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the Gemini API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Fill in the Gemini API key under **Settings → Providers → Speech → Google Gemini**.
2. Keep the default Base URL shown on the page, unless you use an enterprise gateway or a compatible proxy.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model and Voice**: after the test succeeds, choose a model that supports speech output from the listed models, then enable it under **Settings → Speech**.
3. Enter a short text and preview it to confirm it plays normally.


## Troubleshooting


If verification fails, check the API key, regional availability on the account, and network connection. If requests succeed but there is no sound, confirm the selected model actually supports audio output.

