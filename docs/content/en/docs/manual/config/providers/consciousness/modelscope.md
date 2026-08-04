---
title: ModelScope
description: Configure ModelScope chat models in AIRI
---


ModelScope provides chat models in AIRI through its inference API.


::: info Why choose ModelScope?


If you already manage model access on ModelScope, you can use this card to fill in the corresponding API key directly.


:::


## Step 1: Get an API Key


1. Open and sign in to [ModelScope](https://modelscope.cn/) and create an API key in the account console.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → ModelScope** and fill in the **API Key**. The default Base URL is `https://api-inference.modelscope.cn/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, choose a model, then enable it under **Settings → Consciousness**.


## Troubleshooting


If Ping API fails, check the API key, account status, and network connection. If the model list cannot be loaded, keep the Base URL at its default value, or enter the exact model ID provided by ModelScope on the "Consciousness" page.

