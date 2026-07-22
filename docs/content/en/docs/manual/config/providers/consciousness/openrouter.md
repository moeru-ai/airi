---
title: OpenRouter
description: Configuring OpenRouter as a large model service provider in AIRI
is_openai_compatible: true
---

OpenRouter is an aggregation API service provider. After completing the configuration on this page, AIRI can use the chat model provided by OpenRouter in Consciousness.

::: info Why choose OpenRouter?
If you want to try out multiple models in AIRI with one API Key, OpenRouter is a convenient choice. It centralizes multiple model services into the same socket and bill, so when switching models you usually don't have to separately configure multiple service providers. When using AIRI in mainland China, you can try 302.AI first; actual availability still depends on your network environment, payment method, and service provider policies.
:::

## Step 1: Get the API key

1. Open [OpenRouter API Keys](https://openrouter.ai/keys), then create a new API key.
2. Set an appropriate name, validity period, and quota limit for the key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not submit the API Key to the repository, include screenshots, or send it to others. Once a key is compromised, immediately revoke it and create a new key in the OpenRouter console.
:::


## Step 2: Configure in AIRI

1. Open **Settings → Service Provider → Chat → OpenRouter**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://openrouter.ai/api/v1`.

## Step 3: Verify configuration

1. **Ping API**: Click this button to test whether the network is connected and whether the API key is filled in correctly.
2. **Select model**: After the test is successful, click here to select the specific model you want to use (such as **google/gemini-pro-1.5**).

## Troubleshooting

If pinging the API fails, please check the API Key, account limit, and network connection. When the model list fails to load, you can manually enter the exact model ID provided by OpenRouter on the Consciousness page.
