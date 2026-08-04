---
title: OpenRouter (TTS)
description: Configure OpenRouter as a text-to-speech provider in AIRI
---


OpenRouter is an aggregator API provider. After configuration, select the speech models and voices provided by OpenRouter under "Speech".


::: info Why choose OpenRouter speech?


If you want to manage multiple models and speech capabilities in the same OpenRouter account, you can select this provider. When using AIRI in mainland China, you may want to try 302.AI first; actual availability still depends on your network environment, payment method, and provider policies.


:::


## Step 1: Get an API Key


1. Open [OpenRouter API Keys](https://openrouter.ai/keys) and create a new API key.
2. Set an appropriate name, expiration, and spending limit for the key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the OpenRouter console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Text-to-Speech → OpenRouter**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://openrouter.ai/api/v1/`.


## Step 3: Verify the Configuration


1. Select the configured provider, model, and voice under "Speech".
2. Enter some test text and click test.
3. If the speech plays normally, the configuration was successful; if an error is shown, check the credentials and model according to the error message.


## Troubleshooting


If there is no sound, confirm the selected model provides speech output, and check the account credits and network connection.

