---
title: Atlas Cloud
description: Configure Atlas Cloud as an LLM provider in AIRI
is_openai_compatible: true
---


Atlas Cloud is a chat API provider compatible with the OpenAI format. After completing this page, AIRI can use chat models provided by Atlas Cloud in "Consciousness".


::: info Why choose Atlas Cloud?


If you already have an Atlas Cloud API key, or want to use the models it offers, you can select this provider directly.


:::


## Step 1: Get an API Key


1. Go to [Atlas Cloud](https://api.atlascloud.ai/), register an account, and create an API key.
2. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Atlas Cloud console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Atlas Cloud**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.atlascloud.ai/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Atlas Cloud manually on the "Consciousness" page.

