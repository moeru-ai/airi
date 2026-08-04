---
title: Anthropic
description: Configure Anthropic Claude chat models in AIRI
---


The Anthropic provider lets AIRI use Claude chat models. AIRI uses Anthropic's API address and your API key; the model list is built into AIRI, so you do not need to fill in a Base URL or model ID manually to get started.


::: info Why choose Anthropic?


If you are already using the Claude API, or want to use Claude models in AIRI, you can select Anthropic directly.


:::


## Step 1: Create an API Key


1. Open and sign in to the [Anthropic console](https://platform.claude.com/settings/keys), create an API key, and confirm the account has API access enabled.
2. Set an appropriate name, expiration, and spending limit for the key.
3. Copy the key and store it securely.


::: warning API Key Security


Do not commit the API key to the repository, put it in screenshots, or share it with others. If the key leaks, revoke it immediately in the Anthropic console and create a new one.


:::


## Step 2: Configure in AIRI


1. Open **Settings → Providers → Chat → Anthropic**.
2. Paste the API key into the basic settings.
3. Keep the default Base URL: `https://api.anthropic.com/v1/`.


## Step 3: Verify the Configuration


1. **Ping API**: click this button to test network connectivity and whether the API key is correct.
2. **Select Model**: after the test succeeds, click here to choose the specific model you want to use.


## Troubleshooting


Ping API checks network connectivity and sends a very short chat request. If it fails, confirm the API key is valid, the account has credits, and the network can reach the Anthropic API.


If the model picker does not show the expected model, update AIRI first or enter the exact model ID provided by the provider manually on the "Consciousness" page.

