---
title: Together AI
description: Configure Together AI as an LLM provider in AIRI
is_openai_compatible: true
---


Together AI offers a chat API compatible with the OpenAI format. After completing this page, AIRI can use models provided by Together AI in "Consciousness".


::: info Why choose Together AI?


If you already deploy or use models on Together AI, you can reuse the corresponding API key directly.


:::


## Step 1: Get an API Key


1. Open [Together AI API Keys](https://api.together.ai/settings/api-keys).
2. Create a new API key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Together AI console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Together AI**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.together.xyz/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Together AI manually on the "Consciousness" page.

