---
title: MiniMax Global
description: Configure the overseas version of MiniMax as an LLM provider in AIRI
is_openai_compatible: true
---


This page applies to API keys created on the MiniMax overseas platform. After configuration, AIRI can use chat models provided by MiniMax Global in "Consciousness".


::: info Why choose MiniMax Global?


If you created your API key on the MiniMax overseas platform, or use an overseas Token Plan, you should select MiniMax Global. For keys created on the mainland China platform, use [MiniMax (Mainland China)](./minimax.md); API keys, billing, and Base URLs for the two platforms cannot be mixed.


:::


## Step 1: Get an API Key


1. Open and sign in to the [MiniMax Global platform](https://platform.minimax.io/).
2. Create a pay-as-you-go API key under **API Keys**; if you use a Token Plan, obtain its dedicated key from the corresponding subscription page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately on the MiniMax Global platform and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → MiniMax Global**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.minimax.io/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.
3. Select MiniMax Global and the model under **Settings → Consciousness**, and send a short message to confirm AIRI can reply.


## Troubleshooting


If Ping API fails, confirm the API key comes from the overseas platform, the Base URL is `https://api.minimax.io/v1/`, and check the account credits and network connection. A 401 error is commonly caused by mixing keys or addresses between the mainland China and overseas platforms. If the model list cannot be loaded, enter the exact model ID provided by MiniMax Global manually on the "Consciousness" page.

