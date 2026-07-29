---
title: OpenRouter
description: Configure OpenRouter as a chat provider in AIRI
is_openai_compatible: true
---

OpenRouter is an aggregation API service provider. After completing the configuration on this page, AIRI can use the chat model provided by OpenRouter in Consciousness.

::: info Why choose OpenRouter?
OpenRouter is convenient when you want to access multiple model vendors with one API key and billing account. You can switch among the models exposed by OpenRouter without configuring each upstream provider separately. Availability still depends on your region, network, payment method, and provider policy.
:::

## Get the API key

1. Open [OpenRouter API Keys](https://openrouter.ai/keys), then create a new API key.
2. Set an appropriate name, validity period, and quota limit for the key.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the OpenRouter console.
:::


## Configure in AIRI

1. Open **Settings → Providers → Chat → OpenRouter**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://openrouter.ai/api/v1/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select an available OpenRouter model.

## Troubleshooting

If pinging the API fails, please check the API key, available credit or quota, rate limits, and network connection. When the model list fails to load, you can manually enter the exact model ID provided by OpenRouter on the Consciousness page.
