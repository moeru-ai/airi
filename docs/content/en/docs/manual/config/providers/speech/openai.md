---
title: OpenAI-compatible API (TTS)
description: Configure OpenAI or an OpenAI-compatible API as a text-to-speech provider in AIRI
---


This page covers configuring OpenAI or providers that offer an OpenAI-compatible speech interface. After configuration, select a model and voice under "Speech".


::: info Why choose OpenAI-compatible TTS?


If your speech provider explicitly offers an OpenAI-compatible speech synthesis interface, you can connect it to AIRI with the same configuration approach. An API address ending in `/v1` or a key starting with `sk-` does not guarantee compatibility.


:::


## Step 1: Get an API Key


1. Sign in to the management console of the provider you chose.
2. Create an API key on the API keys or developer settings page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the provider console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Text-to-Speech → OpenAI-compatible API**.
2. Fill in the API key and the TTS model ID you want to use.
3. When using OpenAI's official service, keep the default Base URL: `https://api.openai.com/v1/`; when using a compatible service, fill in the API root address from the provider's documentation.
4. Adjust the speech speed as needed.


## Step 3: Verify the Configuration


1. Select the configured provider, model, and voice under "Speech".
2. Enter some test text and click test.
3. If the speech plays normally, the configuration was successful; if an error is shown, check the credentials, model ID, and Base URL according to the error message.


## Troubleshooting


If there is no sound, first confirm that a model and voice supported by the provider are selected. When using a compatible service, confirm it explicitly supports the OpenAI speech synthesis interface.

