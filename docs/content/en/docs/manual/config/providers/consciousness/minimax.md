---
title: MiniMax (Mainland China)
description: Configure the Chinese mainland version of MiniMax in AIRI as a chat provider
is_openai_compatible: true
---

This page applies to API Keys created on the MiniMax open platform in mainland China. MiniMax provides a chat API compatible with the OpenAI format; once configured, AIRI can use its models in Consciousness.

::: info Why choose MiniMax?
If you create an API Key on the MiniMax open platform in mainland China, you should choose this service provider. Please use [MiniMax Global](./minimax-global.md) for keys created by overseas platforms.
:::

## Get the API key

1. Open [MiniMax Console](https://platform.minimaxi.com/).
2. Create a new API Key on the API Keys page.
3. Copy the key and keep it in a safe place.

::: warning API Key Security
Do not commit the API key, include it in screenshots, or share it with anyone. Once a key is compromised, immediately revoke it and create a new key in the MiniMax console.
:::

## Configure in AIRI

1. Open **Settings → Providers → Chat → MiniMax**.
2. Paste the API Key into the basic settings.
3. Keep the default Base URL: `https://api.minimaxi.com/v1/`. The API Key, billing and Base URL of mainland China and overseas platforms cannot be mixed.

## Verify configuration

1. **Validate configuration**: AIRI validates the configuration automatically as you edit it. If **Ping API** appears, use it for a live request test.
2. **Select Model →**: After validation succeeds, use this button to open **Settings → Modules → Consciousness**, then select the provider and model.

## Troubleshooting

If the API check fails, verify the API key, available credit or quota, rate limits, and network connection. If AIRI cannot load the model list, enter the exact model ID provided by MiniMax manually on the **Consciousness** page.
