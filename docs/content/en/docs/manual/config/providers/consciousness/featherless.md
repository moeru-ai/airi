---
title: Featherless.ai
description: Configure Featherless.ai chat models in AIRI
---


Featherless.ai provides chat models in AIRI through its compatible API.


::: info Why choose Featherless.ai?


If you already have model access enabled on Featherless.ai, you can use its API key to configure AIRI directly.


:::


## Step 1: Get an API Key


1. Open and sign in to [Featherless.ai](https://featherless.ai/) and create an API key in the account console.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Featherless.ai** and fill in the **API Key**. The default Base URL is `https://api.featherless.ai/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose a model, then enable it under **Settings → Consciousness**.


## Troubleshooting


If Ping API fails, check the API key, account status, and network connection. If the model list cannot be loaded, keep the Base URL at its default value, or enter the exact model ID provided by Featherless.ai on the "Consciousness" page.

