---
title: CometAPI
description: Configure CometAPI chat models in AIRI
---


CometAPI provides chat models in AIRI and also has dedicated TTS and STT provider pages.


::: info Why choose CometAPI?


If you want to configure chat, text-to-speech, and speech recognition under the same CometAPI account, you can select it.


:::


## Step 1: Get an API Key


1. Open and sign in to the [CometAPI console](https://www.cometapi.com/console/token) and create an API key.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → CometAPI** and fill in the **API Key**. The default Base URL is `https://api.cometapi.com/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose a model, then enable it under **Settings → Consciousness**.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, keep the Base URL at its default value, or enter the exact model ID provided by CometAPI on the "Consciousness" page.

