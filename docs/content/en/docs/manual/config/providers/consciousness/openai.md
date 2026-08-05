---
title: OpenAI and Compatible APIs
description: Configure OpenAI or OpenAI-compatible chat services in AIRI
is_openai_compatible: true
---


Choose **OpenAI** when using the official OpenAI address; choose **OpenAI-compatible API** when using a third-party compatible address. After configuration, AIRI can use the chat models of the corresponding provider in "Consciousness".


::: info Why choose OpenAI or a compatible API?


If you already have an OpenAI API key, or your provider explicitly offers an OpenAI-compatible chat interface, you can use this configuration method. An API address ending in `/v1` or a key starting with `sk-` does not guarantee compatibility.


:::


## Step 1: Get an API Key


1. When using OpenAI's official service, open [OpenAI API Keys](https://platform.openai.com/api-keys) to create an API key; when using a compatible service, open the corresponding provider's management console.
2. Create an API key on the API keys or developer settings page.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the provider console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → OpenAI** or **OpenAI-compatible API**.
2. Paste the API key into the basic settings.
3. When using OpenAI's official service, keep the default Base URL: `https://api.openai.com/v1`; when using a compatible service, fill in the API root address from the provider's documentation, without appending the `/chat/completions` path.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. When using a compatible service, confirm it explicitly supports the OpenAI Chat Completions API, and check that the Base URL is the root address specified by the provider's documentation.

