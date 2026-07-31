---
title: Perplexity
description: Configure Perplexity as a chat provider in AIRI
is_openai_compatible: true
---

Perplexity provides a chat API compatible with the OpenAI format. After completing the configuration on this page, AIRI can use the models provided by Perplexity in Consciousness.

::: info Why choose Perplexity?
You can choose this provider if you already have a Perplexity API account and want to use its available models in AIRI.
:::

## Get the API key

1. Open [Perplexity API Settings](https://www.perplexity.ai/settings/api).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the Perplexity console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Perplexity**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.perplexity.ai/`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID provided by Perplexity manually on the **Consciousness** page.
