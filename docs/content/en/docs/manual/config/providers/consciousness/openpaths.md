---
title: OpenPaths
description: Configure OpenPaths as an LLM provider in AIRI
is_openai_compatible: true
---


OpenPaths is a chat API provider compatible with the OpenAI format. After completing this page, AIRI can use chat models provided by OpenPaths in "Consciousness".


::: info Why choose OpenPaths?


If you already have an OpenPaths API key, or want to use the models it offers, you can select this provider directly.


:::


## Step 1: Get an API Key


1. Go to [OpenPaths](https://openpaths.io/), register an account, and create an API key.
2. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the OpenPaths console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → OpenPaths**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://openpaths.io/v1`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


If Ping API fails, check the API key, account credits, and network connection. If the model list cannot be loaded, enter the exact model ID provided by OpenPaths manually on the "Consciousness" page.

