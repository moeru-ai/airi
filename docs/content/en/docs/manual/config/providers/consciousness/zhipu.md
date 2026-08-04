---
title: Zhipu AI
description: Configure Zhipu AI as an LLM provider in AIRI
is_openai_compatible: true
---


Zhipu AI offers a chat API compatible with the OpenAI format. After completing this page, AIRI can use models provided by Zhipu AI in "Consciousness".


::: info Why choose Zhipu AI?


If you want to use Zhipu AI models in AIRI, or already have its API key, you can select this provider directly.


:::


## Step 1: Get an API Key


1. Open [Zhipu AI API Keys](https://open.bigmodel.cn/usercenter/apikeys).
2. Create a new API key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Zhipu AI console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Zhipu AI**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://open.bigmodel.cn/api/paas/v4/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Zhipu AI manually on the "Consciousness" page.

