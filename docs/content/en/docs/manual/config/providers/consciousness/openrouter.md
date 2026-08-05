---
title: OpenRouter
description: Configure OpenRouter as an LLM provider in AIRI
is_openai_compatible: true
---


OpenRouter is an aggregator API provider. After completing this page, AIRI can use chat models offered by OpenRouter in "Consciousness".


::: info Why choose OpenRouter?


If you want to try multiple models in AIRI with a single API key, OpenRouter is a convenient choice. It consolidates many model services into one interface and one bill, so you usually do not need to configure multiple providers separately when switching models. When using AIRI in mainland China, you may want to try 302.AI first; actual availability still depends on your network environment, payment method, and provider policies.


:::


## Step 1: Get an API Key


1. Open [OpenRouter API Keys](https://openrouter.ai/keys) and create a new API key.
2. Set an appropriate name, expiration, and spending limit for the key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the OpenRouter console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → OpenRouter**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://openrouter.ai/api/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use (e.g. **google/gemini-pro-1.5**).


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by OpenRouter manually on the "Consciousness" page.

