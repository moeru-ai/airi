---
title: Cerebras
description: Configure Cerebras chat models in AIRI
---


Cerebras provides chat models in AIRI through its compatible API.


::: info Why choose Cerebras?


If you already use the Cerebras API and want to call the models available on your account in AIRI, you can select it.


:::


## Step 1: Get an API Key


1. Open and sign in to [Cerebras Cloud](https://cloud.cerebras.ai/) and create an API key.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Cerebras** and fill in the **API Key**. The default Base URL is `https://api.cerebras.ai/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose a model, then enable it under **Settings → Consciousness**.


## Troubleshooting


If Ping API fails, check the API key, account status, and network connection. If the model list cannot be loaded, keep the Base URL at its default value, or enter the exact model ID provided by Cerebras on the "Consciousness" page.

