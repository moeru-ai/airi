---
title: Mistral
description: Configure Mistral as an LLM provider in AIRI
is_openai_compatible: true
---


Mistral offers a chat API compatible with the OpenAI format. After completing this page, AIRI can use models provided by Mistral in "Consciousness".


::: info Why choose Mistral?


If you are already using Mistral models, or want to try its multilingual models in AIRI, you can select this provider.


:::


## Step 1: Get an API Key


1. Open the [Mistral console](https://console.mistral.ai/).
2. Create a new API key on the API keys page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Mistral console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Mistral**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.mistral.ai/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by Mistral manually on the "Consciousness" page.

