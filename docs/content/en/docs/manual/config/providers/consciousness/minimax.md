---
title: MiniMax (Mainland China)
description: Configure the mainland China version of MiniMax as an LLM provider in AIRI
is_openai_compatible: true
---


This page applies to API keys created on the MiniMax open platform in mainland China. MiniMax offers a chat API compatible with the OpenAI format; after configuration, AIRI can use its models in "Consciousness".


::: info Why choose MiniMax?


If you created your API key on the MiniMax open platform in mainland China, you should select this provider. For keys created on the overseas platform, use [MiniMax Global](./minimax-global.md).


:::


## Step 1: Get an API Key


1. Open the [MiniMax console](https://platform.minimaxi.com/).
2. Create a new API key on the API keys page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the MiniMax console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → MiniMax**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.minimaxi.com/v1/`. API keys, billing, and Base URLs for the mainland China and overseas platforms cannot be mixed.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by MiniMax manually on the "Consciousness" page.

