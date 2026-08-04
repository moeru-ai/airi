---
title: Novita AI
description: Configure Novita AI as an LLM provider in AIRI
is_openai_compatible: true
---


Novita AI offers a chat API compatible with the OpenAI format. After completing this page, AIRI can use models provided by Novita AI in "Consciousness".


::: info Why choose Novita AI?


If you already manage model services on Novita AI, you can reuse the provider's API key directly.


:::


## Step 1: Get an API Key


1. Open the [Novita AI console](https://novita.ai/dashboard).
2. Create a new API key on the API keys page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Novita AI console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Novita AI**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.novita.ai/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Novita AI manually on the "Consciousness" page.

