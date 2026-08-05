---
title: Z.ai
description: Configure Z.ai as an LLM provider in AIRI
is_openai_compatible: true
---


Z.ai offers a chat API compatible with the OpenAI format. After completing this page, AIRI can use models provided by Z.ai in "Consciousness".


::: info Why choose Z.ai?


If you want to use Z.ai models in AIRI, or already have its API key, you can select this provider directly.


:::


## Step 1: Get an API Key


1. Open [Z.ai API Keys](https://open.bigmodel.cn/usercenter/apikeys).
2. Create a new API key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Z.ai console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Z.ai**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.z.ai/api/paas/v4`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Z.ai manually on the "Consciousness" page.

