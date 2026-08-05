---
title: Fireworks AI
description: Configure Fireworks AI as an LLM provider in AIRI
is_openai_compatible: true
---


Fireworks AI offers a chat API compatible with the OpenAI format. After completing this page, AIRI can use models provided by Fireworks AI in "Consciousness".


::: info Why choose Fireworks AI?


If you already manage models or inference services on Fireworks AI, you can reuse the same API credentials directly.


:::


## Step 1: Get an API Key


1. Open [Fireworks AI API Keys](https://fireworks.ai/account/api-keys).
2. Create a new API key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Fireworks AI console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Fireworks AI**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.fireworks.ai/inference/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Fireworks AI manually on the "Consciousness" page.

