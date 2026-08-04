---
title: xAI
description: Configure xAI Grok chat models in AIRI
---


The xAI provider lets AIRI use Grok chat models. It is configured in the same way as common API-key providers.


::: info Why choose xAI?


If you already have an xAI API account and want to use Grok models in AIRI, you can select this provider.


:::


## Step 1: Create an API Key


1. Open and sign in to the [xAI developer console](https://console.x.ai/) and create an API key.
2. Confirm the account has API usage enabled and available credits.
3. Copy the key.


::: warning API Key Security


Only store the API key in a password manager or AIRI's local settings. Do not write the key into code, commit it to the repository, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → xAI**.
2. Fill in the API key.
3. Keep the default Base URL: `https://api.x.ai/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, first check the API key, account credits, and network connection. If the model list is unavailable, you can enter the model ID given in the xAI documentation manually on the "Consciousness" page.

