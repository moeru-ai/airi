---
title: Cheaper Inference
description: Configure Cheaper Inference as a chat provider in AIRI
is_openai_compatible: true
---

Cheaper Inference is an LLM gateway with a chat API compatible with the OpenAI format. Each model costs 15–60% less than the list price of its lab. After completing the configuration, select a Cheaper Inference model under **Settings → Modules → Consciousness**.

::: info Why choose Cheaper Inference?
If you already have a Cheaper Inference API Key, or want to use the models it provides, you can choose this service provider directly.
:::

## Get the API key

1. Go to [Cheaper Inference](https://cheaperinference.com/signup) to register an account and create an API Key. Keys start with `ci_live_`.
2. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → Cheaper Inference**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.cheaperinference.com/v1`.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model, for example `gpt-5.4-mini` or `claude-sonnet-5`.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID from the [Cheaper Inference model list](https://cheaperinference.com/#models) manually on the **Consciousness** page.
